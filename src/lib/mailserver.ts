"use strict";

/**
 * MailDev - mailserver
 */
import type { Attachment, Envelope, Mail, ParsedMail } from "./type";
import type { OutgoingOptions } from "./outgoing";
import type { ReadStream } from "fs";

import { calculateBcc } from "./helpers/bcc";
import { createOnAuthCallback } from "./helpers/smtp";
import { MailBuffer } from "./mailbuffer";
import { parse as mailParser } from "./mailparser";
import { Outgoing } from "./outgoing";
import * as logger from "./logger";
import * as utils from "./utils";

import { SMTPServer } from "smtp-server";
import { promises as pfs } from "fs";

const events = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");
const createDOMPurify = require("dompurify");
const { JSDOM } = require("jsdom");

const defaultPort = 1025;
const defaultHost = "0.0.0.0";

const reservedEventName = ["close", "delete"];

export interface MailServerOptions {
  port?: number;
  host?: string;
  mailDir?: string;
  hideExtensions?: string[];
  isSecure?: boolean;
  auth?: { user: string; pass: string };
  ssl?: { certPath: string; keyPath: string };
  hide8BITMIME?: boolean;
  hidePIPELINING?: boolean;
  hideSMTPUTF8?: boolean;
  outgoing?: OutgoingOptions;
}

export class MailServer {
  port: number;
  host: string;

  mailDir: string;
  store: Envelope[] = [];
  eventEmitter = new events.EventEmitter();
  mailEventSubjectMapper: (Mail) => string | undefined;

  smtp: typeof SMTPServer;
  outgoing: Outgoing | undefined;

  private _reloadInProgress: Promise<void> | undefined = undefined;

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

  next(subject: string): Promise<Mail> {
    if (reservedEventName.includes(subject)) {
      throw new Error(
        `Invalid subject ${subject}; ${reservedEventName} are reserved for internal usage`,
      );
    }

    return new Promise((resolve) => {
      this.once(subject, resolve);
    });
  }

  /**
   * Use an internal array to store received email even if not consummed
   * Use `.return()` to close it
   **/
  iterator(subject: string): AsyncIterator<Mail> {
    if (reservedEventName.includes(subject)) {
      throw new Error(
        `Invalid subject ${subject}; ${reservedEventName} are reserved for internal usage`,
      );
    }

    let closed: boolean = false;
    const next: Promise<Mail>[] = [];
    const self = this;

    const closing = () => {
      closed = true;
    };

    let nextCallback;
    function buildNext(): Promise<Mail> {
      return new Promise((resolve) => {
        nextCallback = (mail) => {
          next.push(buildNext());
          resolve(mail);
        };
        self.once(subject, nextCallback);
      });
    }

    self.once("close", closing);
    next.push(buildNext());

    // We use an internal generator otherwise the setup phase was not always run
    async function* inner(subject: string): AsyncIterator<Mail> {
      try {
        do {
          const email = (await next.shift()) as Mail;
          yield email;
        } while (!closed);
      } finally {
        self.removeListener("close", closing);
        if (nextCallback) {
          self.removeListener(subject, nextCallback);
        }
      }
    }

    return inner(subject);
  }

  /**
   * Return a struct which store received emails.
   * Then allow to obtain a `Promise<Mail>` dependant on a predicate `(Mail) => boolean`.
   * Allow to wait for `Mail` independant of their order of arrival.
   */
  buffer(subject: string, defaultTimeout: number = 10000): MailBuffer {
    return new MailBuffer(this, subject, defaultTimeout);
  }

  constructor(
    options?: MailServerOptions,
    mailEventSubjectMapper: (Mail) => string | undefined = (m) => m.to[0]?.address,
  ) {
    const defaultMailDir = path.join(os.tmpdir(), `maildev-${process.pid.toString()}`);
    const secure = options?.isSecure ?? false;
    const smtpServerConfig = {
      secure,
      cert: options?.ssl ? fs.readFileSync(options?.ssl?.certPath) : null,
      key: options?.ssl ? fs.readFileSync(options?.ssl?.keyPath) : null,
      onAuth: createOnAuthCallback(options?.auth?.user, options?.auth?.pass),
      onData: (stream, session, callback) => handleDataStream(this, stream, session, callback),
      logger: false,
      hideSTARTTLS: true,
      hidePIPELINING: options?.hidePIPELINING ?? false,
      hide8BITMIME: options?.hide8BITMIME ?? false,
      hideSMTPUTF8: options?.hideSMTPUTF8 ?? false,
      disabledCommands: options?.auth ? (secure ? [] : ["STARTTLS"]) : ["AUTH"],
    };

    this.port = options?.port ?? defaultPort;
    this.host = options?.host ?? defaultHost;
    this.mailDir = options?.mailDir ?? defaultMailDir;
    this.mailEventSubjectMapper = mailEventSubjectMapper;

    this.smtp = new SMTPServer(smtpServerConfig);
    this.smtp.on("error", onSmtpError);

    createMailDir(this.mailDir);

    if (options?.outgoing) {
      this.outgoing = new Outgoing(options?.outgoing);
    }

    if (options?.mailDir) {
      this.loadMailsFromDirectory();
    }
  }

