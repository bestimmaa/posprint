#!/usr/bin/env node
"use strict";

const os = require("os");
const { readFile } = require("fs/promises");
const { getArgValue, hasFlag } = require("./cli-common");
const { markdownToEscpos, listPrinters, printRaw, printRawToPrinterUri, selectPrinterName } = require("./index");
const pkg = require("../package.json");

function formatHelp() {
  return [
    "Usage: posprint [options]",
    "",
    "Options:",
    "  --markdown-file=<path>   Read markdown from file",
    "  --markdown=<text>        Read markdown inline",
    "  --printer=<name>         Select printer",
    "  --printer-uri=<uri>      Print directly to CUPS URI (ipp://...)",
    "  --chars-per-line=<n>     Wrap width (default: 42)",
    "  --font=A|B|C             Select ESC/POS font",
    "  --character-spacing-mm=<n>  Character spacing in mm (>= 0)",
    "  --line-spacing-mm=<n>    Line spacing in mm (> 0)",
    "  --left-margin-mm=<n>     Left margin in mm (>= 0)",
    "  --print-area-width-mm=<n>  Print area width in mm (> 0)",
    "  --strict-markdown        Reject unsupported constructs",
    "  --dry-run                Build payload without printing",
    "  --help                   Show help",
    "  --version                Show version"
  ].join("\n");
}

function validatePlatform(platform = os.platform()) {
  if (platform !== "win32" && platform !== "linux" && platform !== "darwin") {
    throw new Error(`Unsupported platform: ${platform}. Supported platforms are win32, linux, and darwin.`);
  }
}

function validatePrinterUri(printerUri, { warn = (message) => console.warn(message) } = {}) {
  if (!printerUri) {
    return printerUri;
  }

  let parsed;

  try {
    parsed = new URL(printerUri);
  } catch {
    throw new Error("Invalid --printer-uri value. Use ipp://host:port/printers/queue.");
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    const convertedProtocol = parsed.protocol === "http:" ? "ipp:" : "ipps:";
    const convertedUri = `${convertedProtocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
    warn(`--printer-uri auto-converted from ${parsed.protocol}// to ${convertedProtocol}// for CUPS printing.`);
    parsed = new URL(convertedUri);
  }

  if (parsed.protocol !== "ipp:" && parsed.protocol !== "ipps:") {
    throw new Error("Unsupported --printer-uri scheme. Use ipp:// or ipps://.");
  }

  return parsed.toString();
}

