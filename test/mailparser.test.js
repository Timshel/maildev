/* global describe, it */
"use strict";

const fs = require("fs");
const assert = require("assert");
const path = require("node:path");

const mailParser = require("../dist/lib/mailparser").parse;

describe("Mailparser General tests", () => {
  it("Many chunks", (done) => {
    const encodedText = "Content-Type: text/plain; charset=utf-8\r\n" + "\r\n" + "ÕÄ\r\n" + "ÖÜ"; // \r\nÕÄÖÜ
    const buffer = Buffer.from(encodedText, "utf-8");

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄ\nÖÜ");
      done();
    });
  });

  it("Headers only", (done) => {
    const encodedText = "Content-type: text/plain; charset=utf-8\r\n" + "Subject: ÕÄÖÜ";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "ÕÄÖÜ");
      done();
    });
  });

  it("Body only", (done) => {
    const encodedText = "\r\n" + "===";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "===");
      done();
    });
  });

  it("Different line endings", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\n" +
      "Subject: ÕÄÖÜ \n\n" +
      "1234\r\n" +
      "ÕÄÖÜ\r" +
      "ÜÖÄÕ\n" +
      "1234";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "ÕÄÖÜ");
      assert.strictEqual(mail.text, "1234\nÕÄÖÜ\rÜÖÄÕ\n1234");
      done();
    });
  });

  it.skip("Headers Qutoed printable", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "X-Test: =?UTF-8?Q?=C3=95=C3=84?= =?UTF-8?Q?=C3=96=C3=9C?=\r\n" +
      "Subject: ABCDEF\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      'Content-Disposition: attachment; filename="test.pdf"\r\n' +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.headers.subject, "ABCDEF");
      assert.strictEqual(mail.headers["x-test"], "ÕÄÖÜ");
      done();
    });
  });

  it("No priority", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r" + "Subject: ÕÄÖÜ\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.headers.priority, undefined);
      assert.strictEqual(mail.priority, "normal");
      done();
    });
  });

  it("MS Style priority", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r" +
      "Subject: ÕÄÖÜ\n" +
      "X-Priority: 1 (Highest)\n" +
      "\r" +
      "1234";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.priority, "high");
      done();
    });
  });

  it("Single reference", (done) => {
    const encodedText = "Content-type: text/plain\r\n" + "References: <mail1>\n" + "\n" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.references, ["mail1"]);
      done();
    });
  });

  it("Multiple reference values", (done) => {
    const encodedText =
      "Content-type: text/plain\r\n" +
      "References: <mail1>\n" +
      "    <mail2> <mail3>\n" +
      "\r" +
      "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.references, ["mail1", "mail2", "mail3"]);
      done();
    });
  });

  it("Single in-reply-to", (done) => {
    const encodedText = "Content-type: text/plain\n" + "in-reply-to: <mail1>\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.inReplyTo, ["mail1"]);
      done();
    });
  });

  it("Multiple in-reply-to values", (done) => {
    const encodedText =
      "Content-type: text/plain\n" +
      "in-reply-to: <mail1>\n" +
      "    <mail2> <mail3>\n" +
      "\r" +
      "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.inReplyTo, ["mail1", "mail2", "mail3"]);
      done();
    });
  });

  it("Multiple in-reply-to fields", (done) => {
    const encodedText =
      "Content-type: text/plain\n" +
      "in-reply-to: <mail1>\n" +
      "in-reply-to: <mail3>\n" +
      "\r" +
      "1234";

    mailParser(encodedText).then((mail) => {
      // Not in spec ? https://www.rfc-editor.org/rfc/rfc5322, max 1
      // assert.deepStrictEqual(mail.inReplyTo, ["mail1", "mail3"]);
      assert.deepStrictEqual(mail.inReplyTo, ["mail3"]);
      done();
    });
  });

  it("Reply To address", (done) => {
    const encodedText =
      "Reply-TO: andris <andris@disposebox.com>\n" + "Subject: ÕÄÖÜ\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.replyTo, [
        {
          name: "andris",
          address: "andris@disposebox.com",
        },
      ]);
      done();
    });
  });

  it("Cc address", (done) => {
    const encodedText = "cc: andris <andris@disposebox.com>\n" + "Subject: ÕÄÖÜ\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.cc, [
        {
          name: "andris",
          address: "andris@disposebox.com",
        },
      ]);
      done();
    });
  });

  it("Bcc address", (done) => {
    const encodedText = "bcc: andris <andris@disposebox.com>\n" + "Subject: ÕÄÖÜ\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.bcc, [
        {
          name: "andris",
          address: "andris@disposebox.com",
        },
      ]);
      done();
    });
  });

  it("No addresses", (done) => {
    const encodedText = "Subject: ÕÄÖÜ\n" + "\r" + "1234";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.to, []);
      assert.deepStrictEqual(mail.from, []);
      assert.deepStrictEqual(mail.cc, []);
      assert.deepStrictEqual(mail.bcc, []);
      assert.deepStrictEqual(mail.replyTo, []);
      done();
    });
  });
});

