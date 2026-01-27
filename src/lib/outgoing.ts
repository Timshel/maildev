"use strict";

/**
 * MailDev - outgoing
 */
import type { Mail } from "./type";
import * as logger from "./logger";

const SMTPConnection = require("nodemailer/lib/smtp-connection");
const async = require("async");
const fs = require("fs");
const wildstring = require("wildstring");

export interface OutgoingOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
  autoRelayAddress?: string;
  autoRelayRules?: string | { allow?: string; deny?: string }[];
}

export class Outgoing {
  port: number;
  host: string;
  secure: boolean;
  autoRelay: boolean = false;
  autoRelayAddress: string | undefined;
  autoRelayRules: { allow?: string; deny?: string }[] | undefined;
  auth: { user: string; pass: string } | undefined;

  // The SMTP connection client
  client;
  emailQueue;

  constructor(options?: OutgoingOptions) {
    wildstring.caseSensitive = false;

    this.secure = options?.secure ?? false;
    this.host = options?.host ?? "localhost";
    this.port = options?.port ?? (this.secure ? 465 : 25);
    this.auth = options?.auth;

    createClient(this);

    // Create a queue to sent out the emails
    // We use a queue so we don't run into concurrency issues
    this.emailQueue = async.queue((task, callback) => {
      const relayCallback = function (err, result) {
        task.callback && task.callback(err, result);
        callback(err, result);
      };

      relayMail(this, task.emailObject, task.emailStream, task.isAutoRelay, relayCallback);
    }, 1);

    if (options?.autoRelayAddress || options?.autoRelayRules) {
      this.setAutoRelayMode(true, options?.autoRelayAddress, options?.autoRelayRules);
    }
  }

  getOutgoingHost() {
    return this.host;
  }

  close() {
    if (this.client) {
      this.client.close();
    }
  }

  setAutoRelayMode(
    enabled: boolean,
    emailAddress: string | undefined,
    rules: { allow?: string; deny?: string }[] | string | undefined,
  ) {
    this.autoRelay = enabled;
    this.autoRelayAddress = emailAddress;

    if (rules) {
      if (typeof rules === "string") {
        try {
          rules = JSON.parse(fs.readFileSync(rules, "utf8"));
        } catch (err) {
          logger.error(`Error reading rules file at ${rules}: ${err}`);
          throw err;
        }
      }

      if (Array.isArray(rules)) {
        this.autoRelayRules = rules;
      }
    }

    if (this.autoRelay) {
      const msg = ["Auto-Relay mode on"];
      if (this.autoRelayAddress) {
        msg.push(`Relaying all emails to ${this.autoRelayAddress}`);
      }
      if (this.autoRelayRules) {
        msg.push(`Relay rules: ${JSON.stringify(this.autoRelayRules)}`);
      }
      logger.info(msg.join(", "));
    }
  }

  isAutoRelayEnabled() {
    return this.autoRelay;
  }

  relayMail(emailObject, emailStream, isAutoRelay, callback) {
    this.emailQueue.push({ emailObject, emailStream, isAutoRelay, callback });
  }
}

function createClient(outgoing: Outgoing) {
  try {
    outgoing.client = new SMTPConnection({
      port: outgoing.port,
      host: outgoing.host,
      secure: outgoing.secure,
      auth: outgoing.auth || false,
      tls: { rejectUnauthorized: false },
      debug: true,
    });

    outgoing.client.on("error", function (err) {
      logger.error("SMTP Connection error for outgoing email: ", err);
    });

    logger.info(
      "MailDev outgoing SMTP Server %s:%d (user:%s, pass:%s, secure:%s)",
      outgoing.host,
      outgoing.port,
      outgoing?.auth?.user,
      outgoing?.auth?.pass ? "####" : undefined,
      outgoing.secure ? "yes" : "no",
    );
  } catch (err) {
    logger.error("Error during configuration of SMTP Server for outgoing email", err);
  }
}

function relayMail(outgoing: Outgoing, emailObject: Mail, emailStream, isAutoRelay, done) {
  if (isAutoRelay && outgoing.autoRelayAddress) {
    emailObject.to = [{ address: outgoing.autoRelayAddress, name: "Auto-Relay" }];
    emailObject.envelope.to = [{ address: outgoing.autoRelayAddress, name: "Auto-Relay" }];
  }

  let recipients = emailObject.envelope.to.map(getAddressFromAddressObject);
  if (isAutoRelay && outgoing.autoRelayRules) {
    recipients = getAutoRelayableRecipients(recipients, outgoing.autoRelayRules);
  }

  if (recipients.length === 0) {
    return done("Email had no recipients");
  }

  if (emailObject.envelope.from.length === 0) {
    return done("Email had no sender");
  }

  const mailSendCallback = function (err) {
    if (err) {
      logger.error("Outgoing client login error: ", err);
      return done(err);
    }

    const sender = getAddressFromAddressObject(emailObject.envelope.from);
    outgoing.client.send(
      {
        from: emailObject.envelope.from[0].address,
        to: recipients,
      },
      emailStream,
      function (err) {
        outgoing.client.quit();
        createClient(outgoing);

        if (err) {
          logger.error("Mail Delivery Error: ", err, { sender, recipients });
          return done(err);
        }

        logger.log("Mail Delivered: ", emailObject.subject);

        return done();
      },
    );
  };

  const mailConnectCallback = function (err) {
    if (err) {
      logger.error("Outgoing connection error: ", err);
      return done(err);
    }

    if (outgoing.auth) {
      outgoing.client.login(outgoing.auth, mailSendCallback);
    } else {
      mailSendCallback(err);
    }
  };

  outgoing.client.connect(mailConnectCallback);
}

// Fallback to the object if the address key isn't defined
function getAddressFromAddressObject(addressObj) {
  return typeof addressObj.address !== "undefined" ? addressObj.address : addressObj;
}

function getAutoRelayableRecipients(recipients, rules: { allow?: string; deny?: string }[]) {
  return recipients.filter(function (email) {
    return validateAutoRelayRules(email, rules);
  });
}

function validateAutoRelayRules(email, rules: { allow?: string; deny?: string }[]) {
  return rules.reduce(function (result, rule) {
    const toMatch = rule.allow || rule.deny || "";
    const isMatch = wildstring.match(toMatch, email);

    // Override previous rule if it matches
    return isMatch ? !!rule.allow : result;
  }, true);
}
