"use strict";

import type { EmailAddress } from "../type";

/**
 * Filter out addresses from recipients, the remaining are the bcc.
 */
export function calculateBcc(
  recipients: EmailAddress[],
  to: EmailAddress[],
  cc: EmailAddress[],
): EmailAddress[] {
  const bcc = [...recipients];
  to.concat(cc).forEach((ea) => {
    const index = bcc.findIndex((e) => ea.address === e.address);
    if (index > -1) {
      bcc.splice(index, 1);
    }
  });

  return bcc;
}
