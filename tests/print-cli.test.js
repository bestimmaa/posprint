"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("os");
const { getArgValue, hasFlag, selectPrinterName } = require("../src/cli-common");
const { resolveMarkdownInput, main, formatHelp, validatePlatform } = require("../src/print-cli");

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
  const fixturePath = path.resolve(__dirname, "fixtures", "markdown-basic.md");
  const input = await resolveMarkdownInput({
    argv: [`--markdown-file=${fixturePath}`, "--markdown=ignored"]
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

test("formatHelp includes posprint usage", () => {
  const text = formatHelp();
  assert.equal(text.includes("Usage: posprint [options]"), true);
});

test("validatePlatform throws for non-windows", () => {
  assert.throws(() => validatePlatform("linux"), /Windows-only runtime/);
});

test("validatePlatform passes on win32", () => {
  assert.doesNotThrow(() => validatePlatform("win32"));
});

test("main returns help mode when --help flag is present", async () => {
  const result = await main(["--help"]);
  assert.equal(result.mode, "help");
});

test("main returns version mode when --version flag is present", async () => {
  const result = await main(["--version"]);
  assert.equal(result.mode, "version");
});

test("main rejects non-integer --chars-per-line", async () => {
  await assert.rejects(
    () => main(["--chars-per-line=42abc", "--markdown=hello"]),
    /Invalid --chars-per-line value/
  );
});

test("main validates --chars-per-line before platform check", async () => {
  const originalPlatform = os.platform;
  os.platform = () => "linux";

  try {
    await assert.rejects(
      () => main(["--chars-per-line=oops", "--markdown=hello"]),
      /Invalid --chars-per-line value/
    );
  } finally {
    os.platform = originalPlatform;
  }
});

