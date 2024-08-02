"use strict";

/**
 * MailDev - mailserver.js
 */
import type { Envelope, Mail, ParsedMail } from "./type";
import { parse as mailParser } from "./mailparser";
import { SMTPServer } from "smtp-server";

const crypto = require("crypto");
const events = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const utils = require("./utils");
const logger = require("./logger");
const smtpHelpers = require("./helpers/smtp");
const { calculateBcc } = require("./helpers/bcc");
const outgoing = require("./outgoing");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const defaultPort = 1025;
const defaultHost = "0.0.0.0";

const HIDEABLE_EXTENSIONS = [
  "STARTTLS", // Keep it for backward compatibility, but is overriden by hardcoded `hideSTARTTLS`
  "PIPELINING",
  "8BITMIME",
  "SMTPUTF8",
];

/**
 * Mail Server exports
 */

export class MailServer {
  port: number;
  host: string;

  mailDir: string;
  store: Mail[] = [];
  eventEmitter = new events.EventEmitter();

  smtp: typeof SMTPServer;

  /**
   * Extend Event Emitter methods
   * events:
   *   'new' - emitted when new email has arrived
   */
  emit = this.eventEmitter.emit.bind(this.eventEmitter);
  on = this.eventEmitter.on.bind(this.eventEmitter);
  off = this.eventEmitter.off.bind(this.eventEmitter);
  once = this.eventEmitter.once.bind(this.eventEmitter);
  prependListener = this.eventEmitter.once.bind(this.eventEmitter);
  prependOnceListener = this.eventEmitter.once.bind(this.eventEmitter);
  removeListener = this.eventEmitter.removeListener.bind(this.eventEmitter);
  removeAllListeners = this.eventEmitter.removeAllListeners.bind(this.eventEmitter);

  constructor(
    port: number,
    host: string,
    mailDir: string | undefined = undefined,
    user: string | undefined = undefined,
    password: string | undefined = undefined,
    hideExtensions: [] = [],
    isSecure: boolean = false,
    certFilePath: string | undefined,
    keyFilePath: string | undefined,
  ) {
    const defaultMailDir = path.join(os.tmpdir(), `maildev-${process.pid.toString()}`);
    const hideExtensionOptions = getHideExtensionOptions(hideExtensions);
    const smtpServerConfig = Object.assign(
      {
        secure: isSecure,
        cert: certFilePath ? fs.readFileSync(certFilePath) : null,
        key: keyFilePath ? fs.readFileSync(keyFilePath) : null,
        onAuth: smtpHelpers.createOnAuthCallback(user, password),
        onData: (stream, session, callback) => handleDataStream(this, stream, session, callback),
        logger: false,
        hideSTARTTLS: true,
        disabledCommands: user && password ? (isSecure ? [] : ["STARTTLS"]) : ["AUTH"],
      },
      hideExtensionOptions,
    );

    this.port = port;
    this.host = host;
    this.mailDir = mailDir || defaultMailDir;

    this.smtp = new SMTPServer(smtpServerConfig);
    this.smtp.on("error", onSmtpError);

    createMailDir(this.mailDir);
  }

  /**
   * Start the mailServer
   */
  listen(callback) {
    const self = this;
    if (typeof callback !== "function") callback = null;

    // Listen on the specified port
    this.smtp.listen(this.port, this.host, function (err) {
      if (err) {
        if (callback) {
          callback(err);
        } else {
          throw err;
        }
      }
      if (callback) callback();

      logger.info("MailDev SMTP Server running at %s:%s", self.host, self.port);
    });
  }

  /**
   * Stop the mailserver
   */
  close(callback) {
    this.emit("close");
    this.smtp.close(callback);
    outgoing.close();
  }

  /**
   * Setup outgoing
   */
  setupOutgoing(host, port, user, pass, secure) {
    outgoing.setup(host, port, user, pass, secure);
  }

  isOutgoingEnabled(): boolean {
    return outgoing.isEnabled();
  }

  getOutgoingHost(): string {
    return outgoing.getOutgoingHost();
  }

  /**
   * Get an email by id
   */
  getEmail(id: string, done) {
    const mail = this.store.filter(function (element) {
      return element.id === id;
    })[0];

    if (mail) {
      if (mail.html) {
        // sanitize html
        const window = new JSDOM("").window;
        const DOMPurify = createDOMPurify(window);
        mail.html = DOMPurify.sanitize(mail.html, {
          WHOLE_DOCUMENT: true, // preserve html,head,body elements
          SANITIZE_DOM: false, // ignore DOM cloberring to preserve form id/name attributes
          ADD_TAGS: ["link"], // allow link element to preserve external style sheets
          ADD_ATTR: ["target"], // Preserve explicit target attributes on links
        });
      }
      done(null, mail);
    } else {
      done(new Error("Email was not found"));
    }
  }

  /**
   * Returns a readable stream of the raw email
   */
  getRawEmail(id: string, done: (err, stream) => void) {
    const mailDir = this.mailDir;
    this.getEmail(id, function (err, email) {
      if (err) return done(err, undefined);

      done(null, fs.createReadStream(path.join(mailDir, id + ".eml")));
    });
  }

