"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("fs");
const pkg = require("../package.json");
const readmePath = path.resolve(__dirname, "..", "README.md");
const readme = readFileSync(readmePath, "utf8");

test("package is publishable posprint cli", () => {
  assert.equal(pkg.private, false);
  assert.equal(pkg.name, "posprint");
  assert.equal(typeof pkg.bin, "object");
  assert.equal(typeof pkg.bin["posprint"], "string");
  assert.equal(Array.isArray(pkg.files), true);
  assert.equal(pkg.files.includes("src"), true);
});

test("readme documents global install and posprint usage", () => {
  assert.equal(readme.includes("npm i -g posprint"), true);
  assert.equal(readme.includes("posprint --dry-run"), true);
  assert.equal(readme.includes("tm88v-print"), false);
  assert.equal(readme.includes("@chris/tm88v-print-cli"), false);
});
