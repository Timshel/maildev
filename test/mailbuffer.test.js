/* global describe, it, before, after */
"use strict";

/**
 * MailDev - mailserver.js -- test the mailserver options
 */

const assert = require("assert");
const SMTPConnection = require("nodemailer/lib/smtp-connection");
const MailServer = require("../dist/lib/mailserver").MailServer;
const nodemailer = require("nodemailer");
const port = 9025;

async function createTransporter(port, auth) {
  return nodemailer.createTransport({
    port: port,
    auth,
  });
}

describe("MailBuffer", () => {
  let mailServer;
  let transporter;

  before(async () => {
    mailServer = new MailServer({
      port: port,
      auth: { user: "bodhi", pass: "surfing" },
    });
    await mailServer.listen();

    transporter = await createTransporter(port, { type: "login", user: "bodhi", pass: "surfing" });
    return transporter.verify();
  });

  after((done) => {
    mailServer.close().finally(() => {
      done();
    });
  });

  const emailOpts = {
    from: "johnny.utah@fbi.gov",
    to: "bodhi@gmail.com",
    subject: "Test",
    html: "Test",
  };

  function sendMail(subject = emailOpts.subject) {
    const mail = {
      ...emailOpts,
      subject,
    };
    transporter.sendMail(mail);
    return subject;
  }

  it("next should resolve when receiving email", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const p = buffer.next((_) => true);

    sendMail();

    const received = await p;

    assert.strictEqual(received.from[0]?.address, emailOpts.from);
    assert.strictEqual(received.to[0]?.address, emailOpts.to);
    assert.strictEqual(received.subject, emailOpts.subject);

    buffer.close();
  });

  it("next should resolve an already received email", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();
    await mailServer.next(emailOpts.to);

    const received = await buffer.next((_) => true);

    assert.strictEqual(received.from[0]?.address, emailOpts.from);
    assert.strictEqual(received.to[0]?.address, emailOpts.to);
    assert.strictEqual(received.subject, emailOpts.subject);

    buffer.close();
  });

  it("next should resolve out of order mails", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    const subject1 = sendMail("Not Dropped1");
    const subject2 = sendMail("Not Dropped2");
    const subject3 = sendMail("Not Dropped3");
    const subject4 = sendMail("Not Dropped4");

    const mail4 = await buffer.next((m) => m.subject === subject4);
    assert.strictEqual(mail4.subject, subject4);

    const mail3 = await buffer.next((m) => m.subject === subject3);
    assert.strictEqual(mail3.subject, subject3);

    const mail2 = await buffer.next((m) => m.subject === subject2);
    assert.strictEqual(mail2.subject, subject2);

    const mail1 = await buffer.next((m) => m.subject === subject1);
    assert.strictEqual(mail1.subject, subject1);

    buffer.close();
  });

  it("next should consume email by default", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();

    const received = await buffer.next((_) => true);
    assert.strictEqual(received.subject, emailOpts.subject);

    const rejected = buffer.next((_) => true);
    buffer.close();
    await assert.rejects(rejected);
  });

  it("next should not consume an existing mail if specified", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();

    const received1 = await buffer.next((_) => true, false);
    assert.strictEqual(received1.subject, emailOpts.subject);
    const received2 = await buffer.next((_) => true, true);
    assert.strictEqual(received2.subject, emailOpts.subject);
    const rejected = buffer.next((_) => true);

    buffer.close();
    await assert.rejects(rejected);
  });

  it("next should not consume a new mail if specified", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const wait1 = buffer.next((_) => true, false);
    const wait2 = buffer.next((_) => true, false);

    sendMail();

    const received1 = await wait1;
    assert.strictEqual(received1.subject, emailOpts.subject);
    const received2 = await wait2;
    assert.strictEqual(received2.subject, emailOpts.subject);

    const received3 = await buffer.next((_) => true, true);
    assert.strictEqual(received3.subject, emailOpts.subject);

    const rejected = buffer.next((_) => true);
    buffer.close();
    await assert.rejects(rejected);
  });

  it("next should resolve multiple times", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    for (let i = 0; i <= 7; i++) {
      sendMail();
      const received = await buffer.next(() => true);
      assert.strictEqual(received.subject, emailOpts.subject);
    }
    buffer.close();
  });

  it("next should reject promises when closing", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const p1 = buffer.next((_) => true);
    const p2 = buffer.next((_) => true);

    buffer.close();

    await assert.rejects(p1);
    await assert.rejects(p2);
  });

  it("expect should resolve when receiving email", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const p = buffer.expect((_) => true);

    sendMail();

    const received = await p;

    assert.strictEqual(received.from[0]?.address, emailOpts.from);
    assert.strictEqual(received.to[0]?.address, emailOpts.to);
    assert.strictEqual(received.subject, emailOpts.subject);

    buffer.close();
  });

  it("expect should resolve an already received email", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();
    await mailServer.next(emailOpts.to);

    const received = await buffer.expect((_) => true);

    assert.strictEqual(received.from[0]?.address, emailOpts.from);
    assert.strictEqual(received.to[0]?.address, emailOpts.to);
    assert.strictEqual(received.subject, emailOpts.subject);

    buffer.close();
  });

  it("expect should resolve out of order mails", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    const subject1 = sendMail("Not Dropped1");
    const subject2 = sendMail("Not Dropped2");
    const subject3 = sendMail("Not Dropped3");
    const subject4 = sendMail("Not Dropped4");

    const mail4 = await buffer.expect((m) => m.subject === subject4);
    assert.strictEqual(mail4.subject, subject4);

    const mail3 = await buffer.expect((m) => m.subject === subject3);
    assert.strictEqual(mail3.subject, subject3);

    const mail2 = await buffer.expect((m) => m.subject === subject2);
    assert.strictEqual(mail2.subject, subject2);

    const mail1 = await buffer.expect((m) => m.subject === subject1);
    assert.strictEqual(mail1.subject, subject1);

    buffer.close();
  });

  it("expect should consume email by default", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();

    const received = await buffer.expect((_) => true);
    assert.strictEqual(received.subject, emailOpts.subject);

    const rejected = buffer.expect((_) => true);
    buffer.close();
    await assert.rejects(rejected);
  });

  it("expect should not consume an existing mail if specified", async () => {
    const buffer = mailServer.buffer(emailOpts.to);

    sendMail();

    const received1 = await buffer.expect((_) => true, false);
    assert.strictEqual(received1.subject, emailOpts.subject);
    const received2 = await buffer.expect((_) => true, true);
    assert.strictEqual(received2.subject, emailOpts.subject);
    const rejected = buffer.expect((_) => true);

    buffer.close();
    await assert.rejects(rejected);
  });

  it("expect should not consume a new mail if specified", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const wait1 = buffer.expect((_) => true, false);
    const wait2 = buffer.expect((_) => true, false);

    sendMail();

    const received1 = await wait1;
    assert.strictEqual(received1.subject, emailOpts.subject);
    const received2 = await wait2;
    assert.strictEqual(received2.subject, emailOpts.subject);

    const received3 = await buffer.expect((_) => true, true);
    assert.strictEqual(received3.subject, emailOpts.subject);

    const rejected = buffer.expect((_) => true);
    buffer.close();
    await assert.rejects(rejected);
  });

  it("expect should resolve multiple times", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    for (let i = 0; i <= 7; i++) {
      sendMail();
      const received = await buffer.expect(() => true);
      assert.strictEqual(received.subject, emailOpts.subject);
    }
    buffer.close();
  });

  it("should reject promises when closing", async () => {
    const buffer = mailServer.buffer(emailOpts.to);
    const p1 = buffer.expect((_) => true);
    const p2 = buffer.expect((_) => true);

    buffer.close();

    await assert.rejects(p1);
    await assert.rejects(p2);
  });

  it("expect should timeout", async () => {
    const buffer = mailServer.buffer(emailOpts.to, 200);
    const p1 = buffer.expect((_) => true);
    const p2 = buffer.expect((_) => true, true, 200);

    await assert.rejects(p1);
    await assert.rejects(p2);

    buffer.close();
  });
});
