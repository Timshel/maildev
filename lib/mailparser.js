const crypto = require('crypto')
const mime = require('mime')
const simpleParser = require('mailparser').simpleParser
const strtotime = require('./helpers/strtotime')

module.exports = function parse (input, callback) {
  simpleParser(input, {}, (err, mail) => {
    if (mail) {
      mail.headers = Object.fromEntries(mail.headers)

      if (!mail.headers.priority) {
        mail.headers.priority = 'normal'
      }
      mail.headers.date = mail.headers.date ?? new Date()
      mail.date = mail.date ?? mail.headers.date
      mail.headers.received = typeof mail.headers.received === 'string' ? [mail.headers.received] : mail.headers.received
      mail.receivedDate = parseReceived(mail.date, mail.headers.received, mail.headers['x-received'])

      mail.references = (
        typeof mail.references === 'string' ? [mail.references] : mail.references ?? []
      ).map((ref) => { return ref.replace(/^<(.*)>$/, '$1') })

      mail.inReplyTo = (
        mail.inReplyTo ? mail.inReplyTo.match(/<([^<>]*)>/g) : []
      ).map((ref) => { return ref.replace(/^<(.*)>$/, '$1') })

      mail.replyTo = mail?.replyTo?.value
      mail.from = mail?.from?.value
      mail.to = mail?.to?.value
      mail.cc = mail?.cc?.value
      mail.bcc = mail?.bcc?.value

      const fileNames = []
      for (const attachment of mail.attachments ?? []) {
        attachment.generatedFileName = generateFileNames(fileNames, attachment.filename, attachment.contentType)

        if (!attachment.contentId && attachment.generatedFileName) {
          attachment.contentId = crypto.createHash('md5')
            .update(Buffer.from(attachment.generatedFileName, 'utf-8'))
            .digest('hex') + '@mailparser'
        }
      }
    }

    callback(err, mail)
  })
}

/**
 * <p>Generates a context unique filename for an attachment</p>
 *
 * <p>If a filename already exists, append a number to it</p>
 *
 * <ul>
 *     <li>file.txt</li>
 *     <li>file-1.txt</li>
 *     <li>file-2.txt</li>
 * </ul>
 *
 * @param {String} fileName source filename
 * @param {String} contentType source content type
 * @returns {String} generated filename
 */
function generateFileNames (fileNames, fileName, contentType) {
  let ext; let defaultExt = ''

  if (contentType) {
    defaultExt = mime.getExtension(contentType)
    defaultExt = defaultExt ? '.' + defaultExt : ''
  }

  fileName = fileName || 'attachment' + defaultExt

  // remove path if it is included in the filename
  fileName = fileName.toString().split(/[/\\]+/).pop().replace(/^\.+/, '') || 'attachment'
  const fileRootName = fileName.replace(/(?:-\d+)+(\.[^.]*)$/, '$1') || 'attachment'

  if (fileRootName in fileNames) {
    fileNames[fileRootName]++
    ext = fileName.substr((fileName.lastIndexOf('.') || 0) + 1)
    if (ext === fileName) {
      fileName += '-' + fileNames[fileRootName]
    } else {
      fileName = fileName.substr(0, fileName.length - ext.length - 1) + '-' + fileNames[fileRootName] + '.' + ext
    }
  } else {
    fileNames[fileRootName] = 0
  }

  return fileName
};

/**
 * <p>Parses Received and X-Received header field value</p>
 *
 * <p>Pulls received date from the received and x-received header fields and
 * update current node meta object with this date as long as it's later as the
 * existing date of the meta object</p>
 *
 * <p>Example: <code>by 10.25.25.72 with SMTP id 69csp2404548lfz; Fri, 6 Feb 2015 15:15:32 -0800 (PST)</code>
 * will become:
 * </p>
 *
 * <pre>new Date('2015-02-06T23:15:32.000Z')</pre>
 *
 * @param {String} value Received string
 * @returns {Date|Boolean} parsed received date
 */
function parseReceived (date, received, xReceived) {
  let receivedDate

  function parse (value) {
    const splitString = value.split(';')
    return parseDateString(splitString[splitString.length - 1])
  }

  if (received && received.length > 0) {
    receivedDate = parse(received[0])
  }

  if (!receivedDate && xReceived) {
    receivedDate = parse(xReceived)
  }

  return !receivedDate || date > receivedDate ? date : receivedDate
};

/**
 * <p>Parses date string</o>
 *
 * <p>Receives possible date string in different formats and
 * transforms it into a JS Date object</p>
 *
 * @param {String} value possible date string
 * @returns {Date|Boolean} date object
 */
function parseDateString (value) {
  let date

  date = new Date(value)
  if (Object.prototype.toString.call(date) !== '[object Date]' || date.toString() === 'Invalid Date') {
    try {
      date = strtotime(value)
    } catch (E) {
      return false
    }
    if (date) {
      date = new Date(date * 1000)
    } else {
      return false
    }
  }

  return date
};