describe("Mailparser Text encodings", () => {
  it.skip("Plaintext encoding: Default", (done) => {
    const encodedText = [13, 10, 213, 196, 214, 220]; // \r\nÕÄÖÜ
    const buffer = Buffer.from(encodedText);

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Plaintext encoding: Header defined", (done) => {
    const encodedText = "Content-Type: TEXT/PLAIN; CHARSET=UTF-8\r\n" + "\r\n" + "ÕÄÖÜ";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("HTML encoding: From <meta>", (done) => {
    const encodedText =
      "Content-Type: text/html\r\n" +
      "\r\n" +
      '<html><head><meta charset="utf-8"/></head><body>ÕÄÖÜ';

    mailParser(encodedText).then((mail) => {
      assert.strictEqual((mail.html || "").substr(-4), "ÕÄÖÜ");
      done();
    });
  });

  it("HTML encoding: Header defined", (done) => {
    const encodedText = "Content-Type: text/html; charset=iso-UTF-8\r\n" + "\r\n" + "ÕÄÖÜ";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.html, "ÕÄÖÜ");
      done();
    });
  });

  it("Mime Words", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\n" +
      "From: =?utf-8?q??= <sender@email.com>\r\n" +
      "To: =?ISO-8859-1?Q?Keld_J=F8rn_Simonsen?= <to@email.com>\r\n" +
      "Subject: =?iso-8859-1?Q?Avaldu?= =?iso-8859-1?Q?s_lepingu_?=\r\n =?iso-8859-1?Q?l=F5petamise?= =?iso-8859-1?Q?ks?=\r\n";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "Avaldus lepingu lõpetamiseks");
      assert.strictEqual(mail.from[0].name, "");
      assert.strictEqual(mail.to[0].name, "Keld Jørn Simonsen");
      done();
    });
  });
});

describe("Mailparser attachment encodings", () => {
  it("Quoted-Printable", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(
        Array.prototype.slice.apply(mail?.attachments[0]?.content || []).join(","),
        "0,1,2,3,253,254,255",
      );
      done();
    });
  });

  it("Base64", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "\r\n" +
      "AAECA/3+/w==";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(
        Array.prototype.slice.apply(mail?.attachments[0]?.content || []).join(","),
        "0,1,2,3,253,254,255",
      );
      done();
    });
  });

  it("8bit", (done) => {
    const encodedText = "Content-Type: application/octet-stream\r\n" + "\r\n" + "ÕÄÖÜ";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(
        Array.prototype.slice.apply(mail?.attachments[0]?.content || []).join(","),
        "195,149,195,132,195,150,195,156",
      );
      done();
    });
  });

  it.skip("UUENCODE", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: uuencode\r\n" +
      "\r\n" +
      "begin 644 buffer.bin\r\n" +
      "#0V%T\r\n" +
      "`\r\n" +
      "end";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.attachments[0].content.toString(), "Cat");
      done();
    });
  });
});

describe("Mailparser Attachment Content-Id", () => {
  it("Defined", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      'Content-Disposition: attachment; filename="=?UTF-8?Q?=C3=95=C3=84=C3=96=C3=9C?="\r\n' +
      "Content-Id: test@localhost\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.contentId, "test@localhost");
      done();
    });
  });
});

