import type * as MailParser from "mailparser";

/**
 * Structured object for headers with arguments.
 *
 * `content-type: text/plain; CHARSET="UTF-8"` =>
 * ```
 * {
 *     "value": "text/plain",
 *     "params": {
 *         "charset": "UTF-8"
 *     }
 * }
 * ```
 */
export interface StructuredHeader extends MailParser.StructuredHeader {
  /**
   * The main value.
   */
  value: string;
  /**
   * Additional arguments.
   */
  params: { [key: string]: string };
}

/**
 * Possible types of a header value.
 */
export type HeaderValue = string[];

/**
 * A Map object with lowercase header keys.
 */
export type HeadersMap = Map<string, HeaderValue>;

/**
 * Address object.
 */
export interface AddressObject {
  /**
   * An array with address details.
   */
  value: EmailAddress[];
  /**
   * A formatted address string for HTML context.
   */
  html: string;
  /**
   * A formatted address string for plaintext context.
   */
  text: string;
}

/**
 * Address details.
 */
export interface EmailAddress {
  /**
   * The email address.
   */
  address: string;
  /**
   * The name part of the email/group.
   */
  name: string;
}

/**
 * A Map object with lowercase header keys.
 */
export type Headers = {
  date: Date | undefined;

  contentType: StructuredHeader | undefined;
  contentDisposition: StructuredHeader | undefined;
  dkimSignature: StructuredHeader[];

  from: AddressObject | undefined;
  to: AddressObject | undefined;
  cc: AddressObject | undefined;
  bcc: AddressObject | undefined;
  sender: AddressObject | undefined;
  replyTo: AddressObject | undefined;
  deliveredTo: AddressObject | undefined;
  dispositionNotificationTo: AddressObject | undefined;

  received: string[];
  priority: string | undefined;
  headers: HeadersMap;
};

/**
 * An array of raw header lines
 */
export type HeaderLines = ReadonlyArray<{
  key: string;
  line: string;
}>;

/**
 * COmmon part of the Attachment object.
 */
export interface Attachment extends MailParser.Attachment {
  /**
   * Message type.
   */
  type: "attachment";
  /**
   * If true then this attachment should not be offered for download
   * (at least not in the main attachments list).
   */
  related: boolean;
  /**
   * Attachment contents.
   */
  content: Buffer;
  /**
   * MIME type of the message.
   */
  contentType: string;
  /**
   * Content disposition type for the attachment,
   * most probably `'attachment'`.
   */
  contentDisposition: string;
  /**
   * File name of the attachment.
   */
  filename?: string | undefined;
  /**
   * A Map value that holds MIME headers for the attachment node.
   */
  headers: HeadersMap;
  /**
   * An array of raw header lines for the attachment node.
   */
  headerLines: HeaderLines;
  /**
   * A MD5 hash of the message content.
   */
  checksum: string;
  /**
   * Message size in bytes.
   */
  size: number;
  /**
   * The header value from `Content-ID`.
   */
  contentId?: string | undefined;
  /**
   * `contentId` without `<` and `>`.
   */
  cid?: string | undefined; // e.g. '5.1321281380971@localhost'

  generatedFileName: string;
}

export interface ParsedMail {
  /**
   * An array of attachments.
   */
  attachments: Attachment[];
  /**
   * A Map object with lowercase header keys.
   *
   * - All address headers are converted into address objects.
   * - `references` is a string if only a single reference-id exists or an
   *    array if multiple ids exist.
   * - `date` value is a Date object.
   */
  headers: Headers;
  /**
   * An array of raw header lines
   */
  headerLines: HeaderLines;
  /**
   * The HTML body of the message.
   *
   * Sets to `false` when there is no HTML body.
   *
   * If the message included embedded images as cid: urls then these are all
   * replaced with base64 formatted data: URIs.
   */
  html: string | false;
  /**
   * The plaintext body of the message.
   */
  text?: string | undefined;
  /**
   * The plaintext body of the message formatted as HTML.
   */
  textAsHtml?: string | undefined;
  /**
   * The subject line.
   */
  subject?: string | undefined;
  /**
   * An array of referenced Message-ID values.
   */
  references: string[];
  /**
   * A Date object for the `Date:` header.
   */
  date: Date;

  to: EmailAddress[];
  from: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo: EmailAddress[];

  /**
   * The In-Reply-To value string.
   */
  inReplyTo: string[];

  /**
   * The Message-ID value string.
   */
  messageId?: string | undefined;

  /**
   * Priority of the e-mail.
   */
  priority: "normal" | "low" | "high";
}

export interface Envelope {
  id: string;
  from: EmailAddress[];
  to: EmailAddress[];
  host: string | undefined;
  remoteAddress: string | undefined;
  isRead: boolean;
}

export interface Mail extends ParsedMail {
  id: string;
  calculatedBcc: EmailAddress[];
  size: number;
  sizeHuman: string;
  envelope: Envelope;
}
