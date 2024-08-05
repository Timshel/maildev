"use strict";

/**
 * Authorize callback for smtp server
 */
export function createOnAuthCallback(username: string | undefined, password: string | undefined) {
  return function onAuth(auth, session, callback) {
    if (auth.username && auth.password) {
      if (auth.username !== username || auth.password !== password) {
        return callback(new Error("Invalid username or password"));
      }
    }
    callback(null, { user: username });
  };
}