describe("Mailparser Attachment filename", () => {
  it("Content-Disposition filename", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      'Content-Disposition: attachment; filename="=?UTF-8?Q?=C3=95=C3=84=C3=96=C3=9C?="\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it("Content-Disposition filename*", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "Content-Disposition: attachment; filename*=\"UTF-8''%C3%95%C3%84%C3%96%C3%9C\"\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it("Content-Disposition filename* with apostrophe", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "Content-Disposition: attachment; \r\n" +
      "    filename*=utf-8''John%20Doe's.xls\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "John Doe's.xls");
      done();
    });
  });

  it("Content-Disposition filename*X", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "Content-Disposition: attachment;\r\n" +
      "    filename*0=OA;\r\n" +
      "    filename*1=U;\r\n" +
      "    filename*2=.txt\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "OAU.txt");
      done();
    });
  });

  it("Content-Disposition filename*X*", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "Content-Disposition: attachment;\r\n" +
      "    filename*0*=UTF-8''%C3%95%C3%84;\r\n" +
      "    filename*1*=%C3%96%C3%9C\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it("Content-Disposition filename*X* mixed", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "Content-Disposition: attachment;\r\n" +
      "    filename*0*=UTF-8''%C3%95%C3%84;\r\n" +
      "    filename*1*=%C3%96%C3%9C;\r\n" +
      "    filename*2=.txt\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ.txt");
      done();
    });
  });

  it("Content-Type name", (done) => {
    const encodedText =
      'Content-Type: application/octet-stream; name="=?UTF-8?Q?=C3=95=C3=84=C3=96=C3=9C?="\r\n' +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it.skip("Content-Type ; name", (done) => {
    const encodedText =
      'Content-Type: ; name="test"\r\n' +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "test");
      done();
    });
  });

  it("Content-Type name*", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream;\r\n" +
      "    name*=UTF-8''%C3%95%C3%84%C3%96%C3%9C\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it("Content-Type name*X*", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream;\r\n" +
      "    name*0*=UTF-8''%C3%95%C3%84;\r\n" +
      "    name*1*=%C3%96%C3%9C\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.filename, "ÕÄÖÜ");
      done();
    });
  });

  it("Default name from Content-type", (done) => {
    const encodedText =
      "Content-Type: application/pdf\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "attachment.pdf");
      done();
    });
  });

  it("Default name", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "attachment.bin");
      done();
    });
  });

  it("Multiple filenames - Same", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="test.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="test.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "test.txt");
      assert.strictEqual(mail?.attachments[1]?.generatedFileName, "test-1.txt");
      done();
    });
  });

  it("Multiple filenames - Different", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="test.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "attachment.bin");
      assert.strictEqual(mail?.attachments[1]?.generatedFileName, "test.txt");
      done();
    });
  });

  it("Multiple filenames - with number", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="somename.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="somename-1.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="somename.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC\r\n" +
      'Content-Type: application/octet-stream; name="somename-1-1.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "somename.txt");
      assert.strictEqual(mail?.attachments[1]?.generatedFileName, "somename-1-1.txt");
      assert.strictEqual(mail?.attachments[2]?.generatedFileName, "somename-2.txt");
      assert.strictEqual(mail?.attachments[3]?.generatedFileName, "somename-1-1-3.txt");
      done();
    });
  });

  it("Generate filename from Content-Type", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/pdf\r\n" +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "attachment.pdf");
      done();
    });
  });

  it("Filename with semicolon", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      'Content-Disposition: attachment; filename="hello;world;test.txt"\r\n' +
      "\r\n" +
      "=00=01=02=03=FD=FE=FF\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "hello;world;test.txt");
      done();
    });
  });

  it("UUE filename with special characters", (done) => {
    const encodedText =
      "Content-Type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: uuencode\r\n" +
      'Content-Disposition: attachment; filename="hello ~!@#%.txt"\r\n' +
      "\r\n" +
      "begin 644 hello ~!@#%.txt\r\n" +
      "#0V%T\r\n" +
      "`\r\n" +
      "end\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.generatedFileName, "hello ~!@#%.txt");
      done();
    });
  });
});

