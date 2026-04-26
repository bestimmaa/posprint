"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { existsSync, readFileSync } = require("fs");
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

test("package scripts route print:test through print-cli markdown fixture", () => {
  assert.equal(
    pkg.scripts["print:test"],
    "node src/print-cli.js --markdown-file=tests/fixtures/markdown-showcase.md"
  );
  assert.equal(
    pkg.scripts["print:test:dry"],
    "node src/print-cli.js --markdown-file=tests/fixtures/markdown-showcase.md --dry-run"
  );
  assert.equal(Object.hasOwn(pkg.scripts, "print:test:save"), false);
});

test("readme does not document removed print:test:save command", () => {
  assert.equal(readme.includes("print:test:save"), false);
});

test("markdown showcase fixture exists in tests fixtures", () => {
  const fixturePath = path.resolve(
    __dirname,
    "fixtures",
    "markdown-showcase.md"
  );
  assert.doesNotThrow(() => readFileSync(fixturePath, "utf8"));
});

test("package main points to module entrypoint", () => {
  assert.equal(pkg.main, "src/index.js");
});

test("readme documents CommonJS and ESM module usage", () => {
  assert.equal(readme.includes("const { markdownToEscpos"), true);
  assert.equal(readme.includes("import posprint from \"posprint\""), true);
});

test("bitbucket pipeline config exists and defines required build keys", () => {
  const pipelinePath = path.resolve(__dirname, "..", "bitbucket-pipelines.yml");

  assert.equal(existsSync(pipelinePath), true);

  const pipeline = readFileSync(pipelinePath, "utf8");
  assert.equal(pipeline.includes("image: node:20"), true);
  assert.equal(pipeline.includes("pipelines:"), true);
  assert.equal(pipeline.includes("default:"), true);
  assert.equal(pipeline.includes("name: Test"), true);
  assert.equal(pipeline.includes("name: Pack"), true);
  assert.equal(pipeline.includes("npm test"), true);
  assert.equal(pipeline.includes("npm pack"), true);
  assert.equal(pipeline.includes("artifacts:"), true);
  assert.equal(pipeline.includes("*.tgz"), true);
});

test("readme documents bitbucket pipeline and build artifacts", () => {
  assert.equal(readme.includes("## Bitbucket Pipeline Artifact Build"), true);
  assert.equal(readme.includes("all branch pushes"), true);
  assert.equal(readme.includes("`npm test`"), true);
  assert.equal(readme.includes("`npm pack`"), true);
  assert.equal(
    readme.includes("<packageName>-<version>-<sanitizedBranch>-<shortSha>.tgz"),
    true
  );
});
