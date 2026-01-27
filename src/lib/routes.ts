"use strict";

import { MailServer } from "./mailserver";
import { filterEmails } from "./utils";

/**
 * MailDev - routes
 */
const express = require("express");
const compression = require("compression");
const pkg = require("../../package.json");

const emailRegexp =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export function routes(app, mailserver: MailServer, basePathname: string) {
  const router = express.Router();

  // Get all emails Enveloppe
  router.get("/envelope", compression(), function (req, res) {
    res.status(200).json(mailserver.getAllEnvelope());
  });

  // Get all emails
  router.get("/email", compression(), function (req, res) {
    mailserver
      .getAllEmail()
      .then((mails) => res.status(200).json(req.query ? filterEmails(mails, req.query) : mails))
      .catch((err) => res.status(500).json({ error: err.message }));
  });

  // Get single email
  router.get("/email/:id", function (req, res) {
    mailserver
      .getEmail(req.params.id)
      .then((mail) => {
        mail.envelope.isRead = true; // Mark the email as 'read'
        res.status(200).json(mail);
      })
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Read email
  // router.patch('/email/:id/read', function (req, res) {
  //  mailserver.readEmail(req.params.id, function (err, email) {
  //    if (err) return res.status(500).json({ error: err.message })
  //    res.json(true)
  //  })
  // })

  // Read all emails
  router.patch("/email/read-all", function (req, res) {
    const count = mailserver.readAllEmail();
    res.status(200).json(count);
  });

  // Delete all emails
  router.delete("/email/all", function (req, res) {
    mailserver
      .deleteAllEmail()
      .then((count) => res.status(200).json(count))
      .catch((err) => res.status(500).json({ error: err.message }));
  });

  // Delete email by id
  router.delete("/email/:id", function (req, res) {
    mailserver
      .deleteEmail(req.params.id)
      .then((deleted) => res.status(200).json(deleted))
      .catch((err) => res.status(500).json({ error: err.message }));
  });

  // Get Email HTML
  router.get("/email/:id/html", function (req, res) {
    // Use the headers over hostname to include any port
    const baseUrl = req.headers.host + (req.baseUrl || "");
    mailserver
      .getEmailHTML(req.params.id, baseUrl)
      .then((html) => res.status(200).send(html))
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Serve Attachments
  router.get("/email/:id/attachment/:filename", function (req, res) {
    mailserver
      .getEmailAttachment(req.params.id, req.params.filename)
      .then((attachement) => {
        res.contentType(attachement.contentType);
        res.status(200).send(attachement.content);
      })
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Serve email.eml
  router.get("/email/:id/download", function (req, res) {
    mailserver
      .getEmailEml(req.params.id)
      .then(([contentType, filename, stream]) => {
        res.setHeader("Content-disposition", "attachment; filename=" + filename);
        res.contentType(contentType);
        stream.pipe(res);
      })
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Get email source from .eml file
  router.get("/email/:id/source", function (req, res) {
    mailserver
      .getRawEmail(req.params.id)
      .then((stream) => stream.pipe(res))
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Get any config settings for display
  router.get("/config", function (req, res) {
    res.status(200).json({
      version: pkg.version,
      smtpPort: mailserver.port,
      isOutgoingEnabled: mailserver.isOutgoingEnabled(),
      outgoingHost: mailserver.getOutgoingHost(),
    });
  });

  // Relay the email
  router.post("/email/:id/relay{/:relayTo}", function (req, res) {
    mailserver
      .getEmail(req.params.id)
      .then((mail) => {
        if (req.params.relayTo) {
          if (emailRegexp.test(req.params.relayTo)) {
            mail.to = [{ address: req.params.relayTo, name: "" }];
            mail.envelope.to = [{ address: req.params.relayTo, name: "" }];
          } else {
            return res.status(400).json({
              error: "Incorrect email address provided :" + req.params.relayTo,
            });
          }
        }

        return mailserver
          .relayMail(mail, false)
          .then(() => res.status(200).json(true))
          .catch((err) => res.status(500).json({ error: err.message }));
      })
      .catch((err) => res.status(404).json({ error: err.message }));
  });

  // Health check
  router.get("/healthz", function (req, res) {
    res.status(200).json(true);
  });

  router.get("/reloadMailsFromDirectory", function (req, res) {
    mailserver.loadMailsFromDirectory();
    res.status(200).json(true);
  });
  app.use(basePathname, router);
}
