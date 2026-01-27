"use strict";

/**
 * MailDev - logger.js
 */

let logLevel = 1;

export function setLevel(level) {
  logLevel = level;
}

/**
 * The error method will always log to the console
 */
export function error() {
  console.error.apply(console, arguments);
}

/**
 * Log only when set to verbose (2)
 */
export function log() {
  if (logLevel > 1) {
    console.log.apply(console, arguments);
  }
}

export function info() {
  if (logLevel > 0) {
    console.info.apply(console, arguments);
  }
}

export function warn() {
  if (logLevel > 0) {
    console.warn.apply(console, arguments);
  }
}
