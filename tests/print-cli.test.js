"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { Readable } = require("node:stream");
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

function fakeStdin(chunks, { isTTY = false } = {}) {
  const stream = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  stream.isTTY = isTTY;
  return stream;
}

test("resolveMarkdownInput throws when no markdown input provided and stdin is a TTY", async () => {
  await assert.rejects(
    () => resolveMarkdownInput({ argv: [], stdin: { isTTY: true } }),
    /Missing markdown input/
  );
});

test("resolveMarkdownInput reads stdin for --markdown-file=-", async () => {
  const input = await resolveMarkdownInput({
    argv: ["--markdown-file=-"],
    stdin: fakeStdin(["# Hi\n", "\n- Tea"], { isTTY: true })
  });
  assert.deepEqual(input, { source: "stdin", markdown: "# Hi\n\n- Tea", markdownFile: null });
});

test("resolveMarkdownInput reads stdin for space-separated --markdown-file -", async () => {
  const input = await resolveMarkdownInput({
    argv: ["--markdown-file", "-", "--dry-run"],
    stdin: fakeStdin(["hello"])
  });
  assert.equal(input.source, "stdin");
  assert.equal(input.markdown, "hello");
});

test("resolveMarkdownInput reads implicit piped stdin when no input flag given", async () => {
  const input = await resolveMarkdownInput({ argv: ["--dry-run"], stdin: fakeStdin(["# Piped"]) });
  assert.equal(input.source, "stdin");
  assert.equal(input.markdown, "# Piped");
});

test("resolveMarkdownInput decodes UTF-8 split across chunks and strips a leading BOM", async () => {
  const bytes = Buffer.from("\uFEFF# Caf\u00e9 \u20ac", "utf8");
  const input = await resolveMarkdownInput({
    argv: [],
    stdin: fakeStdin([bytes.subarray(0, 8), bytes.subarray(8)])
  });
  assert.equal(input.markdown, "# Caf\u00e9 \u20ac");
});

test("resolveMarkdownInput rejects empty stdin", async () => {
  await assert.rejects(() => resolveMarkdownInput({ argv: [], stdin: fakeStdin([]) }), /Empty markdown input on stdin/);
  await assert.rejects(
    () => resolveMarkdownInput({ argv: ["--markdown-file=-"], stdin: fakeStdin(["\uFEFF \n\t"]) }),
    /Empty markdown input on stdin/
  );
});

test("resolveMarkdownInput flags take precedence over piped stdin", async () => {
  const fixturePath = path.resolve(__dirname, "fixtures", "fixture-markdown-basic.md");
  const untouched = fakeStdin(["from stdin"]);
  const fileInput = await resolveMarkdownInput({ argv: [`--markdown-file=${fixturePath}`], stdin: untouched });
  assert.equal(fileInput.source, "file");

  const inlineInput = await resolveMarkdownInput({ argv: ["--markdown=inline"], stdin: fakeStdin(["from stdin"]) });
  assert.equal(inlineInput.source, "inline");
  assert.equal(inlineInput.markdown, "inline");
});

test("main dry-run converts markdown from injected stdin", async () => {
  let converted = null;
  const result = await main(["--dry-run"], {
    stdin: fakeStdin(["# Hi\n\n- Tea"]),
    markdownToEscposDetailed: (markdown) => {
      converted = markdown;
      return { bytes: [1, 2, 3], replacements: [] };
    }
  });
  assert.equal(converted, "# Hi\n\n- Tea");
  assert.equal(result.dryRun, true);
  assert.equal(result.payloadLength, 3);
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
  assert.equal(text.includes("stdin"), true);
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
    /Invalid --printer-uri value\. Use ipp:\/\/host:port\/printers\/queue or tcp:\/\/host\[:port\]\./
  );
});

test("validatePrinterUri rejects unsupported schemes", () => {
  assert.throws(
    () => validatePrinterUri("ftp://taiga.local/printers/TM-T88V"),
    /Unsupported --printer-uri scheme\. Use ipp:\/\/, ipps:\/\/, or tcp:\/\//
  );
});

test("validatePrinterUri normalizes tcp URIs and remaps malformed ones to CLI message", () => {
  const warnings = [];
  assert.equal(validatePrinterUri("tcp://printer.local", { warn: (m) => warnings.push(m) }), "tcp://printer.local:9100");
  assert.deepEqual(warnings, []);

  for (const uri of ["tcp://printer.local:99999", "tcp://printer.local:0", "tcp://printer.local:9100/printers/queue"]) {
    assert.throws(() => validatePrinterUri(uri), /Invalid --printer-uri value\. .*tcp:\/\/host\[:port\]/, uri);
  }
});

