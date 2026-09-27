"use strict";

const { markdownToEscpos } = require("./markdown-to-escpos");
const { listPrinters, printRaw, printRawToPrinterUri } = require("./print-bridge");
const { printRawToWindowsPrinter } = require("./windows-raw-printer");
const { selectPrinterName } = require("./cli-common");
const { getPrinterStatus } = require("./printer-status");
const { previewEscpos } = require("./escpos-preview");

module.exports = {
  markdownToEscpos,
  previewEscpos,
  getPrinterStatus,
  listPrinters,
  printRaw,
  printRawToPrinterUri,
  printRawToWindowsPrinter,
  selectPrinterName
};
