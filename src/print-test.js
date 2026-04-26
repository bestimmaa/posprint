"use strict";

const { mkdir, writeFile } = require("fs/promises");
const path = require("path");
const { demoReceipt } = require("./escpos-builder");
const { getArgValue, hasFlag, selectPrinterName } = require("./cli-common");
const { listPrinters, printRawToWindowsPrinter } = require("./windows-raw-printer");

async function main() {
  const dryRun = hasFlag(process.argv, "--dry-run");
  const save = hasFlag(process.argv, "--save");

  const printers = await listPrinters();
  if (!printers.length) {
    throw new Error("No Windows printers found");
  }

  const requested = getArgValue(process.argv, "--printer");
  const printerName = selectPrinterName({
    requested,
    envPrinter: process.env.ESC_POS_PRINTER,
    printers
  });

  const payload = Buffer.from(demoReceipt());

  if (save) {
    const outDir = path.join(process.cwd(), "tmp");
    const outFile = path.join(outDir, "escpos-demo.bin");
    await mkdir(outDir, { recursive: true });
    await writeFile(outFile, payload);
    console.log(`Saved ESC/POS payload to ${outFile}`);
  }

  console.log(`Available printers (${printers.length}):`);
  for (const p of printers) {
    console.log(`- ${p}`);
  }
  console.log(`Selected printer: ${printerName}`);

  if (dryRun) {
    console.log("Dry run enabled. Not sending to printer.");
    return;
  }

  await printRawToWindowsPrinter(printerName, payload);
  console.log("Print job submitted as RAW ESC/POS.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
