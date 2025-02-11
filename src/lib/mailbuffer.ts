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
      let consumed = false;
      let index = -1;
      do {
        index = this.nexts.findIndex((n) => n.filter(mail));
        if (index > -1) {
          const n = this.nexts[index];
          consumed = n.consume;
          this.nexts.splice(index, 1);
          n.resolve(mail);
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

  next(filter: (Mail) => boolean, consume: boolean = true): Promise<Mail> {
    return new Promise((resolve, reject) => {
      const index = this.mails.findIndex(filter);
      if (index > -1) {
        const mail = this.mails[index];
        if (consume) {
          this.mails.splice(index, 1);
        }
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
}
