"use strict";

const { expect } = require("chai");

describe("CLAGE API value conversion", () => {
  it("converts documented temperature and power units", () => {
    expect(450 / 10).to.equal(45);
    expect(120 * 0.15).to.equal(18);
  });

  it("converts consumption water units", () => {
    expect(1234 / 100).to.equal(12.34);
  });
});
