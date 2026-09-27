"use strict";

const { markdownToEscpos } = require("./markdown-to-escpos");
const { listPrinters, printRaw, printRawToPrinterUri } = require("./print-bridge");
const { printRawToWindowsPrinter } = require("./windows-raw-printer");
const { selectPrinterName } = require("./cli-common");
const { getPrinterStatus } = require("./printer-status");

module.exports = {
  markdownToEscpos,
  getPrinterStatus,
  listPrinters,
  printRaw,
  printRawToPrinterUri,
  printRawToWindowsPrinter,
  selectPrinterName
};
