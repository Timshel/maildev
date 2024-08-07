/**
 * MailDev - index
 *
 * Author: Dan Farrelly <daniel.j.farrelly@gmail.com>
 * Licensed under the MIT License.
 */
import type { MailServerOptions } from "./lib/mailserver";
import type { WebOptions } from "./lib/web";

import { MailServer } from "./lib/mailserver";
import { Web } from "./lib/web";

const async = require("async");
const logger = require("./lib/logger");

export interface MailDevOptions extends MailServerOptions {
  verbose?: boolean;
  silent?: boolean;
  logMailContents?: boolean;
  web?: MailDevWebOptions;
}

interface MailDevWebOptions extends WebOptions {
  disabled?: boolean;
}

export class MailDev extends MailServer {
  web: Web | undefined;

  constructor(config?: MailDevOptions, mailEventSubjectMapper?: (Mail) => string | undefined) {
    if (config?.verbose) {
      logger.setLevel(2);
    } else if (config?.silent) {
      logger.setLevel(0);
    }

    // Start the Mailserver
    super(config, mailEventSubjectMapper);

    // Start the web server
    if (!config?.web?.disabled) {
      // Default to run on same IP as smtp
      const host = config?.web?.host ? config?.web?.host : config?.host;
      this.web = new Web(this, {
        ...config?.web,
        host,
      });
    }

    if (config?.logMailContents) {
      this.on("new", function (mail) {
        const mailContents = JSON.stringify(mail, null, 2);
        logger.info(`Received the following mail contents:\n${mailContents}`);
      });
    }

    process.on("SIGTERM", this.close.bind(this));
    process.on("SIGINT", this.close.bind(this));
  }

  listen(): Promise<any> {
    const p = [super.listen()];
    if (this.web) {
      p.push(this.web.listen());
    }
    return Promise.all(p);
  }

  close(): Promise<any> {
    logger.info("Received shutdown signal, shutting down now...");
    const p = [super.close()];
    if (this.web) {
      p.push(this.web.close());
    }

    return Promise.all(p);
  }
}
