"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getArgValue, hasFlag, selectPrinterName } = require("../src/cli-common");
const { resolveMarkdownInput } = require("../src/print-cli");
const { formatHelp, validatePlatform } = require("../src/print-cli");

test("getArgValue reads --flag=value", () => {
  assert.equal(getArgValue(["--markdown=hi"], "--markdown"), "hi");
});

test("getArgValue reads --flag value", () => {
  assert.equal(getArgValue(["--markdown", "hi"], "--markdown"), "hi");
});

test("hasFlag detects boolean flag", () => {
  assert.equal(hasFlag(["--strict-markdown"], "--strict-markdown"), true);
});

test("selectPrinterName prioritizes explicit flag", () => {
  const printers = ["Printer A", "EPSON TM-T88V Receipt"];
  const selected = selectPrinterName({
    requested: "Printer A",
    envPrinter: "EPSON TM-T88V Receipt",
    printers
  });
  assert.equal(selected, "Printer A");
});

test("resolveMarkdownInput prefers markdown-file over markdown string", async () => {
  const input = await resolveMarkdownInput({
    argv: ["--markdown-file=tests/fixtures/markdown-basic.md", "--markdown=ignored"]
  });
  assert.equal(input.source, "file");
});

test("resolveMarkdownInput throws when no markdown input provided", async () => {
  await assert.rejects(
    () => resolveMarkdownInput({ argv: [] }),
    /Provide --markdown-file or --markdown/
  );
});

test("formatHelp includes core options", () => {
  const text = formatHelp();
  assert.equal(text.includes("--markdown-file"), true);
  assert.equal(text.includes("--dry-run"), true);
  assert.equal(text.includes("--strict-markdown"), true);
});

test("validatePlatform throws for non-windows", () => {
  assert.throws(() => validatePlatform("linux"), /Windows-only runtime/);
});

test("validatePlatform passes on win32", () => {
  assert.doesNotThrow(() => validatePlatform("win32"));
});
