"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("fs");
const pkg = require("../package.json");
const readme = readFileSync("README.md", "utf8");

test("package is publishable scoped npm cli", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.name.startsWith("@"), true);
  assert.equal(typeof pkg.bin, "object");
  assert.equal(typeof pkg.bin["tm88v-print"], "string");
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes("src"), true);
});

test("readme documents global install and tm88v-print usage", () => {
  assert.equal(readme.includes("npm i -g @chris/tm88v-print-cli"), true);
  assert.equal(readme.includes("tm88v-print --dry-run"), true);
});