describe("Mailparser plaintext format", () => {
  it("Default", (done) => {
    const encodedText = "Content-Type: text/plain;\r\n\r\nFirst line \r\ncontinued";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "First line \ncontinued");
      done();
    });
  });

  it("Flowed", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed\r\n\r\nFirst line \r\ncontinued \r\nand so on";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "First line continued and so on");
      done();
    });
  });

  it("Flowed Signature", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed\r\n\r\nHow are you today?\r\n" +
      "-- \r\n" +
      "Signature\r\n";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "How are you today?\n-- \nSignature\n");
      done();
    });
  });

  it("Fixed", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=fixed\r\n\r\nFirst line \r\ncontinued \r\nand so on";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "First line \ncontinued \nand so on");
      done();
    });
  });

  it("DelSp", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed; delsp=yes\r\n\r\nFirst line \r\ncontinued \r\nand so on";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "First linecontinuedand so on");
      done();
    });
  });

  it("Quoted printable, Flowed", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed\r\nContent-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\nFoo =\n\nBar =\n\nBaz";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "Foo Bar Baz");
      done();
    });
  });

  it("Quoted printable, Flowed Signature", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed\r\nContent-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\nHow are you today?\r\n" +
      "--=20\r\n" +
      "Signature\r\n";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "How are you today?\n-- \nSignature\n");
      done();
    });
  });

  it("Quoted printable, DelSp", (done) => {
    const encodedText =
      "Content-Type: text/plain; format=flowed; delsp=yes\r\nContent-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\nFoo =\n\nBar =\n\nBaz";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "FooBarBaz");
      done();
    });
  });
});

