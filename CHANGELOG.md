

## 3.0.0

- Remove vendored mailparser to use https://github.com/nodemailer/mailparser
  Tried to keep a similar format for `email` but:
    -  Default encoding is utf-8
    - Issues with `uuencode`
  	- Custom headers in Quoted-printable are not converted.
  	- Only the last occurence of a header is used.
  		- apply to `in-reply-to` which [rfc5322](https://www.rfc-editor.org/rfc/rfc5322) list at max=1
    - Attachment
      - `fileName` is now `filename`
      - `length` is now `size`
    - Raw headers are now in `headerLines`
    - Use `Date` object in `mail` and `headers`, in `mail` it will default to current time if missing
    - removed `time`
    - Inline attachment are not added in HTML (was `<div class="mailparser-attachment">`).
    - No mbox support


