"use strict";

const { readFile } = require("fs/promises");
const { getArgValue, hasFlag, selectPrinterName } = require("./cli-common");
const { markdownToEscpos } = require("./markdown-to-escpos");
const { listPrinters, printRawToWindowsPrinter } = require("./windows-raw-printer");

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

  throw new Error("Provide --markdown-file or --markdown");
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = hasFlag(argv, "--dry-run");
  const strictMarkdown = hasFlag(argv, "--strict-markdown");
  const charsPerLine = Number.parseInt(getArgValue(argv, "--chars-per-line") || "42", 10);

  const { markdown } = await resolveMarkdownInput({ argv });
  const payload = Buffer.from(markdownToEscpos(markdown, { charsPerLine, strictMarkdown }));

  const printers = await listPrinters();
  if (!printers.length) {
    throw new Error("No Windows printers found");
  }

  const printerName = selectPrinterName({
    requested: getArgValue(argv, "--printer"),
    envPrinter: process.env.ESC_POS_PRINTER,
    printers
  });

  console.log(`Available printers (${printers.length}):`);
  for (const printer of printers) {
    console.log(`- ${printer}`);
  }
  console.log(`Selected printer: ${printerName}`);

  if (dryRun) {
    console.log("Dry run enabled. Not sending to printer.");
    return { printerName, payloadLength: payload.length, dryRun: true };
  }

  await printRawToWindowsPrinter(printerName, payload);
  return { printerName, payloadLength: payload.length, dryRun: false };
}

module.exports = { main, resolveMarkdownInput };

if (require.main === module) {
  main().then(
    (result) => {
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
