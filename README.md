# MailDev
[![npm](https://img.shields.io/npm/v/@timshel_npm/maildev)](https://www.npmjs.com/package/@timshel_npm/maildev)
[![Docker Pulls](https://img.shields.io/docker/pulls/timshel/maildev)](https://hub.docker.com/r/timshel/maildev)
[![License](https://img.shields.io/npm/l/maildev?color=white)](/LICENSE)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-black.svg)](https://prettier.io/)


> This is a fork of ⭐️ **[maildev/maildev](https://github.com/maildev/maildev)** with a focus on a better api for Playwright tests.
>
> The goal of the fork is to:
> - Update dependencies
> - Swtich to TypeScript
> - Add more event listeners method
> - Add async support
> - Add additionnal features
>   - `mailEventSubjectMapper` allow to define custom event `subject` (by default use the first recipient)
>   - `MailBuffer` allows to easily query and `await` emails
>
> :warning: Due to extensive mofitications migrate with caution. :warning:

**MailDev** is a simple way to test your project's generated email during development, with an easy to use web interface that runs on your machine built on top of [Node.js](http://www.nodejs.org).

![MailDev Screenshot](https://github.com/maildev/maildev/blob/gh-pages/images/screenshot-2021-01-03.png?raw=true)

## Npm / Yarn

Available on `npm` at [@timshel_npm/maildev](https://www.npmjs.com/package/@timshel_npm/maildev).
Or can be installed using [Github](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#git-urls-as-dependencies).

Ex:
```json
"devDependencies": {
    "maildev": "github:timshel/maildev#3.2.10",
    "maildev": "npm:@timshel_npm/maildev@^3.2.10"
}
```

## API

MailDev can be used in your Node.js application. For more info view the [API docs](https://github.com/timshel/maildev/blob/master/docs/api.md).

Example in a Playwright test:
```javascript
import { test, expect, type TestInfo } from '@playwright/test';
import { MailDev } from 'maildev';

let mailserver;

test.beforeAll('Setup', async ({ browser }, testInfo: TestInfo) => {
    mailserver = new MailDev({
        port: process.env.MAILDEV_SMTP_PORT,
        web: { port: process.env.MAILDEV_HTTP_PORT },
    })

    await mailserver.listen();
});

test.afterAll('Teardown', async ({}) => {
    utils.stopVault();
    if( mailserver ){
        await mailserver.close();
    }
});

test('2fa', async ({ page }) => {
    const mailBuffer = mailserver.buffer("test@yopmail.com");

    await test.step('login', async () => {
        await page.goto('/');

        await page.getByLabel(/Email address/).fill("test@yopmail.com");
        await page.getByRole('button', { name: 'Continue' }).click();
        await page.getByLabel('Master password').fill("test@yopmail.com");
        await page.getByRole('button', { name: 'Log in with master password' }).click();

        const code = await test.step('retrieve code', async () => {
            const codeMail = await mailBuffer.expect((mail) => mail.subject.includes("Login Verification Code"));
            const page2 = await page.context().newPage();
            await page2.setContent(codeMail.html);
            const code = await page2.getByTestId("2fa").innerText();
            await page2.close();
            return code;
        });

        await page.getByLabel(/Verification code/).fill(code);
        await page.getByRole('button', { name: 'Continue' }).click();
        await expect(page).toHaveTitle(/Vaults/);

        await mailBuffer.expect((m) => m.subject === "Welcome");
        await mailBuffer.expect((m) => m.subject === "New Device Logged In From Firefox");
    })

    mailBuffer.close();
});

```

MailDev also has a **REST API**. For more info
[view the docs](https://github.com/timshel/maildev/blob/master/docs/rest.md).

## Docker Run

If you want to use MailDev with [Docker](https://www.docker.com/), you can use the
[**timshel/maildev** image on Docker Hub](https://hub.docker.com/r/timshel/maildev).
For a guide for usage with Docker,
[checkout the docs](https://github.com/timshel/maildev/blob/master/docs/docker.md).

    $ docker run -p 1080:1080 -p 1025:1025 timshel/maildev

By default the following environment variables are set:

- MAILDEV_WEB_PORT=1080
- MAILDEV_SMTP_PORT=1025
- MAILDEV_MAIL_DIRECTORY=/tmp/maildev

## Usage

```
Usage: maildev [options]
```

| Options                          | Environment variable       | Description                                                                               |
| -------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `-s, --smtp <port>`              | `MAILDEV_SMTP_PORT`        | SMTP port to catch mail                                                                   |
| `-w, --web <port>`               | `MAILDEV_WEB_PORT`         | Port to run the Web GUI                                                                   |
| `--mail-directory <path>`        | `MAILDEV_MAIL_DIRECTORY`   | Directory for persisting mail                                                             |
| `--https`                        | `MAILDEV_HTTPS`            | Switch from http to https protocol                                                        |
| `--https-key <file>`             | `MAILDEV_HTTPS_KEY`        | The file path to the ssl private key                                                      |
| `--https-cert <file>`            | `MAILDEV_HTTPS_CERT`       | The file path to the ssl cert file                                                        |
| `--ip <ip address>`              | `MAILDEV_IP`               | IP Address to bind SMTP service to                                                        |
| `--outgoing-host <host>`         | `MAILDEV_OUTGOING_HOST`    | SMTP host for outgoing mail                                                               |
| `--outgoing-port <port>`         | `MAILDEV_OUTGOING_PORT`    | SMTP port for outgoing mail                                                               |
| `--outgoing-user <user>`         | `MAILDEV_OUTGOING_USER`    | SMTP user for outgoing mail                                                               |
| `--outgoing-pass <password>`     | `MAILDEV_OUTGOING_PASS`    | SMTP password for outgoing mail                                                           |
| `--outgoing-secure`              | `MAILDEV_OUTGOING_SECURE`  | Use SMTP SSL for outgoing mail                                                            |
| `--auto-relay [email]`           | `MAILDEV_AUTO_RELAY`       | Use auto-relay mode. Optional relay email address                                         |
| `--auto-relay-rules <file>`      | `MAILDEV_AUTO_RELAY_RULES` | Filter rules for auto relay mode                                                          |
| `--incoming-user <user>`         | `MAILDEV_INCOMING_USER`    | SMTP user for incoming mail                                                               |
| `--incoming-pass <pass>`         | `MAILDEV_INCOMING_PASS`    | SMTP password for incoming mail                                                           |
| `--incoming-secure`              | `MAILDEV_INCOMING_SECURE`  | Use SMTP SSL for incoming emails                                                          |
| `--incoming-cert <path>`         | `MAILDEV_INCOMING_CERT`    | Cert file location for incoming SSL                                                       |
| `--incoming-key <path>`          | `MAILDEV_INCOMING_KEY`     | Key file location for incoming SSL                                                        |
| `--web-ip <ip address>`          | `MAILDEV_WEB_IP`           | IP Address to bind HTTP service to, defaults to --ip                                      |
| `--web-user <user>`              | `MAILDEV_WEB_USER`         | HTTP user for GUI                                                                         |
| `--web-pass <password>`          | `MAILDEV_WEB_PASS`         | HTTP password for GUI                                                                     |
| `--web-domain <domain>`          | `MAILDEV_WEB_DOMAIN`       | External domain name (used for socket CORS, "*" otherwise)                                |
| `--base-pathname <path>`         | `MAILDEV_BASE_PATHNAME`    | Base path for URLs                                                                        |
| `--disable-web`                  | `MAILDEV_DISABLE_WEB`      | Disable the use of the web interface. Useful for unit testing                             |
| `--hide-extensions <extensions>` | `MAILDEV_HIDE_EXTENSIONS`  | Comma separated list of SMTP extensions to NOT advertise (SMTPUTF8, PIPELINING, 8BITMIME) |
| `-o, --open`                     |                            | Open the Web GUI after startup                                                            |
| `-v, --verbose`                  | `MAILDEV_VERBOSE`          | Display log level message                                                                 |
| `--silent`                       | `MAILDEV_SILENT`           | Display only error level message (ignored if `verbose` is active)                         |
| `--log-mail-contents`            | `MAILDEV_LOG_CONTENT`      | Log a JSON representation of each incoming mail                                           |


## Outgoing email

Maildev optionally supports selectively relaying email to an outgoing SMTP server. If you configure outgoing
email with the --outgoing-* options you can click "Relay" on an individual email to relay through MailDev out
to a real SMTP service that will *actually\* send the email to the recipient.

Example:

    $ maildev --outgoing-host smtp.gmail.com \
              --outgoing-secure \
              --outgoing-user 'you@gmail.com' \
              --outgoing-pass '<pass>'

### Auto relay mode

Enabling the auto relay mode will automatically send each email to it's recipient
without the need to click the "Relay" button mentioned above.
The outgoing email options are required to enable this feature.

Optionally you may pass an single email address which Maildev will forward all
emails to instead of the original recipient. For example, using
`--auto-relay you@example.com` will forward all emails to that address
automatically.

Additionally, you can pass a valid json file with additional configuration for
what email addresses you would like to `allow` or `deny`. The last matching
rule in the array will be the rule MailDev will follow.

Example:

    $ maildev --outgoing-host smtp.gmail.com \
              --outgoing-secure \
              --outgoing-user 'you@gmail.com' \
              --outgoing-pass '<pass>' \
              --auto-relay \
              --auto-relay-rules file.json

Rules example file:

```javascript
[
  { "allow": "*" },
  { "deny": "*@test.com" },
  { "allow": "ok@test.com" },
  { "deny": "*@utah.com" },
  { "allow": "johnny@utah.com" }
]
```

This would allow `angelo@fbi.gov`, `ok@test.com`, `johnny@utah.com`, but deny
`bodhi@test.com`.

## Configure your project

Configure your application to send emails via port `1025` and open `localhost:1080` in your browser.

**Nodemailer (v1.0+)**

```javascript
// We add this setting to tell nodemailer the host isn't secure during dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const transport = nodemailer.createTransport({
  port: 1025,
  // other settings...
});
```

**Django** -- Add `EMAIL_PORT = 1025` in your settings file [[source]](https://docs.djangoproject.com/en/dev/ref/settings/#std:setting-EMAIL_PORT)

**Rails** -- config settings:

```ruby
config.action_mailer.delivery_method = :smtp
    config.action_mailer.smtp_settings = {
        address: "localhost",
        port: 1025,
        enable_starttls_auto: false
    }
```

**Drupal** -- Install and configure [SMTP](https://www.drupal.org/project/smtp) module or use a library like [SwiftMailer](http://swiftmailer.org/).

## Features

- Toggle between HTML, plain text views as well as view email headers
- Test responsive emails with resizable preview pane available for various screen sizes
- Ability to receive and view email attachments
- WebSocket integration keeps the interface in sync once emails are received
- Command line interface for configuring SMTP and web interface ports
- Ability to relay email to an upstream SMTP server

## Ideas

If you're using MailDev and you have a great idea, I'd love to hear it. If you're not using MailDev because it lacks a feature, I'd love to hear that too. Add an issue to the repo [here](https://github.com/timshel/maildev/issues/new).

## Contributing

Any help on MailDev would be awesome. There is plenty of room for improvement. Feel free to [create a Pull Request](https://github.com/timshel/maildev/issues/new) from small to big changes.

To run **MailDev** during development:

    npm install
    npm run dev

The "dev" task will run MailDev using nodemon and restart automatically when
changes are detected. On `*.scss` file save, the css will also be recompiled.
Using `test/send.js`, a few test emails will be sent every time the application
restarts.

If you want to debug you can use the `nodemon` debug profile in VSCode. To change arguments or environment variables edit the `.vscode\launch.json`.

The project uses the [JavaScript Standard coding style](https://standardjs.com).
To lint your code before submitting your PR, run `npm run lint`.

To run the test suite:

    $ npm test

## [Changelog](https://github.com/maildev/maildev/releases)

## Thanks

**MailDev** is built on using great open source projects including
[Express](http://expressjs.com),
[AngularJS](http://angularjs.org/),
[Font Awesome](http://fontawesome.io/) and two great projects from
[Andris Reinman](https://github.com/andris9):
[smtp-server](https://github.com/nodemailer/smtp-server)
and [mailparser](https://github.com/nodemailer/mailparser).
Many thanks to Andris as his projects are the backbone of this app and to
[MailCatcher](http://mailcatcher.me/) for the inspiration.

Additionally, thanks to all the awesome [contributors](https://github.com/maildev/maildev/graphs/contributors)
to the project.

## License

MIT
