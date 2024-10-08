/* global describe, it, before, after */
"use strict";

/**
 * MailDev - email.js -- test the email output
 */
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const nodemailer = require("nodemailer");

const MailDev = require("../dist/index").MailDev;

const port = 9025;

const defaultMailDevOpts = {
  silent: true,
  port: port,
  host: "0.0.0.0",
  web: { disabled: true },
};

const createTransporter = async () => {
  const { user, pass } = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: "0.0.0.0",
    port,
    auth: { type: "login", user, pass },
  });
};

function waitMailDevShutdown(maildev) {
  return new Promise((resolve) => {
    maildev.close(() => resolve());
  });
}

describe("email", () => {
  let maildev;
  let transporter;

  before(function (done) {
    maildev = new MailDev(defaultMailDevOpts);
    maildev.listen().then(() => done());
  });

  after((done) => {
    maildev.close().finally(() => {
      maildev.removeAllListeners();
      done();
    });
  });

  it("should strip javascript from emails", async () => {
    const transporter = await createTransporter();
    const emailForTest = {
      from: "johnny.utah@fbi.gov",
      to: "bodhi@gmail.com",
      subject: "Test cid replacement #1",
      text: "The wax at the bank was surfer wax!!!",
      html:
        "<!DOCTYPE html><html><head></head><body>" +
        "<script type='text/javascript'>alert(\"Hello World\")</script>" +
        "<p>The wax at the bank was surfer wax!!!</p>" +
        "</body></html>",
    };

    return new Promise((resolve, reject) => {
      maildev.on("new", (email) => {
        // Only return matching emails - since we use this new event in multiple functions
        // we need to ensure it's the email that we want.
        if (email.subject === emailForTest.subject) {
          maildev
            .getEmailHTML(email.id)
            .then((html) => {
              transporter.close();
              const contentWithoutNewLine = html.replace(/\n/g, "");
              assert.strictEqual(
                contentWithoutNewLine,
                "<html><head></head><body><p>The wax at the bank was surfer wax!!!</p></body></html>",
              );
              resolve();
            })
            .catch(reject);
        }
      });

      transporter.sendMail(emailForTest);
    });
  });

  it("should preserve html with table elements", async () => {
    const transporter = await createTransporter();
    const emailForTest = {
      from: "johnny.utah@fbi.gov",
      to: "bodhi@gmail.com",
      subject: "Test html table",
      html:
        '<table style="border:1px solid red">' +
        "<tr><td>A1</td><td>B1</td></tr>" +
        "<tr><td>A2</td><td>B2</td></tr>" +
        "</table>",
    };

    return new Promise((resolve, reject) => {
      maildev.on("new", (email) => {
        // Only return matching emails - since we use this new event in multiple functions
        // we need to ensure it's the email that we want.
        if (email.subject === emailForTest.subject) {
          maildev
            .getEmailHTML(email.id)
            .then((html) => {
              transporter.close();
              const contentWithoutNewLine = html.replace(/\n/g, "");
              assert.strictEqual(
                contentWithoutNewLine,
                '<html><head></head><body><table style="border:1px solid red"><tbody><tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr></tbody></table></body></html>',
              );
              resolve();
            })
            .catch(reject);
        }
      });

      transporter.sendMail(emailForTest);
    });
  });

  it("should preserve form action attribute", async () => {
    const transporter = await createTransporter();
    const emailForTest = {
      from: "johnny.utah@fbi.gov",
      to: "bodhi@gmail.com",
      subject: "Test html form",
      html:
        '<form action="mailto:example@example.com?subject=Form Submission" method="POST" enctype="text/plain">' +
        '<input type="text" id="name" name="name">' +
        "</form>",
    };

    return new Promise((resolve, reject) => {
      maildev.on("new", (email) => {
        // Only return matching emails - since we use this new event in multiple functions
        // we need to ensure it's the email that we want.
        if (email.subject === emailForTest.subject) {
          maildev
            .getEmailHTML(email.id)
            .then((html) => {
              transporter.close();
              const contentWithoutNewLine = html.replace(/\n/g, "");
              const action = contentWithoutNewLine.match(/action="(.*?)"/)[1];
              assert.strictEqual(action, "mailto:example@example.com?subject=Form Submission");
              resolve();
            })
            .catch(reject);
        }
      });

      transporter.sendMail(emailForTest);
    });
  });

  it.skip("should handle embedded images with cid", async () => {
    const transporter = await createTransporter();

    const emailsForTest = [
      {
        from: "johnny.utah@fbi.gov",
        to: "bodhi@gmail.com",
        subject: "Test cid replacement #1",
        html: '<img src="cid:image"/>',
        attachments: [
          {
            filename: "tyler.jpg",
            path: path.join(__dirname, "tyler.jpg"),
            cid: "image",
          },
        ],
      },
      {
        from: "johnny.utah@fbi.gov",
        to: "bodhi@gmail.com",
        subject: "Test cid replacement #2",
        html: '<img src="cid:image"/>',
        attachments: [
          {
            filename: "wave.jpg",
            path: path.join(__dirname, "wave.jpg"),
            cid: "image",
          },
        ],
      },
    ];

    let seenEmails = 0;

    return new Promise((resolve, reject) => {
      maildev.on("new", (email) => {
        // Simple replacement to root url
        maildev.getEmailHTML(email.id, (_, html) => {
          const attachmentFilename = email.subject.endsWith("#1") ? "tyler.jpg" : "wave.jpg";
          const contentWithoutNewLine = html.replace(/\n/g, "");
          assert.strictEqual(
            contentWithoutNewLine,
            '<html><head></head><body><img src="/email/' +
              email.id +
              "/attachment/" +
              attachmentFilename +
              '"></body></html>',
          );
          const host = `${defaultMailDevOpts.ip}:${web}`;
          const attachmentLink = `${host}/email/${email.id}/attachment/${attachmentFilename}`;

          // Pass baseUrl
          maildev.getEmailHTML(email.id, host, (_, html) => {
            const contentWithoutNewLine = html.replace(/\n/g, "");
            assert.strictEqual(
              contentWithoutNewLine,
              `<html><head></head><body><img src="//${attachmentLink}"></body></html>`,
            );

            // Check contents of attached/embedded files
            http.get(`http://${attachmentLink}`, (res) => {
              if (res.statusCode !== 200) {
                reject(new Error("Failed to get attachment: " + res.statusCode));
              }
              let data = "";
              res.setEncoding("binary");
              res.on("data", (chunk) => {
                data += chunk;
              });
              res.on("end", () => {
                const fileContents = fs.readFileSync(
                  path.join(__dirname, attachmentFilename),
                  "binary",
                );
                assert.strictEqual(data, fileContents);

                seenEmails += 1;
                if (seenEmails) {
                  resolve();
                }
              });
            });
          });
        });
      });

      emailsForTest.forEach(async (email) => {
        await transporter.sendMail(email);
      });
    });
  });
});