test("main prints via tcp printer-uri and skips listPrinters", async () => {
  let uriCall = null;

  const result = await main(["--markdown=# hi", "--printer-uri=tcp://192.168.1.50"], {
    platform: () => "linux",
    listPrinters: async () => {
      throw new Error("should not list printers when --printer-uri is set");
    },
    printRawToPrinterUri: async (uri, data) => {
      uriCall = { uri, bytes: data.length };
    }
  });

  assert.equal(result.printerUri, "tcp://192.168.1.50:9100");
  assert.equal(uriCall.uri, "tcp://192.168.1.50:9100");
  assert.equal(uriCall.bytes, result.payloadLength);
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

const STATUS_OK = { printerUri: "tcp://10.0.0.5:9100", ok: true, online: true, coverOpen: false, paperEnd: false, paperNearEnd: false, errors: [], raw: [0x12, 0x12, 0x12, 0x12] };
const STATUS_COVER_OPEN = { ...STATUS_OK, ok: false, online: false, coverOpen: true, raw: [0x1a, 0x16, 0x12, 0x12] };

// Spawns the CLI with stdin left open, so a stray stdin read hangs until the 5s kill and fails the test.
function runCli(args) {
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [path.resolve(__dirname, "..", "src", "print-cli.js"), ...args], { timeout: 5000 });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  return new Promise((resolve) => child.on("close", (code) => resolve({ code, stdout, stderr })));
}

test("main --status reports status and exit code without markdown input", async () => {
  const lines = [];
  const deps = { log: (line) => lines.push(line), getPrinterStatus: async () => ({ ...STATUS_OK, paperNearEnd: true }) };

  const ok = await main(["--status", "--printer-uri=tcp://10.0.0.5"], deps);
  assert.equal(ok.exitCode, 0);
  assert.equal(lines.join("\n"), "Status: OK (tcp://10.0.0.5:9100)\nWarning: paper near end\nRaw DLE EOT 1-4: 0x12 0x12 0x12 0x12");

  deps.getPrinterStatus = async () => ({ ...STATUS_COVER_OPEN, paperEnd: true, errors: ["autocutter error"] });
  const bad = await main(["--status", "--printer-uri=tcp://10.0.0.5"], deps);
  assert.equal(bad.exitCode, 2);
  assert.match(lines.at(-1), /^Status: PROBLEM — cover open, paper end, autocutter error \(tcp:\/\/10\.0\.0\.5:9100\)/m);
});

test("main --status and --check-status reject non-tcp targets", async () => {
  const deps = {
    getPrinterStatus: async () => assert.fail("must not query"),
    printRaw: async () => assert.fail("must not print"),
    printRawToPrinterUri: async () => assert.fail("must not print")
  };

  for (const argv of [
    ["--status"],
    ["--status", "--printer-uri=ipp://taiga.local:631/printers/TM-T88V"],
    ["--markdown=# hi", "--check-status", "--printer=EPSON"],
    ["--markdown=# hi", "--check-status", "--printer-uri=ipp://taiga.local:631/printers/TM-T88V"]
  ]) {
    await assert.rejects(() => main(argv, deps), /status is only supported for tcp:\/\/ printer URIs/, argv.join(" "));
  }
});

test("posprint --status exits 0 when OK, 2 on problem, 1 on error, without reading stdin", async () => {
  const net = require("node:net");
  const startPrinter = async (bytes) => {
    const server = net.createServer((socket) => socket.once("data", () => socket.write(Buffer.from(bytes))));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
  };
  const okPrinter = await startPrinter(STATUS_OK.raw);
  const badPrinter = await startPrinter(STATUS_COVER_OPEN.raw);

  try {
    const ok = await runCli(["--status", `--printer-uri=tcp://127.0.0.1:${okPrinter.address().port}`]);
    assert.equal(ok.code, 0, ok.stderr);
    assert.match(ok.stdout, /Status: OK/);

    const bad = await runCli(["--status", `--printer-uri=tcp://127.0.0.1:${badPrinter.address().port}`]);
    assert.equal(bad.code, 2, bad.stderr);
    assert.match(bad.stdout, /Status: PROBLEM — cover open/);

    const error = await runCli(["--status", "--printer-uri=tcp://127.0.0.1:1"]);
    assert.equal(error.code, 1);
    assert.match(error.stderr, /TCP connection failed for 127\.0\.0\.1:1/);
  } finally {
    okPrinter.close();
    badPrinter.close();
  }
});

test("main --check-status queries status before printing and aborts on problems", async () => {
  const calls = [];
  const warnings = [];
  const deps = {
    platform: () => "linux",
    warn: (message) => warnings.push(message),
    getPrinterStatus: async (uri) => {
      calls.push(`status ${uri}`);
      return STATUS_COVER_OPEN;
    },
    printRawToPrinterUri: async (uri) => calls.push(`print ${uri}`)
  };
  const argv = ["--markdown=# hi", "--printer-uri=tcp://10.0.0.5", "--check-status"];

  await assert.rejects(() => main(argv, deps), /Printer status check failed for tcp:\/\/10\.0\.0\.5:9100: cover open\. Print aborted/);
  assert.deepEqual(calls, ["status tcp://10.0.0.5:9100"]);

  deps.getPrinterStatus = async (uri) => {
    calls.push(`status ${uri}`);
    return { ...STATUS_OK, paperNearEnd: true };
  };
  calls.length = 0;
  await main(argv, deps);
  assert.deepEqual(calls, ["status tcp://10.0.0.5:9100", "print tcp://10.0.0.5:9100"]);
  assert.match(warnings.join("\n"), /paper near end/);
});

test("main --check-status is skipped in dry-run", async () => {
  const result = await main(["--markdown=# hi", "--check-status", "--dry-run"], { getPrinterStatus: async () => assert.fail("must not query") });
  assert.equal(result.dryRun, true);
});
