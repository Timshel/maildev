"use strict";

/**
 * MailDev - mailserver.js
 */
import type { Attachment, Envelope, Mail, ParsedMail } from "./type";
import type { ReadStream } from "fs";

import { parse as mailParser } from "./mailparser";
import { SMTPServer } from "smtp-server";
import { promises as pfs } from "fs";

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
  store: Envelope[] = [];
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
   * Set Auto Relay Mode, automatic send email to recipient
   */
  setAutoRelayMode(enabled: boolean, rules: Object, emailAddress: string) {
    outgoing.setAutoRelayMode(enabled, rules, emailAddress);
  }

  relayMail(mail: Mail, isAutoRelay: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      this.getRawEmail(mail.id)
        .then((rawEmailStream) => {
          outgoing.relayMail(mail, rawEmailStream, isAutoRelay, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        })
        .catch((err) => {
          logger.error("Mail Stream Error: ", err);
          reject(err);
        });
    });
  }

  /**
   * Get an email by id
   */
  async getEmail(id: string): Promise<Mail> {
    const envelope = this.store.find(function (elt) {
      return elt.id === id;
    });
    if (envelope) {
      return getDiskEmail(this.mailDir, envelope).then((mail) => {
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
        return mail;
      });
    } else {
      throw new Error(`No email with id: ${id}`);
    }
  }

  /**
   * Returns a readable stream of the raw email
   */
  async getRawEmail(id: string): Promise<ReadStream> {
    const emlPath = path.join(this.mailDir, id + ".eml");
    if (fs.existsSync(emlPath)) {
      return fs.createReadStream(emlPath);
    } else {
      throw new Error(`No email with id: ${id}`);
    }
  }

  /**
   * Returns the html of a given email
   */
  async getEmailHTML(id: string, baseUrl: string = ""): Promise<string> {
    baseUrl = baseUrl ? "//" + baseUrl : "";

    const mail = await this.getEmail(id);

    if (typeof mail.html === "string") {
      var html: string = mail.html;

      const getFileUrl = function (filename) {
        return baseUrl + "/email/" + id + "/attachment/" + encodeURIComponent(filename);
      };

      for (const attachment of mail.attachments) {
        if (attachment.contentId) {
          const regex = new RegExp("src=(\"|')cid:" + attachment.contentId + "(\"|')", "g");
          const replacement = 'src="' + getFileUrl(attachment.generatedFileName) + '"';
          html = html.replace(regex, replacement);
        }
      }

      return html;
    } else {
      throw new Error(`No html in email ${id}`);
    }
  }

  /**
   * Set all emails to read
   */
  readAllEmail(): number {
    return this.store.reduce(function (count, elt) {
      if (!elt.isRead) {
        count++;
      }
      return count;
    }, 0);
  }

  getAllEmail(): Promise<Mail[]> {
    const emails = this.store.map((elt) => {
      return this.getEmail(elt.id);
    });
    return Promise.all(emails);
  }

  async deleteEmail(id: string): Promise<boolean> {
    const self = this;
    const emailIndex = this.store.findIndex((elt) => elt.id === id);
    if (emailIndex < 0) {
      throw new Error(`Email ${id} not found`);
    }
    const mail = this.store[emailIndex];
    logger.warn("Deleting email - %s", mail.id);

    return Promise.all([
      pfs.unlink(path.join(this.mailDir, id + ".eml")).catch((err) => {
        throw new Error(`Error when deleteing ${id}`);
      }),
      pfs.rm(path.join(this.mailDir, id), { recursive: true, force: true }).catch((err) => {
        throw new Error(`Error when deleteing ${id} attachments: ${err}`);
      }),
    ]).then(() => {
      self.eventEmitter.emit("delete", { id, index: emailIndex });
      return true;
    });
  }

  async deleteAllEmail(): Promise<boolean> {
    logger.warn("Deleting all email");

    this.clearMailDir();
    this.store.length = 0;
    this.eventEmitter.emit("delete", { id: "all" });

    return true;
  }

  /**
   * Delete everything in the mail directory
   */
  async clearMailDir(): Promise<void[]> {
    const self = this;
    const files = await pfs.readdir(this.mailDir);

    const rms = files.map(function (file) {
      return pfs.rm(path.join(self.mailDir, file), { recursive: true });
    });

    return Promise.all(rms);
  }

  /**
   * Returns the content type and a readable stream of the file
   */
  async getEmailAttachment(id: string, filename: string): Promise<Attachment> {
    const mail = await this.getEmail(id);

    if (mail.attachments.length === 0) {
      throw new Error("Email has no attachments");
    }

    for (const attachment of mail.attachments) {
      if (attachment.filename === filename) {
        return attachment;
      }
    }

    throw new Error(`Attachment ${filename} not found`);
  }

  /**
   * Download a given email
   */
  async getEmailEml(id): Promise<[string, string, ReadStream]> {
    const filename = id + ".eml";
    const stream = await this.getRawEmail(id);
    return ["message/rfc822", filename, stream];
  }

  async loadMailsFromDirectory(): Promise<void[]> {
    const self = this;
    const persistencePath = await pfs.realpath(this.mailDir);
    const files = await pfs.readdir(persistencePath).catch((err) => {
      logger.error(`Error during reading of the mailDir ${persistencePath}`);
      throw new Error(`Error during reading of the mailDir ${persistencePath}`);
    });

    self.store.length = 0;
    const saved = files.map(async function (file) {
      const envelope = {
        id: path.parse(file).name,
        from: undefined,
        to: undefined,
        host: undefined,
        remoteAddress: undefined,
        isRead: false,
      };
      const email = await getDiskEmail(self.mailDir, envelope);
      return saveEmailToStore(self, email);
    });

    return Promise.all(saved);
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
  fs.mkdirSync(mailDir, { recursive: true });
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

async function saveAttachment(mailServer: MailServer, id, attachment): Promise<void> {
  await pfs.mkdir(path.join(mailServer.mailDir, id), { recursive: true });

  const contentId =
    attachment.contentId ??
    crypto.createHash("md5").update(Buffer.from(attachment.filename, "utf-8")).digest("hex") +
      "@mailparser";

  return pfs.writeFile(path.join(mailServer.mailDir, id, contentId), attachment.content);
}

async function getDiskEmail(mailDir: string, envelope: Envelope): Promise<Mail> {
  const emlPath = path.join(mailDir, envelope.id + ".eml");
  const data = await pfs.readFile(emlPath, "utf8");
  const parsedMail = await mailParser(data);
  return buildMail(mailDir, envelope, parsedMail);
}

async function buildMail(
  mailDir: string,
  envelope: Envelope,
  parsedMail: ParsedMail,
): Promise<Mail> {
  const emlPath = path.join(mailDir, envelope.id + ".eml");
  const stat = await pfs.stat(emlPath);

  const onlyAddress = (xs) => (xs || []).map((x) => x.address);
  const calculatedBcc = calculateBcc(
    onlyAddress(envelope.to),
    onlyAddress(parsedMail.to),
    onlyAddress(parsedMail.cc),
  );

  return {
    id: envelope.id,
    envelope,
    calculatedBcc,
    size: stat.size,
    sizeHuman: utils.formatBytes(stat.size),
    ...parsedMail,
  };
}

/**
 * SMTP Server stream and helper functions
 */
// Save an email object on stream end
async function saveEmailToStore(mailServer: MailServer, mail: Mail): Promise<void> {
  logger.log("Saving email: %s, id: %s", mail.subject, mail.id);

  await Promise.all(
    mail.attachments.map((attachment) => {
      return saveAttachment(mailServer, mail.id, attachment);
    }),
  );

  mailServer.store.push(mail.envelope);
  mailServer.eventEmitter.emit("new", mail);

  if (outgoing.isAutoRelayEnabled()) {
    await mailServer.relayMail(mail).catch((err) => {
      logger.error("Error when relaying email", err);
    });
  }
}

/**
 *  Handle smtp-server onData stream
 */
async function handleDataStream(mailServer: MailServer, stream, session, callback): Promise<void> {
  const envelope = {
    id: utils.makeId(),
    from: session.envelope.mailFrom,
    to: session.envelope.rcptTo,
    host: session.hostNameAppearsAs,
    remoteAddress: session.remoteAddress,
    isRead: false,
  };
  const emlStream = fs.createWriteStream(path.join(mailServer.mailDir, envelope.id + ".eml"));

  stream.on("end", function () {
    emlStream.end();
    callback(null, "Message queued as " + envelope.id);
  });

  stream.pipe(emlStream);
  const parsed = await mailParser(stream);

  const mail = await buildMail(mailServer.mailDir, envelope, parsed);
  return saveEmailToStore(mailServer, mail);
}