describe("Mailparser Transfer encoding", () => {
  it.skip("Quoted-Printable Default charset", (done) => {
    const encodedText =
      "Content-type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n=D5=C4=D6=DC";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Quoted-Printable UTF-8", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\n=C3=95=C3=84=C3=96=C3=9C";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it.skip("Base64 Default charset", (done) => {
    const encodedText =
      "Content-type: text/plain\r\nContent-Transfer-Encoding: bAse64\r\n\r\n1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Base64 UTF-8", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: bAse64\r\n\r\nw5XDhMOWw5w=";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Mime Words", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nSubject: =?iso-8859-1?Q?Avaldu?= =?iso-8859-1?Q?s_lepingu_?=\r\n =?iso-8859-1?Q?l=F5petamise?= =?iso-8859-1?Q?ks?=\r\n";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "Avaldus lepingu lõpetamiseks");
      done();
    });
  });

  it.skip("Mime Words with invalid linebreaks (Sparrow)", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\n" +
      "Subject: abc=?utf-8?Q?=C3=B6=C\r\n" +
      " 3=B5=C3=BC?=";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "abcöõü");
      done();
    });
  });

  it.skip("8bit Default charset", (done) => {
    const encodedText = "Content-type: text/plain\r\nContent-Transfer-Encoding: 8bit\r\n\r\nÕÄÖÜ";
    const textmap = encodedText.split("").map((chr) => {
      return chr.charCodeAt(0);
    });
    const buffer = Buffer.from(textmap);

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("8bit UTF-8", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nÕÄÖÜ";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Invalid Quoted-Printable", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: QUOTED-PRINTABLE\r\n\r\n==C3==95=C3=84=C3=96=C3=9C=";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "=�=�ÄÖÜ");
      done();
    });
  });

  it("Invalid BASE64", (done) => {
    const encodedText =
      "Content-type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\nw5XDhMOWw5";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(
        Array.prototype.map
          .call(mail.text, (chr) => {
            return chr.charCodeAt(0);
          })
          .join(","),
        "213,196,214,65533",
      );
      done();
    });
  });

  it.skip("gb2312 mime words", (done) => {
    const encodedText = "From: =?gb2312?B?086yyZjl?= user@ldkf.com.tw\r\n\r\nBody";

    mailParser(encodedText).then((mail) => {
      assert.deepStrictEqual(mail.from, [
        {
          address: "user@ldkf.com.tw",
          name: "游采樺",
        },
      ]);
      done();
    });
  });

  it("Valid Date header", (done) => {
    const encodedText = "Date: Wed, 08 Jan 2014 09:52:26 -0800\r\n\r\n1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.date.toISOString(), "2014-01-08T17:52:26.000Z");
      done();
    });
  });

  it("Invalid Date header", (done) => {
    const encodedText = "Date: zzzzz\r\n\r\n1cTW3A==";
    mailParser(encodedText).then((mail) => {
      assert.ok(mail.date);
      assert.ok(mail.headers.date);
      assert.strictEqual(mail.headerLines.find((h) => h.key === "date").line, "Date: zzzzz");
      done();
    });
  });

  it("Missing Date header", (done) => {
    const encodedText = "Subject: test\r\n\r\n1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.ok(mail.date);
      assert.ok(!mail.headers.date);
      assert.strictEqual(
        mail.headerLines.find((h) => h.key === "date"),
        undefined,
      );
      done();
    });
  });

  it("Received Headers", (done) => {
    const encodedText =
      "Received: by 10.25.25.72 with SMTP id 69csp2404548lfz;\r\n" +
      "        Fri, 6 Feb 2015 20:15:32 -0800 (PST)\r\n" +
      "X-Received: by 10.194.200.68 with SMTP id jq4mr7518476wjc.128.1423264531879;\r\n" +
      "        Fri, 06 Feb 2015 15:15:31 -0800 (PST)\r\n" +
      "Date: Fri, 6 Feb 2015 16:13:51 -0700 (MST)\r\n" +
      "\r\n" +
      "1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.ok(mail.date);
      assert.ok(mail.receivedDate);
      assert.strictEqual(mail.date.toISOString(), "2015-02-06T23:13:51.000Z");
      assert.strictEqual(mail.receivedDate.toISOString(), "2015-02-07T04:15:32.000Z");
      done();
    });
  });

  it("Multiple Received Headers", (done) => {
    const encodedText =
      "Received: by 10.25.25.72 with SMTP id 69csp2404548lfz;\r\n" +
      "        Fri, 6 Feb 2015 20:15:32 -0800 (PST)\r\n" +
      "X-Received: by 10.194.200.68 with SMTP id jq4mr7518476wjc.128.1423264531879;\r\n" +
      "        Fri, 06 Feb 2015 15:15:31 -0800 (PST)\r\n" +
      "Received: from mail.formilux.org (flx02.formilux.org. [195.154.117.161])\r\n" +
      "        by mx.google.com with ESMTP id wn4si6920692wjc.106.2015.02.06.15.15.31\r\n" +
      "        for <test@example.com>;\r\n" +
      "        Fri, 06 Feb 2015 15:15:31 -0800 (PST)\r\n" +
      "Received: from flx02.formilux.org (flx02.formilux.org [127.0.0.1])\r\n" +
      "        by mail.formilux.org (Postfix) with SMTP id 9D262450C77\r\n" +
      "        for <test@example.com>; Sat,  7 Feb 2015 00:15:31 +0100 (CET)\r\n" +
      "Date: Fri, 6 Feb 2015 16:13:51 -0700 (MST)\r\n" +
      "\r\n" +
      "1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.ok(mail.date);
      assert.ok(mail.receivedDate);
      assert.strictEqual(mail.date.toISOString(), "2015-02-06T23:13:51.000Z");
      assert.strictEqual(mail.receivedDate.toISOString(), "2015-02-07T04:15:32.000Z");
      done();
    });
  });

  it("X-Received Header", (done) => {
    const encodedText =
      "X-Received: by 10.194.200.68 with SMTP id jq4mr7518476wjc.128.1423264531879;\r\n" +
      "        Fri, 06 Feb 2015 15:15:31 -0800 (PST)\r\n" +
      "Date: Fri, 6 Feb 2015 16:13:51 -0700 (MST)\r\n" +
      "\r\n" +
      "1cTW3A==";

    mailParser(encodedText).then((mail) => {
      assert.ok(mail.date);
      assert.ok(mail.receivedDate);
      assert.strictEqual(mail.date.toISOString(), "2015-02-06T23:13:51.000Z");
      assert.strictEqual(mail.receivedDate.toISOString(), "2015-02-06T23:15:31.000Z");
      done();
    });
  });
});

describe("Mailparser multipart content", () => {
  it("Simple", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n\r\n--ABC\r\nContent-type: text/plain; charset=utf-8\r\n\r\nÕÄÖÜ\r\n--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Nested", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-type: multipart/related; boundary=DEF\r\n" +
      "\r\n" +
      "--DEF\r\n" +
      "Content-type: text/plain; charset=utf-8\r\n" +
      "\r\n" +
      "ÕÄÖÜ\r\n" +
      "--DEF--\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it("Inline text (Sparrow)", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      'Content-Type: text/plain; charset="utf-8"\r\n' +
      "Content-Transfer-Encoding: 8bit\r\n" +
      "Content-Disposition: inline\r\n" +
      "\r\n" +
      "ÕÄÖÜ\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ");
      done();
    });
  });

  it.skip("Different Levels", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-type: text/html; charset=utf-8\r\n" +
      "\r\n" +
      "ÕÄÖÜ2\r\n" +
      "--ABC\r\n" +
      "Content-type: multipart/related; boundary=DEF\r\n" +
      "\r\n" +
      "--DEF\r\n" +
      "Content-type: text/plain; charset=utf-8\r\n" +
      "\r\n" +
      "ÕÄÖÜ1\r\n" +
      "--DEF--\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "ÕÄÖÜ1");
      assert.strictEqual(mail.html, "ÕÄÖÜ2");
      done();
    });
  });
});

