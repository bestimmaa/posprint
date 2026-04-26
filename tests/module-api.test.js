"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

test("module api exports expected public functions", () => {
  const api = require("../src/index");

  assert.equal(typeof api.markdownToEscpos, "function");
  assert.equal(typeof api.listPrinters, "function");
  assert.equal(typeof api.printRawToWindowsPrinter, "function");
  assert.equal(typeof api.selectPrinterName, "function");
});
