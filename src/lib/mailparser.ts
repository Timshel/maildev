import type * as MailParser from "mailparser";
import type { AddressObject, Headers, HeaderValue, ParsedMail } from "./type";

const crypto = require("crypto");
const mime = require("mime");
const simpleParser = require("mailparser").simpleParser;
const strtotime = require("./helpers/strtotime");
const logger = require("./logger");

export function parse(input, callback: (err, mail: ParsedMail) => any) {
  var mail;

  simpleParser(input, {}, (err, parsed: MailParser.ParsedMail) => {
    if (parsed) {
      const headers: Headers = {
        from: getAddress(parsed.headers, "from"),
        to: getAddress(parsed.headers, "to"),
        cc: getAddress(parsed.headers, "cc"),
        bcc: getAddress(parsed.headers, "bcc"),
        date: getDate(parsed.headers, "date"),
        replyTo: getAddress(parsed.headers, "reply-to"),
        received: getSringArray(parsed.headers, "received"),
        priority: getSring(parsed.headers, "priority"),
        headers: new Map(
          Array.from(parsed.headers, ([key, value]) => {
            return [key, typeof value === "string" ? [value] : value];
          }),
        ),
      };

      const references = (
        typeof parsed.references === "string" ? [parsed.references] : (parsed.references ?? [])
      ).map((ref) => {
        return ref.replace(/^<(.*)>$/, "$1");
      });

      const inReplyTo = (
        typeof parsed.inReplyTo === "string" ? (parsed.inReplyTo.match(/<([^<>]*)>/g) ?? []) : []
      ).map((ref) => {
        return ref.replace(/^<(.*)>$/, "$1");
      });

      const fileNames = [];
      const attachments = (parsed.attachments ?? []).map((attachment: MailParser.Attachment) => {
        const generatedFileName = generateFileNames(
          fileNames,
          attachment.filename,
          attachment.contentType,
        );

        const contentId =
          !attachment.contentId && generatedFileName
            ? crypto
                .createHash("md5")
                .update(Buffer.from(generatedFileName, "utf-8"))
                .digest("hex") + "@mailparser"
            : attachment.contentId;

        return {
          ...attachment,
          contentId,
          generatedFileName,
        };
      });

      mail = {
        ...parsed,
        replyTo: headers?.replyTo?.value,
        from: headers?.from?.value,
        to: headers?.to?.value,
        cc: headers?.cc?.value,
        bcc: headers?.bcc?.value,
        date: parsed.date ?? new Date(),
        priority: headers.priority ?? "normal",
        receivedDate: parseReceived(
          parsed.date,
          headers.received,
          parsed.headers.get("x-received"),
        ),
        references,
        inReplyTo,
        attachments,
      };
    }

    callback(err, mail);
  });
}

function getDate(headers: MailParser.Headers, key: string): Date | undefined {
  const value = headers.get(key);
  headers.delete(key);

  if (value instanceof Date || value === undefined) {
    return value;
  } else {
    logger.error("Invalid header value for %s, expected date got %s", key, value);
  }
  return undefined;
}

function getSring(headers: MailParser.Headers, key: string): string | undefined {
  const value = headers.get(key);
  headers.delete(key);

  if (typeof value === "string" || value === undefined) {
    return value;
  } else {
    logger.error("Invalid header value for %s, expected string got %s", key, value);
  }
  return undefined;
}

function getSringArray(headers: MailParser.Headers, key: string): string[] {
  const value = headers.get(key) ?? [];
  headers.delete(key);

  if (typeof value === "string") {
    return [value];
  } else if (Array.isArray(value)) {
    return value;
  } else {
    logger.error("Invalid header value for %s, expected string or [] got %s", key, value);
  }
  return [];
}

function getAddress(headers: MailParser.Headers, key: string): AddressObject | undefined {
  const headerValue = headers.get(key);
  headers.delete(key);
  return headerValue as AddressObject | undefined;
}

/**
 * <p>Generates a context unique filename for an attachment</p>
 *
 * <p>If a filename already exists, append a number to it</p>
 *
 * <ul>
 *     <li>file.txt</li>
 *     <li>file-1.txt</li>
 *     <li>file-2.txt</li>
 * </ul>
 *
 * @param {String} fileName source filename
 * @param {String} contentType source content type
 * @returns {String} generated filename
 */
function generateFileNames(fileNames, fileName, contentType) {
  let ext;
  let defaultExt = "";

  if (contentType) {
    const ext = mime.getExtension(contentType);
    defaultExt = ext ? "." + ext : "";
  }

  fileName = fileName || "attachment" + defaultExt;

  // remove path if it is included in the filename
  fileName =
    fileName
      .toString()
      .split(/[/\\]+/)
      .pop()
      .replace(/^\.+/, "") || "attachment";
  const fileRootName = fileName.replace(/(?:-\d+)+(\.[^.]*)$/, "$1") || "attachment";

  if (fileRootName in fileNames) {
    fileNames[fileRootName]++;
    ext = fileName.substr((fileName.lastIndexOf(".") || 0) + 1);
    if (ext === fileName) {
      fileName += "-" + fileNames[fileRootName];
    } else {
      fileName =
        fileName.substr(0, fileName.length - ext.length - 1) +
        "-" +
        fileNames[fileRootName] +
        "." +
        ext;
    }
  } else {
    fileNames[fileRootName] = 0;
  }

  return fileName;
}

/**
 * <p>Parses Received and X-Received header field value</p>
 *
 * <p>Pulls received date from the received and x-received header fields and
 * update current node meta object with this date as long as it's later as the
 * existing date of the meta object</p>
 *
 * <p>Example: <code>by 10.25.25.72 with SMTP id 69csp2404548lfz; Fri, 6 Feb 2015 15:15:32 -0800 (PST)</code>
 * will become:
 * </p>
 *
 * <pre>new Date('2015-02-06T23:15:32.000Z')</pre>
 *
 * @param {String} value Received string
 * @returns {Date|Boolean} parsed received date
 */
function parseReceived(date, received, xReceived) {
  let receivedDate;

  function parse(value) {
    const splitString = value.split(";");
    return parseDateString(splitString[splitString.length - 1]);
  }

  if (received && received.length > 0) {
    receivedDate = parse(received[0]);
  }

  if (!receivedDate && xReceived) {
    receivedDate = parse(xReceived);
  }

  return !receivedDate || date > receivedDate ? date : receivedDate;
}

/**
 * <p>Parses date string</o>
 *
 * <p>Receives possible date string in different formats and
 * transforms it into a JS Date object</p>
 *
 * @param {String} value possible date string
 * @returns {Date|Boolean} date object
 */
function parseDateString(value) {
  let date;

  date = new Date(value);
  if (
    Object.prototype.toString.call(date) !== "[object Date]" ||
    date.toString() === "Invalid Date"
  ) {
    try {
      date = strtotime(value);
    } catch (E) {
      return false;
    }
    if (date) {
      date = new Date(date * 1000);
    } else {
      return false;
    }
  }

  return date;
}
