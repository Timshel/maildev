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
export function error(...args) {
  console.error.apply(console, args);
}

/**
 * Log only when set to verbose (2)
 */
export function log(...args) {
  if (logLevel > 1) {
    console.log.apply(console, args);
  }
}

export function info(...args) {
  if (logLevel > 0) {
    console.info.apply(console, args);
  }
}

export function warn(...args) {
  if (logLevel > 0) {
    console.warn.apply(console, args);
  }
}
