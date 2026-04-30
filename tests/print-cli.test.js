"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
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
  assert.equal(text.includes("--printer-uri"), true);
});

test("formatHelp includes posprint usage", () => {
  const text = formatHelp();
  assert.equal(text.includes("Usage: posprint [options]"), true);
});

test("validatePlatform passes on win32", () => {
  assert.doesNotThrow(() => validatePlatform("win32"));
});

test("validatePlatform passes on linux", () => {
  assert.doesNotThrow(() => validatePlatform("linux"));
});

test("validatePlatform passes on darwin", () => {
  assert.doesNotThrow(() => validatePlatform("darwin"));
});

test("validatePlatform throws on unsupported platform", () => {
  assert.throws(() => validatePlatform("freebsd"), /Unsupported platform/);
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
  await assert.rejects(
    () => main(["--chars-per-line=oops", "--markdown=hello"], { platform: () => "darwin" }),
    /Invalid --chars-per-line value/
  );
});

test("main prints on linux using injected printRaw", async () => {
  const result = await main(
    ["--markdown=# hi", "--printer=Printer A"],
    {
      platform: () => "linux",
      listPrinters: async () => ["Printer A"],
      printRaw: async () => ({ backend: "linux" })
    }
  );

  assert.equal(result.printerName, "Printer A");
  assert.equal(result.dryRun, false);
});

test("main dry-run works on unsupported platforms without printer discovery", async () => {
  const result = await main(
    ["--dry-run", "--markdown=# hi"],
    {
      platform: () => "freebsd",
      listPrinters: async () => {
        throw new Error("should not list printers in dry-run");
      }
    }
  );

  assert.equal(result.dryRun, true);
  assert.equal(typeof result.payloadLength, "number");
});

test("main prints via printer-uri path and skips listPrinters", async () => {
  let uriCall = null;

  const result = await main(
    ["--markdown=# hi", "--printer=ignored", "--printer-uri=ipp://taiga.local:631/printers/TM-T88V"],
    {
      platform: () => "darwin",
      listPrinters: async () => {
        throw new Error("should not list printers when --printer-uri is set");
      },
      printRawToPrinterUri: async (uri, data) => {
        uriCall = { uri, bytes: data.length };
      }
    }
  );

  assert.equal(result.printerName, null);
  assert.equal(result.printerUri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(uriCall.uri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(typeof uriCall.bytes, "number");
});

test("main auto-converts http printer-uri to ipp", async () => {
  let uriCall = null;
  const warnings = [];

  const result = await main(
    ["--markdown=# hi", "--printer-uri=http://taiga.local:631/printers/TM-T88V"],
    {
      platform: () => "darwin",
      warn: (message) => warnings.push(message),
      printRawToPrinterUri: async (uri, data) => {
        uriCall = { uri, bytes: data.length };
      }
    }
  );

  assert.equal(result.printerUri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(uriCall.uri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(typeof uriCall.bytes, "number");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /auto-converted/i);
});

