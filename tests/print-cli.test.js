"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { getArgValue, hasFlag, selectPrinterName } = require("../src/cli-common");
const { resolveMarkdownInput, main, formatHelp, validatePlatform, validatePrinterUri } = require("../src/print-cli");

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
  const fixturePath = path.resolve(__dirname, "fixtures", "fixture-markdown-basic.md");
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
  assert.equal(text.includes("--font"), true);
  assert.equal(text.includes("--character-spacing-mm"), true);
  assert.equal(text.includes("--line-spacing-mm"), true);
  assert.equal(text.includes("--left-margin-mm"), true);
  assert.equal(text.includes("--print-area-width-mm"), true);
  assert.equal(text.includes("--code-page"), true);
  assert.equal(text.includes("--list-code-pages"), true);
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
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));

  try {
    const result = await main(["--help"]);
    assert.equal(result.mode, "help");
    assert.equal(lines.some((line) => line.includes("Usage: posprint [options]")), true);
  } finally {
    console.log = originalLog;
  }
});

test("main returns version mode when --version flag is present", async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));

  try {
    const result = await main(["--version"]);
    assert.equal(result.mode, "version");
    assert.equal(lines.some((line) => /^\d+\.\d+\.\d+/.test(line)), true);
  } finally {
    console.log = originalLog;
  }
});

test("main returns list-code-pages mode and prints ids plus canonical names", async () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (value) => lines.push(String(value));

  try {
    const result = await main(["--list-code-pages"]);
    assert.equal(result.mode, "list-code-pages");

    const output = lines.join("\n");
    assert.match(output, /cp437\s+0/i);
    assert.match(output, /cp850\s+2/i);
    assert.match(output, /cp858\s+19/i);
    assert.match(output, /cp1252\s+16/i);
    assert.match(output, /canonical names/i);
  } finally {
    console.log = originalLog;
  }
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

test("main forwards layout and code-page options to markdownToEscposDetailed", async () => {
  const calls = [];

  const result = await main(
    [
      "--dry-run",
      "--markdown=# hi",
      "--font=b",
      "--character-spacing-mm=1",
      "--line-spacing-mm=3",
      "--left-margin-mm=2",
      "--print-area-width-mm=42",
      "--code-page=cp858"
    ],
    {
      markdownToEscposDetailed: (_markdown, options) => {
        calls.push(options);
        return {
          bytes: Uint8Array.from([0x1b, 0x40]),
          replacements: []
        };
      }
    }
  );

  assert.equal(result.dryRun, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].font, "B");
  assert.equal(calls[0].characterSpacingMm, 1);
  assert.equal(calls[0].lineSpacingMm, 3);
  assert.equal(calls[0].leftMarginMm, 2);
  assert.equal(calls[0].printAreaWidthMm, 42);
  assert.equal(calls[0].codePage, "cp858");
});

test("main warns in dry-run when detailed conversion reports fallback replacements", async () => {
  const warnings = [];

  const result = await main(
    ["--dry-run", "--markdown=Euro: EUR | snowman: ?", "--code-page=cp437"],
    {
      markdownToEscposDetailed: (_markdown, options) => {
        assert.equal(options.codePage, "cp437");

        return {
          bytes: Uint8Array.from([0x1b, 0x40]),
          replacements: [
            { input: "€", output: "?", kind: "fallback" },
            { input: "☃", output: "?", kind: "fallback" }
          ]
        };
      },
      warn: (message) => warnings.push(message)
    }
  );

  assert.equal(result.dryRun, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cp437/);
  assert.match(warnings[0], /€/);
  assert.match(warnings[0], /☃/);
  assert.match(warnings[0], /with '\?'/i);
});

test("main does not warn when detailed conversion reports only approved normalizations", async () => {
  const warnings = [];

  const result = await main(
    ["--dry-run", "--markdown=Smart quotes", "--code-page=cp437"],
    {
      markdownToEscposDetailed: () => ({
        bytes: Uint8Array.from([0x1b, 0x40]),
        replacements: [
          { input: "’", output: "'", kind: "normalization" },
          { input: "“", output: '"', kind: "normalization" }
        ]
      }),
      warn: (message) => warnings.push(message)
    }
  );

  assert.equal(result.dryRun, true);
  assert.deepEqual(warnings, []);
});