describe("Mailparser attachment info", () => {
  it("Included integrity", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: quoted-printable\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "=00=01=02=03=04=05=06\r\n" +
      "--ABC--";
    const expectedHash = "9aa461e1eca4086f9230aa49c90b0c61";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 7);
      done();
    });
  });

  it("Stream integrity base64", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC--";
    const expectedHash = "9aa461e1eca4086f9230aa49c90b0c61";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 7);
      done();
    });
  });

  it("Stream integrity - 8bit", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: 8bit\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "ÕÄ\r\n" +
      "ÖÜ\r\n" +
      "--ABC--";
    const expectedHash = "cad0f72629a7245dd3d2cbf41473e3ca";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 1);
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 10);
      done();
    });
  });

  it("Stream integrity - binary, non utf-8", (done) => {
    const buf1 = Buffer.from(
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
        "\r\n" +
        "--ABC\r\n" +
        "Content-Type: application/octet-stream\r\n" +
        "Content-Transfer-Encoding: 8bit\r\n" +
        "Content-Disposition: attachment\r\n" +
        "\r\n",
      "utf8",
    );
    // Attachment "ÕÄ\r\nÖÜ\r\nŽŠ" in ISO-8859-13
    const buf2 = Buffer.from([0xd5, 0xc4, 13, 10, 0xd6, 0xdc, 13, 10, 0xde, 0xd0]);
    const buf3 = Buffer.from("\r\n--ABC--", "utf8");

    const expectedHash = "34bca86f8cc340bbd11446ee16ee3cae";
    const buffer = Buffer.concat([buf1, buf2, buf3]);

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 1);
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 10);
      done();
    });
  });

  it("Stream integrity - qp, non utf-8", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream; charset=iso-8859-13\r\n" +
      "Content-Transfer-Encoding: quoted-printable\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "=d5=c4\r\n" +
      "=d6=dc\r\n" +
      "=de=d0\r\n" +
      "--ABC--";
    const expectedHash = "34bca86f8cc340bbd11446ee16ee3cae";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 1);
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 10);
      done();
    });
  });

  it.skip("Stream integrity - uuencode", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: uuencode\r\n" +
      "\r\n" +
      "begin 644 buffer.bin\r\n" +
      "#0V%T\r\n" +
      "`\r\n" +
      "end\r\n" +
      "--ABC--";
    const expectedHash = "fa3ebd6742c360b2d9652b7f78d9bd7d";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 1);
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 3);
      done();
    });
  });

  it("Attachment in root node", (done) => {
    const encodedText =
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: 8bit\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "ÕÄ\r\n" +
      "ÖÜ";
    const expectedHash = "cad0f72629a7245dd3d2cbf41473e3ca";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 1);
      assert.strictEqual(mail?.attachments[0]?.checksum, expectedHash);
      assert.strictEqual(mail?.attachments[0]?.size, 10);
      done();
    });
  });

  it("Stream multiple attachments", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      'Content-Disposition: attachment; filename="test.txt"\r\n' +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments?.length, 3);
      done();
    });
  });

  it("Pass mail node to attachment event", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "Subject: ABCDEF\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: attachment\r\n" +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.subject, "ABCDEF");
      assert.strictEqual(mail?.attachments?.length, 1);
      done();
    });
  });

  it("Detect Content-Type by filename", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      'Content-Disposition: attachment; filename="test.pdf"\r\n' +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail?.attachments[0]?.contentType, "application/pdf");
      done();
    });
  });

  it.skip("Inline attachments", (done) => {
    const encodedText =
      "Content-type: multipart/mixed; boundary=ABC\r\n" +
      "X-Test: =?UTF-8?Q?=C3=95=C3=84?= =?UTF-8?Q?=C3=96=C3=9C?=\r\n" +
      "Subject: ABCDEF\r\n" +
      "\r\n" +
      "--ABC\r\n" +
      "Content-Type: text/html\r\n" +
      "\r\n" +
      "<p>test 1</p>\r\n" +
      "--ABC\r\n" +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: base64\r\n" +
      'Content-Disposition: attachment; filename="test.pdf"\r\n' +
      "\r\n" +
      "AAECAwQFBg==\r\n" +
      "--ABC\r\n" +
      "Content-Type: text/html\r\n" +
      "\r\n" +
      "<p>test 2</p>\r\n" +
      "--ABC--";

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(
        mail.html,
        '<p>test 1</p><br/>\n\n<div class="mailparser-attachment"><a href="cid:754dc77d28e62763c4916970d595a10f@mailparser">&lt;test.pdf&gt;</a></div><br/>\n<p>test 2</p>',
      );
      done();
    });
  });
});

