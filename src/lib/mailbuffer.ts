"use strict";

import type { Attachment, Envelope, Mail, ParsedMail } from "./type";
import type { MailServer } from "./mailserver";

interface Next {
  filter: (Mail) => boolean;
  resolve: (Mail) => any;
  reject: (Error) => any;
  consume: boolean;
  timeout?: NodeJS.Timeout | undefined;
}

export class MailBuffer {
  mails: Mail[] = [];
  nexts: Next[] = [];
  defaultTimeout: number;

  close: () => any;
  _receive: (Mail) => any;

  constructor(mailServer: MailServer, subject: String, defaultTimeout: number) {
    this.defaultTimeout = defaultTimeout;

    this._receive = (mail) => {
      let consumed = false;
      let index = -1;
      do {
        index = this.nexts.findIndex((n) => n.filter(mail));
        if (index > -1) {
          const n = this.nexts[index];
          consumed = n.consume;
          this.nexts.splice(index, 1);
          n.resolve(mail);
          if (n.timeout !== undefined) {
            clearTimeout(n.timeout);
          }
        }
      } while (index > -1 && !consumed);

      if (!consumed) {
        this.mails.push(mail);
      }
    };

    this.close = () => {
      mailServer.removeListener("close", this.close);
      mailServer.removeListener(subject, this._receive);

      const error = new Error("Closing buffer");
      for (const { reject, ..._ } of this.nexts) {
        reject(error);
      }
    };

    mailServer.on(subject, this._receive);
    mailServer.once("close", this.close);
  }

  find(filter: (Mail) => boolean, consume: boolean): Mail | undefined {
    const index = this.mails.findIndex(filter);
    if (index > -1) {
      const mail = this.mails[index];
      if (consume) {
        this.mails.splice(index, 1);
      }
      return mail;
    }
  }

  next(filter: (Mail) => boolean, consume: boolean = true): Promise<Mail> {
    return new Promise((resolve, reject) => {
      const mail = this.find(filter, consume);
      if (mail !== undefined) {
        resolve(mail);
      } else {
        this.nexts.push({
          filter,
          resolve,
          reject,
          consume,
        });
      }
    });
  }

  expect(filter: (Mail) => boolean, consume: boolean = true, timeout?: number): Promise<Mail> {
    return new Promise((resolve, reject) => {
      const mail = this.find(filter, consume);
      if (mail !== undefined) {
        resolve(mail);
      } else {
        let next: Next = {
          filter,
          resolve,
          reject,
          consume,
        };
        this.nexts.push(next);
        next.timeout = setTimeout(() => {
          let index = this.nexts.findIndex((n) => n === next);
          if (index > -1) {
            this.nexts.splice(index, 1);
            reject(new Error("Timeout while waiting for Mail"));
          }
        }, timeout || this.defaultTimeout);
      }
    });
  }
}