test("main does not warn when detailed conversion has no fallback replacements", async () => {
  const warnings = [];

  const result = await main(
    ["--dry-run", "--markdown=Plain text", "--code-page=cp858"],
    {
      markdownToEscposDetailed: () => ({
        bytes: Uint8Array.from([0x1b, 0x40]),
        replacements: [
          { input: "-", output: "-", kind: "identity" },
          { input: "…", output: "...", kind: "normalization" },
          { input: "x", output: "!", kind: "manual" }
        ]
      }),
      warn: (message) => warnings.push(message)
    }
  );

  assert.equal(result.dryRun, true);
  assert.deepEqual(warnings, []);
});

test("main warns for fallback replacements even if metadata output is not question mark", async () => {
  const warnings = [];

  const result = await main(
    ["--dry-run", "--markdown=Unsupported", "--code-page=cp437"],
    {
      markdownToEscposDetailed: () => ({
        bytes: Uint8Array.from([0x1b, 0x40]),
        replacements: [
          { input: "λ", output: "[?]", kind: "fallback" }
        ]
      }),
      warn: (message) => warnings.push(message)
    }
  );

  assert.equal(result.dryRun, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /cp437/);
  assert.match(warnings[0], /λ/);
  assert.match(warnings[0], /with '\?'/i);
});

test("main rejects unsupported --code-page", async () => {
  await assert.rejects(
    () => main(["--dry-run", "--markdown=hello", "--code-page=cp9999"]),
    /Unsupported code page/i
  );
});

test("main rejects invalid layout flag values", async () => {
  await assert.rejects(() => main(["--markdown=hello", "--font=Z"]), /Invalid --font value/);
  await assert.rejects(() => main(["--markdown=hello", "--character-spacing-mm=abc"]), /Invalid --character-spacing-mm value/);
  await assert.rejects(() => main(["--markdown=hello", "--character-spacing-mm=-1"]), /Invalid --character-spacing-mm value/);
  await assert.rejects(() => main(["--markdown=hello", "--line-spacing-mm=0"]), /Invalid --line-spacing-mm value/);
  await assert.rejects(() => main(["--markdown=hello", "--left-margin-mm=-1"]), /Invalid --left-margin-mm value/);
  await assert.rejects(() => main(["--markdown=hello", "--print-area-width-mm=0"]), /Invalid --print-area-width-mm value/);
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

test("validatePrinterUri upgrades http and warns using CLI warning format", () => {
  const warnings = [];

  const normalized = validatePrinterUri("http://taiga.local:631/printers/TM-T88V", {
    warn: (message) => warnings.push(message)
  });

  assert.equal(normalized, "ipp://taiga.local:631/printers/TM-T88V");
  assert.deepEqual(
    warnings,
    ["--printer-uri auto-converted from http:// to ipp:// for IPP printing."]
  );
});

test("validatePrinterUri upgrades https and warns using CLI warning format", () => {
  const warnings = [];

  const normalized = validatePrinterUri("https://taiga.local/printers/TM-T88V", {
    warn: (message) => warnings.push(message)
  });

  assert.equal(normalized, "ipps://taiga.local/printers/TM-T88V");
  assert.deepEqual(
    warnings,
    ["--printer-uri auto-converted from https:// to ipps:// for IPP printing."]
  );
});

test("validatePrinterUri remaps invalid URI to CLI message", () => {
  assert.throws(
    () => validatePrinterUri("not a uri"),
    /Invalid --printer-uri value\. Use ipp:\/\/host:port\/printers\/queue\./
  );
});

test("validatePrinterUri rejects unsupported schemes", () => {
  assert.throws(
    () => validatePrinterUri("ftp://taiga.local/printers/TM-T88V"),
    /Unsupported --printer-uri scheme\. Use ipp:\/\/ or ipps:\/\//
  );
});

test("main prints via printer-uri on win32 and skips listPrinters", async () => {
  let uriCall = null;

  const result = await main(
    ["--markdown=# hi", "--printer-uri=ipp://taiga.local:631/printers/TM-T88V"],
    {
      platform: () => "win32",
      listPrinters: async () => {
        throw new Error("should not list printers when --printer-uri is set");
      },
      printRawToPrinterUri: async (uri, data) => {
        uriCall = { uri, bytes: data.length };
      }
    }
  );

  assert.equal(result.printerUri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(uriCall.uri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(typeof uriCall.bytes, "number");
});