describe("Mailparser additional text after alternative bodies", () => {
  it.skip("should be appended to both alternatives", (done) => {
    const data = fs.readFileSync(path.join(__dirname, "/mixed.eml"));

    mailParser(data).then((mail) => {
      assert.strictEqual(
        mail.text,
        "\nThis e-mail message has been scanned for Viruses and Content and cleared\n\nGood Morning;\n\n",
      );
      assert.strictEqual(
        mail.html,
        "<HTML><HEAD>\n</HEAD><BODY> \n\n<HR>\nThis e-mail message has been scanned for Viruses and Content and cleared\n<HR>\n</BODY></HTML>\nGood Morning;\n\n",
      );
      done();
    });
  });
});

describe("Mailparser MBOX format", () => {
  it.skip("Not a mbox", (done) => {
    const encodedText = "Content-Type: text/plain; charset=utf-8\r\n" + "\r\n" + "ÕÄ\r\n" + "ÖÜ"; // \r\nÕÄÖÜ
    const buffer = Buffer.from(encodedText, "utf-8");

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail._isMbox, false);
      done();
    });
  });

  it.skip("Is a mbox", (done) => {
    const encodedText =
      "From MAILER-DAEMON Fri Jul  8 12:08:34 2011\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      "\r\n" +
      "ÕÄ\r\n" +
      "ÖÜ"; // \r\nÕÄÖÜ
    const buffer = Buffer.from(encodedText, "utf-8");

    mailParser(buffer).then((mail) => {
      assert.strictEqual(mail._isMbox, true);
      done();
    });
  });

  it("Don't unescape '>From '", (done) => {
    const encodedText =
      "Content-Type: text/plain; charset=utf-8\r\n" + "\r\n" + ">From test\r\n" + ">>From pest"; // \r\nÕÄÖÜ

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, ">From test\n>>From pest");
      done();
    });
  });

  it.skip("Unescape '>From '", (done) => {
    const encodedText =
      "From MAILER-DAEMON Fri Jul  8 12:08:34 2011\r\n" +
      "Content-Type: text/plain; charset=utf-8\r\n" +
      "\r\n" +
      ">From test\r\n" +
      ">>From pest"; // \r\nÕÄÖÜ

    mailParser(encodedText).then((mail) => {
      assert.strictEqual(mail.text, "From test\n>From pest");
      done();
    });
  });
});

