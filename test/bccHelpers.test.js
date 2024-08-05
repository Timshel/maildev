/* global describe, it */
"use strict";
const expect = require("expect").expect;
const { calculateBcc } = require("../dist/lib/helpers/bcc");

function wrap(address) {
  return { address, name: undefined };
}

describe("[bcc helpers]", () => {
  describe("calculateBcc", () => {
    it("works with empty addresses", () => {
      const actual = calculateBcc([], [], []);

      expect(actual).toEqual([]);
    });

    it("does not modify input arrays", () => {
      const recipients = ["x@y", "a@b"].map(wrap);
      const to = ["a@b"].map(wrap);
      const cc = ["x@y"].map(wrap);
      calculateBcc(recipients, to, cc);

      expect(recipients).toEqual(["x@y", "a@b"].map(wrap));
      expect(to).toEqual(["a@b"].map(wrap));
      expect(cc).toEqual(["x@y"].map(wrap));
    });

    describe("calculates bcc as the difference of (recipients - to - cc)", () => {
      it("empty when all recipients are consumed", () => {
        const actual = calculateBcc(["x@y", "a@b"].map(wrap), ["a@b"].map(wrap), ["x@y"].map(wrap));

        expect(actual).toEqual([]);
      });

      it("when same recipient is in TO, CC and BCC", () => {
        const actual = calculateBcc(
          ["a@b", "a@b", "a@b"].map(wrap),
          ["a@b"].map(wrap),
          ["a@b"].map(wrap),
        );

        expect(actual).toEqual([{ address: "a@b", name: undefined }]);
      });

      it("comparison of addresses is case insensitive", () => {
        const actual = calculateBcc(
          ["bodhi@gmail.com", "johnny.first@fbi.gov", "Johnny.first@fbi.gov"].map(wrap),
          ["Johnny.first@fbi.gov"].map(wrap),
          ["bodhi@gmail.com"].map(wrap),
        );

        expect(actual).toEqual([{ address: "johnny.first@fbi.gov", name: undefined }]);
      });
    });
  });
});
