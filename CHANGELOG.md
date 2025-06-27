## 3.2.0

- Upgrade dependencies (express, commander ...)

## 3.1.6

- YA Dummy release to test publishing

## 3.1.5

- Dummy release to test publishing

## 3.1.4

- Dummy update for npmjs

## 3.1.3

- Add socket cors configuration (default is `*`, `MAILDEV_WEB_DOMAIN` to configure)

## 3.1.2

- Fix README dependencies example

## 3.1.1

- Rename package to `@timshel_npm/maildev` for npm publishing

## 3.1.0

- Add `MailBuffer.expect` similar to `next` but with a timeout.
- Upgrade dependencies

## 3.0.5

- Update dependencies
- Fix date display in email list
- Improve webapp performance, stop reading complete emails to display email list.
  - Refreshing the webapp was alsmost impossible with thousands of emails
  - :warning: the search filter will not work on email body anymore

## 3.0.4

- MailBuffer.next correctly remove filter
- Update dependencies

## 3.0.3

- ParsedMail empty addresses fields (to, from, cc, bcc, replyTo) should returm empty arrays

## 3.0.2

- Fix reported version

## 3.0.1

- Update dependencies

## 3.0.0-rc3

- Set and create the `MAILDEV_MAIL_DIRECTORY` to `/tmp/maildev` in the docker image to prevent issues with named volume.

## 3.0.0-rc2

- Fix single mail deletion
- Fix https key and cert arguments

## 3.0.0-rc1

- Stop writing attachments to disk (Should fix: https://github.com/maildev/maildev/issues/467).
- Add `MailBuffer` to easily wait for a specific mail
  ```ts
  const buffer = mailServer.buffer("totot@gmail.com");
  const welcome = await buffer.next((m) => m.subject.startsWith("Welcome"));
  ```

## 3.0.0-rc0

- Remove vendored mailparser to use https://github.com/nodemailer/mailparser
  Tried to keep a similar format for `email` but:
    - Default encoding is utf-8
    - Issues with `uuencode`
  	- Custom headers in Quoted-printable are not converted.
  	- Only the last occurence of a header is used.
  		- apply to `in-reply-to` which [rfc5322](https://www.rfc-editor.org/rfc/rfc5322) list at max=1
    - Inline attachment are not added in HTML (was `<div class="mailparser-attachment">`).
    - No mbox support
    - Attachment are not streamed anymore, but use `Buffer`.
    - Mail format is now defined in [type.ts](src/lib/type.ts)
- Converted most the lib to Typescript
- Stopped stoing all mails in memory, keep only the enveloppe and read the rest from disk
- Exposed more event listener methods from `EventEmitter`
- Added some Async support
- `mailEventSubjectMapper` allow to define custom event `subject` (by default use the first recipient)