  /**
   * Start the mailServer
   */
  listen(): Promise<void> {
    const self = this;
    return new Promise((resolve, reject) => {
      self.smtp.listen(self.port, self.host, (err) => {
        if (err) {
          reject(err);
        }

        logger.info("MailDev SMTP Server running at %s:%s", self.host, self.port);
        resolve();
      });
    });
  }

  /**
   * Stop the mailserver
   */
  close(): Promise<void> {
    this.emit("close");
    this.outgoing?.close();

    return new Promise((resolve) => {
      this.smtp.close(resolve);
    });
  }

  isOutgoingEnabled(): boolean {
    return this.outgoing !== undefined;
  }

  getOutgoingHost(): string | undefined {
    return this.outgoing?.getOutgoingHost();
  }

  /**
   * Set Auto Relay Mode, automatic send email to recipient
   */
  setAutoRelayMode(
    enabled: boolean,
    emailAddress: string | undefined,
    rules: { allow?: string; deny?: string }[] | string | undefined,
  ) {
    if (this.outgoing) {
      this.outgoing.setAutoRelayMode(enabled, emailAddress, rules);
    } else {
      throw new Error("Outgoing not configured");
    }
  }

  relayMail(mail: Mail, isAutoRelay: boolean = true): Promise<void> {
    const self = this;
    const outgoing = this.outgoing;
    return outgoing
      ? new Promise((resolve, reject) => {
          self
            .getRawEmail(mail.id)
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
        })
      : Promise.reject(new Error("Outgoing not configured"));
  }

  /**
   * Get an email by id
   */
  async getEmail(id: string): Promise<Mail> {
    const envelope = this.store.find(function (elt) {
      return elt.id === id;
    });

    if (envelope) {
      return getDiskEmail(this.mailDir, envelope.id).then((mail) => {
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

  getAllEnvelope(): Envelope[] {
    return this.store.slice();
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
    this.store.splice(emailIndex, 1);

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
      if (attachment.generatedFileName === filename) {
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

  async loadMailsFromDirectory(): Promise<void> {
    if (this._reloadInProgress == undefined) {
      this._reloadInProgress = this._loadMailsFromDirectory().finally(() => {
        this._reloadInProgress = undefined;
      });
      return this._reloadInProgress;
    } else {
      return this._reloadInProgress;
    }
  }

  private async _loadMailsFromDirectory(): Promise<void> {
    const self = this;
    const persistencePath = await pfs.realpath(this.mailDir);
    const files = await pfs.readdir(persistencePath).catch((err) => {
      logger.error(`Error during reading of the mailDir ${persistencePath}`);
      throw new Error(`Error during reading of the mailDir ${persistencePath}`);
    });

    this.store.length = 0;
    this.eventEmitter.emit("delete", { id: "all" });

    const concurrency = 20;
    for (let i = 0; i < files.length; i += concurrency) {
      const chunk = files.slice(i, i + concurrency);

      let saved = chunk.map(async function (file) {
        const id = path.parse(file).name;
        const email = await getDiskEmail(self.mailDir, id);
        return saveEmailToStore(self, email);
      });

      await Promise.all(saved);
    }
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

async function getDiskEmail(mailDir: string, id: string): Promise<Mail> {
  const emlPath = path.join(mailDir, id + ".eml");
  const data = await pfs.readFile(emlPath, "utf8");
  const parsedMail = await mailParser(data);
  return buildMail(mailDir, id, parsedMail);
}

async function buildMail(mailDir: string, id: string, parsedMail: ParsedMail): Promise<Mail> {
  const emlPath = path.join(mailDir, id + ".eml");
  const stat = await pfs.stat(emlPath);

  const envelope = {
    id: id,
    from: parsedMail.from,
    to: parsedMail.to,
    date: parsedMail.date,
    subject: parsedMail.subject,
    hasAttachment: parsedMail.attachments.length > 0,
    isRead: false,
  };

  return {
    id: envelope.id,
    envelope,
    calculatedBcc: calculateBcc(envelope.to, parsedMail.to, parsedMail.cc),
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

  mailServer.store.push(mail.envelope);
  mailServer.eventEmitter.emit("new", mail);

  const subject = mailServer?.mailEventSubjectMapper(mail);
  if (subject) {
    if (reservedEventName.includes(subject)) {
      logger.error(
        `Invalid subject ${subject}; ${reservedEventName} are reserved for internal usage`,
      );
    } else {
      mailServer.eventEmitter.emit(subject, mail);
    }
  }

  if (mailServer?.outgoing?.isAutoRelayEnabled()) {
    await mailServer.relayMail(mail).catch((err) => {
      logger.error("Error when relaying email", err);
    });
  }
}

/**
 *  Handle smtp-server onData stream
 */
async function handleDataStream(mailServer: MailServer, stream, session, callback): Promise<void> {
  const id = utils.makeId();
  const emlStream = fs.createWriteStream(path.join(mailServer.mailDir, id + ".eml"));

  stream.on("end", function () {
    emlStream.end();
    callback(null, "Message queued as " + id);
  });

  stream.pipe(emlStream);
  const parsed = await mailParser(stream);
  const mail = await buildMail(mailServer.mailDir, id, parsed);
  return saveEmailToStore(mailServer, mail);
}
