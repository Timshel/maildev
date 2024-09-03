"use strict";

import type { Attachment, Envelope, Mail, ParsedMail } from "./type";
import type { MailServer } from "./mailserver";

interface Next {
  filter: (Mail) => boolean;
  resolve: (Mail) => any;
  reject: (Error) => any;
  consume: boolean;
}

export class MailBuffer {
  mails: Mail[] = [];
  nexts: Next[] = [];

  close: () => any;
  _receive: (Mail) => any;

  constructor(mailServer: MailServer, subject: String) {
    this._receive = (mail) => {
      this.mails.push(mail);

      for (const { filter, resolve, consume, ..._ } of this.nexts) {
        const index = this.mails.findIndex(filter);
        if (index > -1) {
          resolve(this.mails[index]);
          if (consume) {
            this.mails.splice(index, 1);
          }
        }
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

  next(filter: (Mail) => boolean, consume: boolean = true): Promise<Mail> {
    return new Promise((resolve, reject) => {
      const index = this.mails.findIndex(filter);
      if (index > -1) {
        resolve(this.mails[index]);
        if (consume) {
          this.mails.splice(index, 1);
        }
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
}