describe("Mailparser charset handling", () => {
  const cases = [
    // String and its ISO-8859-1 representation
    { str: "ÕÄÖÜ", buf: Buffer.from("d5c4d6dc", "hex") },
    // String and its ISO-2022-JP representation
    {
      str: "学校技術員研修検討会報告",
      buf: Buffer.from("GyRCM1g5OzU7PVEwdzgmPSQ4IUYkMnFKczlwGyhC", "base64"),
    },
  ];

  describe("of textual bodies", () => {
    it.skip("should default to ISO-8859-1", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain\r\n" +
          "Content-Transfer-Encoding: base64\r\n\r\n" +
          cases[0].buf.toString("base64"),
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.text, cases[0].str);
        done();
      });
    });

    it("should fall back to Iconv", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain; charset=ISO-2022-JP\r\n" +
          "Content-Transfer-Encoding: base64\r\n\r\n" +
          cases[1].buf.toString("base64"),
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.text, cases[1].str);
        done();
      });
    });

    it.skip("should default to ISO-8859-1 for unrecognized encoding (and emit error)", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain; charset=bad-encoding\r\n" +
          "Content-Transfer-Encoding: base64\r\n\r\n" +
          cases[0].buf.toString("base64"),
        "utf8",
      );

      mailParser(buffer, (err, mail) => {
        assert.strictEqual(err, "bad-encoding");
        assert.strictEqual(mail.text, cases[0].str);
        done();
      });
    });
  });

  describe("of headers", () => {
    it.skip("should default to ISO-8859-1", (done) => {
      const buffer = Buffer.concat([
        Buffer.from("Content-Type: text/plain\r\n", "utf8"),
        Buffer.from("Subject: ", "utf8"),
        cases[0].buf,
        Buffer.from("\r\n\r\n1234", "utf8"),
      ]);

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.subject, cases[0].str);
        assert.strictEqual(mail.text, "1234");
        done();
      });
    });

    it("should use defined charset if provided", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain; charset=UTF-8\r\n" +
          "Subject: " +
          cases[0].str +
          "\r\n" +
          "\r\n" +
          "1234",
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.subject, cases[0].str);
        assert.strictEqual(mail.text, "1234");
        done();
      });
    });

    it("should use mime-word charset if provided", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain; charset=UTF-8\r\n" +
          "Subject: =?UTF-8?B?" +
          Buffer.from(cases[0].str, "utf8").toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "1234",
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.subject, cases[0].str);
        assert.strictEqual(mail.text, "1234");
        done();
      });
    });

    it("should fall back to Iconv", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain\r\n" +
          "Subject: =?ISO-2022-JP?B?" +
          cases[1].buf.toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "1234",
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail.subject, cases[1].str);
        assert.strictEqual(mail.text, "1234");
        done();
      });
    });

    it.skip("should fall back to ISO-8859-1 on unrecognized encoding (and emit an error)", (done) => {
      const buffer = Buffer.from(
        "Content-Type: text/plain\r\n" +
          "Subject: =?BAD-ENCODING?B?" +
          cases[0].buf.toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "1234",
        "utf8",
      );

      mailParser(buffer, (err, mail) => {
        assert.strictEqual(mail.subject, cases[0].str);
        assert.strictEqual(mail.text, "1234");

        assert.strictEqual(err, "BAD-ENCODING");
        done();
      });
    });
  });

  describe("of header parameters", () => {
    it("should default to ISO-8859-1", (done) => {
      const buffer = Buffer.concat([
        Buffer.from(
          "Content-Type: application/octet-stream\r\n" +
            "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
            "Content-Disposition: attachment; filename=",
          "utf8",
        ),
        cases[0].buf,
        Buffer.from("\r\n" + "\r\n" + "=00=01=02=03=FD=FE=FF", "utf8"),
      ]);

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail?.attachments[0]?.filename, cases[0].str);
        done();
      });
    });

    it("should use mime-word charset if provided", (done) => {
      const buffer = Buffer.from(
        "Content-Type: application/octet-stream\r\n" +
          "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
          "Content-Disposition: attachment; filename==?ISO-UTF-8?B?" +
          Buffer.from(cases[0].str, "utf8").toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "=00=01=02=03=FD=FE=FF",
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail?.attachments[0]?.filename, cases[0].str);
        done();
      });
    });

    it("should fall back to Iconv", (done) => {
      const buffer = Buffer.from(
        "Content-Type: application/octet-stream\r\n" +
          "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
          "Content-Disposition: attachment; filename==?ISO-2022-JP?B?" +
          cases[1].buf.toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "=00=01=02=03=FD=FE=FF",
        "utf8",
      );

      mailParser(buffer).then((mail) => {
        assert.strictEqual(mail?.attachments[0]?.filename, cases[1].str);
        done();
      });
    });

    it.skip("should fall back to ISO-8859-1 on unrecognized encoding (and emit an error)", (done) => {
      const buffer = Buffer.from(
        "Content-Type: application/octet-stream\r\n" +
          "Content-Transfer-Encoding: QUOTED-PRINTABLE\r\n" +
          "Content-Disposition: attachment; filename==?BAD-CHARSET?B?" +
          cases[0].buf.toString("base64") +
          "?=\r\n" +
          "\r\n" +
          "=00=01=02=03=FD=FE=FF",
        "utf8",
      );

      mailParser(buffer, (err, mail) => {
        assert.strictEqual(mail?.attachments[0]?.filename, cases[0].str);
        assert.strictEqual(err, "BAD-CHARSET");
        done();
      });
    });
  });
});
