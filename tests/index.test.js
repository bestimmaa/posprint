"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../src/index");

test("index exports printRawToPrinterUri", () => {
  assert.equal(typeof api.printRawToPrinterUri, "function");
});