function parseOptionalMmArg(argv, flag, { min, exclusiveMin = false }) {
  const raw = getArgValue(argv, flag);

  if (raw == null) {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${flag} value. Provide a numeric millimeter value.`);
  }

  if (exclusiveMin ? value <= min : value < min) {
    if (exclusiveMin) {
      throw new Error(`Invalid ${flag} value. Provide a number greater than ${min}.`);
    }

    throw new Error(`Invalid ${flag} value. Provide a number greater than or equal to ${min}.`);
  }

  return value;
}

function parseLayoutOptions(argv) {
  const layoutOptions = {};
  const fontRaw = getArgValue(argv, "--font");

  if (fontRaw != null) {
    const normalized = String(fontRaw).trim().toUpperCase();
    if (!["A", "B", "C"].includes(normalized)) {
      throw new Error("Invalid --font value. Use A, B, or C.");
    }
    layoutOptions.font = normalized;
  }

  const characterSpacingMm = parseOptionalMmArg(argv, "--character-spacing-mm", { min: 0 });
  if (characterSpacingMm != null) {
    layoutOptions.characterSpacingMm = characterSpacingMm;
  }

  const lineSpacingMm = parseOptionalMmArg(argv, "--line-spacing-mm", { min: 0, exclusiveMin: true });
  if (lineSpacingMm != null) {
    layoutOptions.lineSpacingMm = lineSpacingMm;
  }

  const leftMarginMm = parseOptionalMmArg(argv, "--left-margin-mm", { min: 0 });
  if (leftMarginMm != null) {
    layoutOptions.leftMarginMm = leftMarginMm;
  }

  const printAreaWidthMm = parseOptionalMmArg(argv, "--print-area-width-mm", { min: 0, exclusiveMin: true });
  if (printAreaWidthMm != null) {
    layoutOptions.printAreaWidthMm = printAreaWidthMm;
  }

  return layoutOptions;
}

async function resolveMarkdownInput({ argv }) {
  const markdownFile = getArgValue(argv, "--markdown-file");
  const markdownInline = getArgValue(argv, "--markdown");

  if (markdownFile) {
    const content = await readFile(markdownFile, "utf8");
    return { source: "file", markdown: content, markdownFile };
  }

  if (markdownInline) {
    return { source: "inline", markdown: markdownInline, markdownFile: null };
  }

  throw new Error("Missing markdown input. Provide --markdown-file or --markdown.");
}

async function main(argv = process.argv.slice(2), deps = {}) {
  if (hasFlag(argv, "--help")) {
    console.log(formatHelp());
    return { mode: "help" };
  }

  if (hasFlag(argv, "--version")) {
    console.log(pkg.version);
    return { mode: "version", version: pkg.version };
  }

  const dryRun = hasFlag(argv, "--dry-run");
  const strictMarkdown = hasFlag(argv, "--strict-markdown");
  const charsPerLineRaw = getArgValue(argv, "--chars-per-line") || "42";

  if (!/^\d+$/.test(charsPerLineRaw)) {
    throw new Error("Invalid --chars-per-line value. Provide a positive integer.");
  }

  const charsPerLine = Number(charsPerLineRaw);

  if (!Number.isInteger(charsPerLine) || charsPerLine <= 0) {
    throw new Error("Invalid --chars-per-line value. Provide a positive integer.");
  }

  const platform = deps.platform || os.platform;
  const listPrintersFn = deps.listPrinters || listPrinters;
  const printRawFn = deps.printRaw || printRaw;
  const printRawToPrinterUriFn = deps.printRawToPrinterUri || printRawToPrinterUri;
  const markdownToEscposFn = deps.markdownToEscpos || markdownToEscpos;
  const printerUriRaw = getArgValue(argv, "--printer-uri");
  const warn = deps.warn || ((message) => console.warn(message));
  const printerUri = validatePrinterUri(printerUriRaw, { warn });
  const layoutOptions = parseLayoutOptions(argv);

  const { markdown } = await resolveMarkdownInput({ argv });
  const payload = Buffer.from(markdownToEscposFn(markdown, {
    charsPerLine,
    strictMarkdown,
    ...layoutOptions
  }));

  if (dryRun) {
    return { printerName: null, payloadLength: payload.length, dryRun: true };
  }

  validatePlatform(platform());

  if (printerUri) {
    await printRawToPrinterUriFn(printerUri, payload);
    return { printerName: null, printerUri, payloadLength: payload.length, dryRun: false };
  }

  const printers = await listPrintersFn();

  if (!printers.length) {
    throw new Error("No printers found.");
  }

  const printerName = selectPrinterName({
    requested: getArgValue(argv, "--printer"),
    envPrinter: process.env.ESC_POS_PRINTER,
    printers
  });

  await printRawFn(printerName, payload);
  return { printerName, payloadLength: payload.length, dryRun: false };
}

module.exports = { main, resolveMarkdownInput, formatHelp, validatePlatform, validatePrinterUri };

if (require.main === module) {
  main().then(
    (result) => {
      if (result.mode === "help" || result.mode === "version") {
        return;
      }

      if (result.dryRun) {
        console.log(`Dry run complete. Payload bytes: ${result.payloadLength}`);
        return;
      }

      if (!result.dryRun) {
        console.log("Print job submitted as RAW ESC/POS.");
      }
    },
    (err) => {
      console.error(err.message || err);
      process.exitCode = 1;
    }
  );
}
