

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



