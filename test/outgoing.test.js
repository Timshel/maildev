/* global describe, it */
"use strict";
const jest = require("jest-mock");
const expect = require("expect").expect;
const SMTPServer = require("smtp-server").SMTPServer;
const Outgoing = require("../dist/lib/outgoing").Outgoing;
const smptHelpers = require("../dist/lib/helpers/smtp");

let lastPort = 8025;
const getPort = () => lastPort++;

describe("outgoing", () => {
  describe("setup", () => {
    it("should enable outgoing email", (done) => {
      const port = getPort();
      const smtpserver = new SMTPServer();
      smtpserver.listen(port, (err) => {
        expect(typeof err).toBe("undefined");
        const outgoing = new Outgoing();
        outgoing.client.on("end", () => {
          smtpserver.close(done);
        });
        outgoing.close();
      });
    });
  });

  describe("relayMail", () => {
    it("should set auto relay mode without an initialised client", () => {
      const spy = jest.spyOn(require("../dist/lib/logger"), "info");
      const outgoing = new Outgoing();

      // Close the SMTP server before doing anything, an investigation is needed to find where the SMTP connection is not closed
      outgoing.client.on("end", () => {
        outgoing.setAutoRelayMode();

        expect(outgoing.autoRelay).toBe(false);
        expect(spy).toHaveBeenCalledWith("Outgoing mail not configured - Auto relay mode ignored");
        spy.mockRestore();
        outgoing.close();
      });
    });

    it("should set auto relay mode with a wrong rules", (done) => {
      const rules = "testrule";
      const spy = jest.spyOn(require("../dist/lib/logger"), "error");
      const outgoing = new Outgoing();

      // TODO: Use the expect toThrow helper, I will need to update the version of the expect library before being able to do it
      try {
        outgoing.setAutoRelayMode(true, undefined, rules);
      } catch (e) {
        expect(e.message).toBe("ENOENT: no such file or directory, open 'testrule'");
        expect(spy).toHaveBeenCalledWith(
          "Error reading rules file at testrule: Error: ENOENT: no such file or directory, open 'testrule'",
        );
        spy.mockRestore();
        outgoing.close();
        done();
      }
    });

    it("should set an auto relay email address", (done) => {
      const rules = ["test"];
      const emailAddress = "test@test.com";
      const spy = jest.spyOn(require("../dist/lib/logger"), "info");
      const outgoing = new Outgoing();

      outgoing.setAutoRelayMode(true, emailAddress, rules);
      expect(outgoing.autoRelay).toBe(true);
      expect(outgoing.autoRelayRules).toBe(rules);
      expect(outgoing.autoRelayAddress).toBe(emailAddress);

      expect(spy).toHaveBeenCalledWith(
        [
          "Auto-Relay mode on",
          `Relaying all emails to ${emailAddress}`,
          `Relay rules: ${JSON.stringify(rules)}`,
        ].join(", "),
      );

      outgoing.close();
      done();
    });

    it("should send outgoing email", (done) => {
      const port = getPort();
      const email = {
        envelope: {
          to: ["receiver@test.com"],
          from: ["sender@test.com"],
        },
        subject: "Test email",
      };
      const message = "A test email body";
      const outgoing = new Outgoing({ port });

      // When the email is full received we deem this successful
      const emailReceived = (emailBody) => {
        // trim b/c new lines are added
        expect(emailBody.trim()).toBe(message);
        outgoing.close();
        smtpserver.close(done);
      };

      const smtpserver = new SMTPServer({
        authOptional: true,
        onData(stream, session, callback) {
          const chunks = [];
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            emailReceived(Buffer.concat(chunks).toString());
            callback();
          });
        },
      });
      smtpserver.listen(port, (err) => {
        expect(typeof err).toBe("undefined");
        outgoing.relayMail(email, message, false, (err) => {
          expect(err).toNotExist();
          // emailReceived should now be called to close this test
        });
      });
    });

    it("should handle authentication with outgoing smtp server", (done) => {
      const username = "testuser";
      const password = "testpassword";
      const port = getPort();
      const smtpserver = new SMTPServer({
        onAuth: smptHelpers.createOnAuthCallback(username, password),
      });
      const outgoing = new Outgoing({
        port,
        auth: { user: username, pass: password },
      });

      smtpserver.listen(port, (err) => {
        expect(typeof err).toBe("undefined");
        const email = {
          envelope: {
            to: ["receiver@test.com"],
            from: ["sender@test.com"],
          },
          subject: "Test email",
        };
        const message = "A test email body";

        outgoing.relayMail(email, message, false, (err) => {
          expect(typeof err).toBe("undefined");
          outgoing.close();
          smtpserver.close(done);
        });
      });
    });
  });
});
