"use strict";

import type { Mail } from "./type";

// Create an unique id, length 8 characters
export function makeId(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 8; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Format bytes
// Source: https://stackoverflow.com/a/18650828/3143704
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function lookup(obj, path) {
  const parts = path.split(".");
  const base = obj[parts[0]];
  if (!base) return;
  if (parts.length === 1) {
    return base;
  }
  const next = parts.slice(1).join(".");
  if (Array.isArray(base)) {
    return base.map((el) => {
      return lookup(el, next);
    });
  } else {
    return lookup(base, next);
  }
}

export function filterEmails(emails: Mail[], query): Mail[] {
  return emails.filter((email) => {
    const hits: boolean[] = [];
    for (const key in query) {
      if (Object.hasOwnProperty.call(query, key)) {
        const element = query[key];
        const value = lookup(email, key);
        if (Array.isArray(value)) {
          hits.push(value.includes(element));
        } else {
          hits.push(value === element);
        }
      }
    }
    return !hits.includes(false);
  });
}

export function delay(ms): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
