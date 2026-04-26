"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const pkg = require("../package.json");

test("package is publishable scoped npm cli", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.name.startsWith("@"), true);
  assert.equal(typeof pkg.bin, "object");
  assert.equal(typeof pkg.bin["tm88v-print"], "string");
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes("src"), true);
});
