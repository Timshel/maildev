"use strict";

/**
 * MailDev - web
 */
import { MailServer } from "./mailserver";

const express = require("express");
const cors = require("cors");
const http = require("http");
const https = require("https");
const socketio = require("socket.io");
const routes = require("./routes");
const auth = require("./auth");
const logger = require("./logger");
const path = require("path");

export interface WebOptions {
  port?: number;
  host?: string;
  basePathname?: string;
  auth?: { user: string; pass: string };
  ssl?: { cert: string; key: string };
}

export class Web {
  port: number;
  host: string;
  basePathname: string;
  /**
   * Keep record of all connections to close them on shutdown
   */
  connections = {};
  server;
  io;

  constructor(mailserver: MailServer, options?: WebOptions) {
    const app = express();

    this.port = options?.port ?? 1080;
    this.host = options?.host ?? "0.0.0.0";
    this.basePathname = options?.basePathname ?? "/";

    this.server = options?.ssl ? https.createServer(options?.ssl, app) : http.createServer(app);

    if (options?.auth) {
      app.use(auth(options?.auth?.user, options?.auth?.pass));
    }

    this.io = socketio({ path: path.posix.join(this.basePathname, "/socket.io") });

    app.use(this.basePathname, express.static(path.join(__dirname, "../app")));

    app.use(cors());

    routes(app, mailserver, this.basePathname);

    this.io.attach(this.server);
    this.io.on("connection", webSocketConnection(mailserver));
  }

  listen(): Promise<void> {
    const self = this;

    this.server.on("connection", (socket) => {
      const key = `${socket.remoteAddress}:${socket.remotePort}`;
      self.connections[key] = socket;
      socket.on("close", function () {
        delete self.connections[key];
      });
    });

    return new Promise((resolve, reject) => {
      self.server.listen(self.port, self.host, () => {
        logger.info(
          "MailDev webapp running at http://%s:%s%s",
          self.host,
          self.port,
          self.basePathname,
        );
        resolve();
      });
    });
  }

  close(): Promise<void> {
    const self = this;
    closeConnections(this.connections);
    return new Promise((resolve, reject) => {
      self.io.close(resolve);
    });
  }
}

function closeConnections(connections) {
  for (const key in connections) {
    connections[key].destroy();
  }
}

/**
 * WebSockets
 */

function webSocketConnection(mailserver) {
  return function onConnection(socket) {
    const newHandler = (mail) => {
      socket.emit("newMail", mail);
    };
    const deleteHandler = (mail) => {
      socket.emit("deleteMail", mail);
    };

    mailserver.on("new", newHandler);
    mailserver.on("delete", deleteHandler);

    socket.on("disconnect", () => {
      mailserver.removeListener("new", newHandler);
      mailserver.removeListener("delete", deleteHandler);
    });
  };
}