  /**
   * Returns the html of a given email
   */
  getEmailHTML(id: string, baseUrl, done: (err, stream) => void) {
    if (!done && typeof baseUrl === "function") {
      done = baseUrl;
      baseUrl = null;
    }

    if (baseUrl) {
      baseUrl = "//" + baseUrl;
    }

    this.getEmail(id, function (err, mail) {
      if (err) return done(err, undefined);

      let html = mail.html;

      if (!mail.attachments) {
        return done(null, html);
      }

      const embeddedAttachments = mail.attachments.filter(function (attachment) {
        return attachment.contentId;
      });

      const getFileUrl = function (id, baseUrl, filename) {
        return (baseUrl || "") + "/email/" + id + "/attachment/" + encodeURIComponent(filename);
      };

      if (embeddedAttachments.length) {
        embeddedAttachments.forEach(function (attachment) {
          const regex = new RegExp("src=(\"|')cid:" + attachment.contentId + "(\"|')", "g");
          const replacement = 'src="' + getFileUrl(id, baseUrl, attachment.generatedFileName) + '"';
          html = html.replace(regex, replacement);
        });
      }

      done(null, html);
    });
  }

  /**
   * Read all emails
   */
  readAllEmail(done: (err, unread: number) => void) {
    const allUnread = this.store.filter(function (element) {
      return !element.isRead;
    });
    for (const email of allUnread) {
      email.isRead = true;
    }
    done(null, allUnread.length);
  }

  getAllEmail(done: (err, mails: Mail[]) => void) {
    done(null, [...this.store]);
  }

  deleteEmail(id: string, done: (err, deleted: boolean) => void) {
    const self = this;
    const emailIndex = this.store.findIndex((elt) => elt.id === id);
    if (emailIndex < 0) {
      return done(new Error("Email not found"), false);
    }
    const mail = this.store[emailIndex];

    // delete raw email
    fs.unlink(path.join(this.mailDir, id + ".eml"), function (err) {
      if (err) {
        logger.error(err);
      } else {
        self.eventEmitter.emit("delete", { id, index: emailIndex });
      }
    });

    if (mail.attachments.length > 0) {
      fs.rm(path.join(this.mailDir, id), { recursive: true }, function (err) {
        if (err) throw err;
      });
    }

    logger.warn("Deleting email - %s", mail.subject);

    this.store.splice(emailIndex, 1);

    done(null, true);
  }

  deleteAllEmail(done: (err, deleted: boolean) => void) {
    logger.warn("Deleting all email");

    this.clearMailDir();
    this.store.length = 0;
    this.eventEmitter.emit("delete", { id: "all" });

    done(null, true);
  }

  /**
   * Delete everything in the mail directory
   */
  clearMailDir() {
    const mailDir = this.mailDir;
    fs.readdir(mailDir, function (err, files) {
      if (err) throw err;

      files.forEach(function (file) {
        fs.rm(path.join(mailDir, file), { recursive: true }, function (err) {
          if (err) throw err;
        });
      });
    });
  }

  /**
   * Returns the content type and a readable stream of the file
   */
  getEmailAttachment(
    id: string,
    filename: string,
    done: (err, contentType: string | undefined, stream) => void,
  ) {
    const mailDir = this.mailDir;
    this.getEmail(id, function (err, mail) {
      if (err) return done(err, undefined, undefined);

      if (!mail.attachments || !mail.attachments.length) {
        return done(new Error("Email has no attachments"), undefined, undefined);
      }

      const match = mail.attachments.filter(function (attachment) {
        return attachment.generatedFileName === filename;
      })[0];

      if (!match) {
        return done(new Error("Attachment not found"), undefined, undefined);
      }

      done(null, match.contentType, fs.createReadStream(path.join(mailDir, id, match.contentId)));
    });
  }

  /**
   * Set Auto Relay Mode, automatic send email to recipient
   */
  setAutoRelayMode(enabled: boolean, rules: Object, emailAddress: string) {
    outgoing.setAutoRelayMode(enabled, rules, emailAddress);
  }

  /**
   * Relay a given email, accepts a mail id or a mail object
   */
  relayMail(idOrMailObject, isAutoRelay, done) {
    const self = this;
    if (!outgoing.isEnabled()) {
      return done(new Error("Outgoing mail not configured"));
    }

    // isAutoRelay is an option argument
    if (typeof isAutoRelay === "function") {
      done = isAutoRelay;
      isAutoRelay = false;
    }

    // If we receive a email id, get the email object
    if (typeof idOrMailObject === "string") {
      this.getEmail(idOrMailObject, function (err, email) {
        if (err) return done(err);
        self.relayMail(email, isAutoRelay, done);
      });
      return;
    }

    const mail = idOrMailObject;

    this.getRawEmail(mail.id, function (err, rawEmailStream) {
      if (err) {
        logger.error("Mail Stream Error: ", err);
        return done(err);
      }

      outgoing.relayMail(mail, rawEmailStream, isAutoRelay, done);
    });
  }

