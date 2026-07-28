import type * as PostalMime from "postal-mime";
import mime from "mime";
import type { AddressObject, EmailAddress, Headers, ParsedMail } from "./type";

import { strtotime } from "./helpers/strtotime";
import * as logger from "./logger";

const simpleParser = require("postal-mime").simpleParser;

export async function parse(input): Promise<ParsedMail> {
  return simpleParser(input, {}).then((parsed: PostalMime.Email) => {
    let headersMap = new Map(
      parsed.headers.map((header) => {
        return [header.key, header.value];
      }),
    );

    const headers: Headers = {
      date: parsed.date ? parseDateString(parsed.date) : undefined,
      contentType: headersMap.get("content-type"),
      contentDisposition: headersMap.get("content-disposition"),
      dkimSignature: headersMap.get("dkim-signature"),

      from: single(flatten(parsed.from ? [parsed.from] : [])),
      to: flatten(parsed.to ?? []),
      cc: flatten(parsed.cc ?? []),
      bcc: flatten(parsed.bcc ?? []),
      sender: single(flatten(parsed.sender ? [parsed.sender] : [])),
      replyTo: flatten(parsed.replyTo ?? []),
      deliveredTo: parsed.deliveredTo,
      priority: headersMap.get("priority"),
      headers: headersMap,
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
    const attachments = (parsed.attachments ?? []).map((attachment: PostalMime.Attachment) => {
      const generatedFileName = generateFileNames(
        fileNames,
        attachment.filename,
        attachment.mimeType,
      );

      return {
        ...attachment,
        generatedFileName,
      };
    });

    return {
      ...parsed,
      headers,
      replyTo: headers.replyTo,
      from: headers.from,
      to: headers.to,
      cc: headers.cc,
      bcc: headers.bcc,
      date: parsed.date ?? new Date(),
      priority: headers.priority ?? "normal",
      receivedDate: parseReceived(
        parsed.date,
        headersMap.get("received"),
        headersMap.get("x-received"),
      ),
      references,
      inReplyTo,
      attachments,
    };
  });
}

function single<T>(array: T[]): T | undefined {
  return array.length > 0 ? array[0] : undefined;
}

function flatten(addresses: PostalMime.Address[], groupName?: string | undefined): EmailAddress[] {
  let acc: EmailAddress[] = [];

  addresses.forEach((addr) => {
    if (Array.isArray(addr.group)) {
      flatten(addr.group, addr.name);
    } else if (addr.address != undefined) {
      acc.push({
        name: addr.name,
        address: addr.address,
        group: addr.group ?? groupName,
      });
    } else {
      logger.error("Missing address value for %s", addr.name);
    }
  });

  return acc;
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

  if (received) {
    receivedDate = parse(received);
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
