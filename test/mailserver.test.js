/* global describe, it, before, after */
"use strict";

/**
 * MailDev - mailserver.js -- test the mailserver options
 */

const assert = require("assert");
const SMTPConnection = require("nodemailer/lib/smtp-connection");
const MailServer = require("../dist/lib/mailserver").MailServer;
const nodemailer = require("nodemailer");
const port = 9025;

async function createTransporter(port, auth) {
  return nodemailer.createTransport({
    port: port,
    auth,
  });
}

describe("mailserver", () => {
  let mailServer;
  let transporter;

  before(async () => {
    mailServer = new MailServer({
      port: port,
      auth: { user: "bodhi", pass: "surfing" },
    });
    await mailServer.listen();

    transporter = await createTransporter(port, { type: "login", user: "bodhi", pass: "surfing" });
    return transporter.verify();
  });

  after((done) => {
    mailServer.close().finally(() => {
      done();
    });
  });

  describe("smtp error handling", () => {
    it("Error should be thrown, because listening to server did not work", async () => {
      // https://stackoverflow.com/a/9132271/3143704
      const originalHandler = process.listeners("uncaughtException").pop();
      process.removeListener("uncaughtException", originalHandler);
      process.setMaxListeners(0);
      return new Promise((resolve) => {
        const maildevConflict = new MailServer({
          port: port,
        });
        maildevConflict.listen();

        process.on("uncaughtException", async (err) => {
          if (err.code === "EADDRINUSE") {
            process.listeners("uncaughtException").push(originalHandler);
            await maildevConflict.close();
            resolve();
          }
        });
      });
    });
  });

  describe("smtp authentication", () => {
    it("should require authentication", function (done) {
      const connection = new SMTPConnection({
        port: mailServer.port,
        host: mailServer.host,
        tls: {
          rejectUnauthorized: false,
        },
      });

      connection.connect(function (err) {
        if (err) return done(err);

        const envelope = {
          from: "angelo.pappas@fbi.gov",
          to: "johnny.utah@fbi.gov",
        };

        connection.send(envelope, "They are surfers.", function (err) {
          // This should return an error since we're not authenticating
          assert.notStrictEqual(typeof err, "undefined");
          assert.strictEqual(err.code, "EENVELOPE");

          connection.close();
          done();
        });
      });
    });

    it("should authenticate", function (done) {
      const connection = new SMTPConnection({
        port: mailServer.port,
        host: mailServer.host,
        tls: {
          rejectUnauthorized: false,
        },
      });

      connection.connect(function (err) {
        if (err) return done(err);

        connection.login(
          {
            user: "bodhi",
            pass: "surfing",
          },
          function (err) {
            assert.strictEqual(err, null, "Login should not return error");

            const envelope = {
              from: "angelo.pappas@fbi.gov",
              to: "johnny.utah@fbi.gov",
            };

            connection.send(envelope, "They are surfers.", function (err, info) {
              if (err) return done(err);
              assert.notStrictEqual(typeof info, "undefined");
              assert.strictEqual(info.accepted.length, 1);
              assert.strictEqual(info.rejected.length, 0);

              connection.close();
              done();
            });
          },
        );
      });
    });
  });

  describe("Handle email", () => {
    const emailOpts = {
      from: "johnny.utah@fbi.gov",
      to: "bodhi@gmail.com",
      subject: "Test",
      html: "Test",
    };

    it("should emit received email", async () => {
      const mail = await new Promise((resolve) => {
        mailServer.once("new", function (mail) {
          resolve(mail);
        });
        transporter.sendMail(emailOpts);
      });
      assert.strictEqual(mail.from[0]?.address, emailOpts.from);
      assert.strictEqual(mail.to[0]?.address, emailOpts.to);
      assert.strictEqual(mail.subject, emailOpts.subject);
    });

    it("should emit email with customs subject", async () => {
      const mail = await new Promise((resolve) => {
        mailServer.once(emailOpts.to, function (mail) {
          resolve(mail);
        });
        transporter.sendMail(emailOpts);
      });
      assert.strictEqual(mail.from[0]?.address, emailOpts.from);
      assert.strictEqual(mail.to[0]?.address, emailOpts.to);
      assert.strictEqual(mail.subject, emailOpts.subject);
    });

    it("next should work", async () => {
      const p = mailServer.next(emailOpts.to);
      transporter.sendMail(emailOpts);
      const mail = await p;
      assert.strictEqual(mail.from[0]?.address, emailOpts.from);
      assert.strictEqual(mail.to[0]?.address, emailOpts.to);
      assert.strictEqual(mail.subject, emailOpts.subject);
    });

    it("next should work", async () => {
      const p = mailServer.next(emailOpts.to);

      transporter.sendMail(emailOpts);

      const mail = await p;
      assert.strictEqual(mail.from[0]?.address, emailOpts.from);
      assert.strictEqual(mail.to[0]?.address, emailOpts.to);
      assert.strictEqual(mail.subject, emailOpts.subject);
    });

    it("next should fail with reserved subject", async () => {
      try {
        const p = mailServer.next("close");
      } catch (e) {
        assert.strictEqual(
          e.message,
          "Invalid subject close; close,delete are reserved for internal usage",
        );
      }
    });

    it("Generator should work", async () => {
      const emails = mailServer.generator(emailOpts.to);

      transporter.sendMail(emailOpts);

      let { value: mail } = await emails.next();
      assert.strictEqual(mail.subject, emailOpts.subject);

      // Send two mail, we should only received one
      transporter.sendMail({
        ...emailOpts,
        subject: "Not Dropped1",
      });
      await new Promise((r) => setTimeout(r, 100));
      transporter.sendMail({
        ...emailOpts,
        subject: "Not Dropped2",
      });
      await new Promise((r) => setTimeout(r, 100));
      transporter.sendMail({
        ...emailOpts,
        subject: "Not Dropped3",
      });
      await new Promise((r) => setTimeout(r, 100));
      transporter.sendMail({
        ...emailOpts,
        subject: "Not Dropped4",
      });

      mail = (await emails.next()).value;
      assert.strictEqual(mail.subject, "Not Dropped1");
      mail = (await emails.next()).value;
      assert.strictEqual(mail.subject, "Not Dropped2");
      mail = (await emails.next()).value;
      assert.strictEqual(mail.subject, "Not Dropped3");
      mail = (await emails.next()).value;
      assert.strictEqual(mail.subject, "Not Dropped4");

      transporter.sendMail(emailOpts);
      transporter.sendMail(emailOpts);
      transporter.sendMail(emailOpts);

      await new Promise((r) => setTimeout(r, 100));

      emails.return();
    });

    it("Generator should fail with reserved subject", async () => {
      try {
        const p = mailServer.generator("close");
      } catch (e) {
        assert.strictEqual(
          e.message,
          "Invalid subject close; close,delete are reserved for internal usage",
        );
      }
    });
  });
});