  /**
   * Download a given email
   */
  getEmailEml(
    id,
    done: (err, type: string | undefined, filename: string | undefined, stream) => void,
  ) {
    const mailDir = this.mailDir;
    this.getEmail(id, function (err, email) {
      if (err) return done(err, undefined, undefined, undefined);

      const filename = email.id + ".eml";

      done(null, "message/rfc822", filename, fs.createReadStream(path.join(mailDir, id + ".eml")));
    });
  }

  loadMailsFromDirectory() {
    const persistencePath = fs.realpathSync(this.mailDir);
    const self = this;
    fs.readdir(persistencePath, function (err, files) {
      if (err) {
        logger.error("Error during reading of the mailDir %s", persistencePath);
      } else {
        self.store.length = 0;
        files.forEach(function (file) {
          const filePath = persistencePath + "/" + file;
          if (path.parse(file).ext === ".eml") {
            fs.readFile(filePath, "utf8", async function (err, data) {
              const idMail = path.parse(file).name;
              if (err) {
                logger.error("Error when opening the file %s (%s)", filePath, err);
              } else {
                mailParser(data, (err, mail) => {
                  if (err) {
                    logger.error("Error when readeing mail from file: %s", err);
                  }
                  saveEmailToStore(self, idMail, mail);
                });
              }
            });
          }
        });
      }
    });
  }
}

/**
 * Handle mailServer error
 */
function onSmtpError(err) {
  if (err.code === "ECONNRESET" && err.syscall === "read") {
    logger.warn(
      `Ignoring "${err.message}" error thrown by SMTP server. Likely the client connection closed prematurely. Full error details below.`,
    );
    logger.error(err);
  } else throw err;
}

/**
 * Create mail directory
 */

function createMailDir(mailDir: string) {
  if (!fs.existsSync(mailDir)) {
    fs.mkdirSync(mailDir);
  }
  logger.info("MailDev using directory %s", mailDir);
}

function getHideExtensionOptions(extensions) {
  if (!extensions) {
    return {};
  }
  return extensions.reduce(function (options, extension) {
    const ext = extension.toUpperCase();
    if (HIDEABLE_EXTENSIONS.indexOf(ext) > -1) {
      options[`hide${ext}`] = true;
    } else {
      throw new Error(`Invalid hideable extension: ${ext}`);
    }
    return options;
  }, {});
}

function saveAttachment(mailServer: MailServer, id, attachment) {
  if (!fs.existsSync(path.join(mailServer.mailDir, id))) {
    fs.mkdirSync(path.join(mailServer.mailDir, id));
  }

  const contentId =
    attachment.contentId ??
    crypto.createHash("md5").update(Buffer.from(attachment.filename, "utf-8")).digest("hex") +
      "@mailparser";

  fs.writeFileSync(path.join(mailServer.mailDir, id, contentId), attachment.content);
}

/**
 * SMTP Server stream and helper functions
 */

// Save an email object on stream end
function saveEmailToStore(
  mailServer: MailServer,
  id: string,
  parseMail: ParsedMail,
  from = undefined,
  to = undefined,
  host = undefined,
  remoteAddress = undefined,
) {
  const emlPath = path.join(mailServer.mailDir, id + ".eml");
  const stat = fs.statSync(emlPath);

  const onlyAddress = (xs) => (xs || []).map((x) => x.address);
  const calculatedBcc = calculateBcc(
    onlyAddress(to),
    onlyAddress(parseMail.to),
    onlyAddress(parseMail.cc),
  );

  const envelope = {
    from,
    to,
    host,
    remoteAddress,
  };

  const mail = {
    id,
    envelope,
    calculatedBcc,
    size: stat.size,
    sizeHuman: utils.formatBytes(stat.size),
    isRead: false,
    ...parseMail,
  };

  logger.log("Saving email: %s, id: %s", mail.subject, id);
  for (const attachment of mail.attachments) {
    saveAttachment(mailServer, id, attachment);
  }

  mailServer.store.push(mail);
  mailServer.eventEmitter.emit("new", mail);

  if (outgoing.isAutoRelayEnabled()) {
    mailServer.relayMail(id, true, function (err) {
      if (err) logger.error("Error when relaying email", err);
    });
  }
}

/**
 *  Handle smtp-server onData stream
 */
function handleDataStream(mailServer: MailServer, stream, session, callback) {
  const id = utils.makeId();
  const emlStream = fs.createWriteStream(path.join(mailServer.mailDir, id + ".eml"));

  stream.pipe(emlStream);
  mailParser(stream, (err, mail) => {
    if (err) {
      logger.error("Error when parsing mail: %s", err);
    }
    saveEmailToStore(
      mailServer,
      id,
      mail,
      session.envelope.mailFrom,
      session.envelope.rcptTo,
      session.hostNameAppearsAs,
      session.remoteAddress,
    );
  });

  stream.on("end", function () {
    emlStream.end();
    callback(null, "Message queued as " + id);
  });
}
