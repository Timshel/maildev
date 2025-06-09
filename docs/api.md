# API

MailDev provides an API to use in your Node.js applications.

## Basic usage example

```javascript
const MailDev = require('maildev')

const maildev = new MailDev({
  smtp: 1025 // incoming SMTP port - default is 1025
})

maildev.listen(function(err) {
  console.log('We can now sent emails to port 1025!')
})

// Print new emails to the console as they come in
maildev.on('new', function(email){
  console.log('Received new email with subject: %s', email.subject)
})

// Get all emails
maildev.getAllEmail(function(err, emails){
  if (err) return console.log(err)
  console.log('There are %s emails', emails.length)
})
```

## Async usage example

```javascript
const MailDev = require('maildev')

const maildev = new MailDev({
  smtp: 1025 // incoming SMTP port - default is 1025
})

await maildev.listen();

// Create a MailBuffer to easily query and await news mails
const mailBuffer = maildev.buffer(users.user1.email);

-- Take an action to generate mails.

// Wait forever for the Email to arrive.
const codeMail = await mailBuffer.next((mail) => mail.subject.includes("Login Verification Code"));

-- Take an action to generate more mails.

// Await at most 10s for the Welcome email (default timeout)
await mailBuffer.expect((m) => m.subject === "Welcome");

await mailBuffer.close();
await maildev.close();
```

## Use Maildev as a middleware

We can use maildev within an existing app by giving an additional parameter
`basePathname` to the options object. We use a proxy to redirect all maildev requests
to the maildev app.

Here is an exemple to achieve this:

```javascript
const express = require('express')
const proxyMiddleware = require('http-proxy-middleware')
const MailDev = require('maildev')
const app = express()

// some business with the existing app

// Define a route for the base path
const maildev = new MailDev({
  basePathname: '/maildev'
})

// Maildev now running on localhost:1080/maildev
maildev.listen(function (err) {
  console.log('We can now sent emails to port 1025!')
})

// proxy all maildev requests to the maildev app
const proxy = proxyMiddleware('/maildev', {
  target: `http://localhost:1080`,
  ws: true,
})

// Maildev available at the specified route '/maildev'
app.use(proxy)
```

The maildev app will be running at `http://localhost:1080/maildev`
but we'll be able to reach it directly from our existing webapp
via the specified route we defined `localhost:3000/maildev`

## Relay emails

MailDev can relay a given email to the given "to" address. This example will
relay every email sent to "johnny.utah@fbi.gov":

```javascript
const MailDev = require('maildev')

const maildev = new MailDev({
  outgoingHost: 'smtp.gmail.com',
  outgoingUser: 'test@gmail.com',
  outgoingPass: '********'
})

maildev.listen()

// Print new emails to the console as they come in
maildev.on('new', function (email) {
  if (email.to.address === 'johnny.utah@fbi.gov') {
    maildev.relayMail(email)
      .then(()=> console.log('Email has been relayed!') )
      .catch(console.log)
  }
})
```

## API methods

*All callbacks follow the Node error-first pattern, ex.* `function(err, data){...`

**listen(callback)** - Starts the smtp server

**close(callback)** - Stops the smtp server

**getEmail(id): Promise<Mail>** - Accepts email id, returns email object

**getRawEmail(id): Promise<ReadStream>** - Returns a readable stream of the raw email

**getAllEmail(callback): Promise<Mail[]>** - Returns array of all email

**deleteEmail(id): Promise<boolean>** - Deletes a given email by id

**deleteAllEmail(): Promise<boolean>** - Deletes all email and their attachments

**getEmailAttachment(id, filename): Promise<Attachment>** - Returns the specific attachment

**relayMail(id): Promise<void>** - If configured, this will relay/send the given
email to it's "to" address. Also accepts an email object instead of id.

**setAutoRelayMode(enabled, email, rules)** - If relay configured, this will auto relay/send emails received
to it's "to" address. The rules allows to filters the emails to send.

## Event Methods

When receiving an email two events are emitted with the subject being `new` and the return value of the `mailEventSubjectMapper` parameter which by default select the first recipient.

### Async

The `close` and `delete` event subjects are reserved and cannot be used to wait for emails.

**next(subject): Promise<Mail>** - Promised with the next received email with matching event subject.

**iterator(subject): AsyncIterator<Mail>** - Generator to iterate over received email with matching event subject.
Use an internal array to store received email even when not consumming. Don't forget to use `.return()` to close it.

**buffer(subject, defaultTimeout: number = 10000): MailBuffer** - Return a struct which store received emails (Timeout is used when calling `expect`).
-**MailBuffer.next( (Mail) => boolean, consume: boolean = true)** allows to wait for a specific `Mail` independant of the order of arrival.
-**MailBuffer.expect( (Mail) => boolean, consume: boolean = true, timeout?: number)** is similar but will timeout

### Callbacks

**on('new', callback)** - Event called when a new email is received. Callback
receives single mail object.

**once('new', callback)** - Add a one time event called when a new email is received. Callback
receives single mail object.

**off('new', callback)** - Alias for removeListener()

**prependListener('new', callback)** - Event called when a new email is received. Callback
receives single mail object. Add the listener to the beginning of the listeners array.

**prependOnceListener('new', callback)** - Add a one time event called when a new email is received. Callback
receives single mail object. Add the listener to the beginning of the listeners array.

**removeListener('new', callback)** - Remove the previously added event listener (at most once).

**removeAllListeners('new')** - Removes all listeners, or those of the specified eventName.

