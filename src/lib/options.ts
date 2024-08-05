import type { MailDevOptions } from "../index";

const program = require("commander").program;
const pkg = require("../../package.json");
const fs = require("fs");

const options = [
  // General config
  ["-v, --verbose"],
  ["--silent"],
  ["--log-mail-contents", "Log a JSON representation of each incoming email"],
  // SMTP server parameters
  ["-s, --smtp <port>", "MAILDEV_SMTP_PORT", "SMTP port to catch emails", 1025, (x) => parseInt(x)],
  ["--ip <ip address>", "MAILDEV_IP", "IP Address to bind SMTP service to", "0.0.0.0"],
  ["--mail-directory <path>", "MAILDEV_MAIL_DIRECTORY", "Directory for persisting mails"],
  ["--incoming-user <user>", "MAILDEV_INCOMING_USER", "SMTP user for incoming emails"],
  ["--incoming-pass <pass>", "MAILDEV_INCOMING_PASS", "SMTP password for incoming emails"],
  ["--incoming-secure", "MAILDEV_INCOMING_SECURE", "Use SMTP SSL for incoming emails", false],
  ["--incoming-cert <path>", "MAILDEV_INCOMING_CERT", "Cert file location for incoming SSL"],
  ["--incoming-key <path>", "MAILDEV_INCOMING_KEY", "Key file location for incoming SSL"],
  [
    "--hide-extensions <extensions>",
    "MAILDEV_HIDE_EXTENSIONS",
    "Comma separated list of SMTP extensions to NOT advertise (SMTPUTF8, PIPELINING, 8BITMIME)",
    [],
    (val) => val.split(","),
  ],
  // Outgoing parameters
  [
    "--auto-relay [email]",
    "MAILDEV_AUTO_RELAY",
    "Use auto-relay mode. Optional relay email address",
  ],
  ["--outgoing-host <host>", "MAILDEV_OUTGOING_HOST", "SMTP host for outgoing emails"],
  [
    "--outgoing-port <port>",
    "MAILDEV_OUTGOING_PORT",
    "SMTP port for outgoing emails",
    (x) => parseInt(x),
  ],
  ["--outgoing-user <user>", "MAILDEV_OUTGOING_USER", "SMTP user for outgoing emails"],
  ["--outgoing-pass <password>", "MAILDEV_OUTGOING_PASS", "SMTP password for outgoing emails"],
  ["--outgoing-secure", "MAILDEV_OUTGOING_SECURE", "Use SMTP SSL for outgoing emails", false],
  ["--auto-relay-rules <file>", "MAILDEV_AUTO_RELAY_RULES", "Filter rules for auto relay mode"],
  // Web app config
  [
    "--disable-web",
    "MAILDEV_DISABLE_WEB",
    "Disable the use of the web interface. Useful for unit testing",
    false,
  ],
  ["-w, --web <port>", "MAILDEV_WEB_PORT", "Port to run the Web GUI", 1080, (x) => parseInt(x)],
  [
    "--web-ip <ip address>",
    "MAILDEV_WEB_IP",
    "IP Address to bind HTTP service to, defaults to --ip",
  ],
  ["--web-user <user>", "MAILDEV_WEB_USER", "HTTP user for GUI"],
  ["--web-pass <password>", "MAILDEV_WEB_PASS", "HTTP password for GUI"],
  ["--base-pathname <path>", "MAILDEV_BASE_PATHNAME", "Base path for URLs"],
  ["--https", "MAILDEV_HTTPS", "Switch from http to https protocol", false],
  ["--https-key <file>", "MAILDEV_HTTPS_KEY", "The file path to the ssl private key"],
  ["--https-cert <file>", "MAILDEV_HTTPS_CERT", "The file path to the ssl cert file"],
];

interface CliOptions {
  verbose?: boolean;
  silent?: boolean;
  logMailContents?: boolean;
  smtp?: number;
  ip?: string;
  mailDirectory?: string;
  incomingUser?: string;
  incomingPass?: string;
  incomingSecure?: boolean;
  incomingCert?: string;
  incomingKey?: string;
  hideExtensions?: string[];
  outgoingHost?: string;
  outgoingPort?: number;
  outgoingUser?: string;
  outgoingPass?: string;
  outgoingSecure?: boolean;
  autoRelay?: string;
  autoRelayRules?: string | { allow?: string; deny?: string }[];
  disableWeb?: boolean;
  web?: number;
  webIp?: string;
  webUser?: string;
  webPass?: string;
  basePathname?: string;
  https?: boolean;
  httpsKey?: string;
  httpsCert?: string;
}

export function appendOptions(program, options) {
  return options.reduce(function (chain, option) {
    const flag = option[0] as string;
    const envVariable = typeof option[1] === "string" ? option[1] : undefined;
    const description = typeof option[2] === "string" ? option[2] : undefined;
    const defaultValue = envVariable ? (process.env[envVariable] ?? option[3]) : option[3];
    const fn = option[4];

    return fn
      ? chain.option(flag, description, fn, defaultValue)
      : chain.option(flag, description, defaultValue);
  }, program);
}

export function cliOptions(): MailDevOptions {
  const config: CliOptions = appendOptions(
    program.version(pkg.version).allowUnknownOption(true),
    options,
  )
    .parse(process.argv)
    .opts();

  let web;

  if (!config?.disableWeb) {
    var secure;
    if (config?.https) {
      if (!config?.httpsKey || fs.existsSync(config?.httpsKey) === false) {
        throw new Error(
          "Unable to find https secure key. Please specify key file via -https-key argument",
        );
      }
      if (!config?.httpsCert || fs.existsSync(config?.httpsCert) === false) {
        throw new Error(
          "Unable to find https secure cert. Please specify cert file via -https-cert argument",
        );
      }
      secure = {
        cert: config?.httpsCert,
        key: config?.httpsKey,
      };
    }
    web = {
      disabled: false,
      port: config?.web,
      host: config?.webIp,
      basePathname: config?.basePathname,
      auth:
        config?.webUser && config?.webPass
          ? { user: config?.webUser, pass: config?.webPass }
          : undefined,
      ssl: secure,
    };
  } else {
    web = { disabled: true };
  }

  return {
    verbose: config?.verbose,
    silent: config?.silent,
    logMailContents: config?.logMailContents,
    port: config?.smtp,
    host: config?.ip,
    mailDir: config?.mailDirectory,
    auth:
      config?.incomingUser && config?.incomingPass
        ? {
            user: config?.incomingUser,
            pass: config?.incomingPass,
          }
        : undefined,
    isSecure: config?.incomingSecure,
    ssl:
      config?.incomingCert && config?.incomingKey
        ? {
            certPath: config?.incomingCert,
            keyPath: config?.incomingKey,
          }
        : undefined,
    hide8BITMIME: (config?.hideExtensions ?? []).includes("8BITMIME"),
    hidePIPELINING: (config?.hideExtensions ?? []).includes("PIPELINING"),
    hideSMTPUTF8: (config?.hideExtensions ?? []).includes("SMTPUTF8"),
    outgoing:
      config?.autoRelay || config?.autoRelayRules
        ? {
            host: config?.outgoingHost,
            port: config?.outgoingPort,
            secure: config?.outgoingSecure,
            auth:
              config?.outgoingUser && config?.outgoingPass
                ? { user: config?.outgoingUser, pass: config?.outgoingPass }
                : undefined,
            autoRelayAddress: config?.autoRelay,
            autoRelayRules: config?.autoRelayRules,
          }
        : undefined,
    web,
  };
}
