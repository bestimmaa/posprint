"use strict";

const os = require("node:os");
const windows = require("./windows-raw-printer");
const linux = require("./linux-cups-printer");
const ipp = require("./ipp-printer");
const tcp = require("./tcp-printer");
const { getPrinterUriScheme } = require("./printer-uri");

function assertSupportedPlatform(platform) {
  if (platform !== "win32" && platform !== "linux" && platform !== "darwin") {
    throw new Error(`Unsupported platform: ${platform}. Supported platforms are win32, linux, and darwin.`);
  }
}

function createPrintBridge({ platform = os.platform, windows: win = windows, linux: lin = linux, ipp: uri = ipp, tcp: raw = tcp } = {}) {
  async function listPrinters() {
    const platformName = platform();
    assertSupportedPlatform(platformName);

    if (platformName === "win32") {
      return win.listPrinters();
    }

    return lin.listPrintersLinux();
  }

  async function printRaw(printerName, data) {
    const platformName = platform();
    assertSupportedPlatform(platformName);

    if (platformName === "win32") {
      return win.printRawToWindowsPrinter(printerName, data);
    }

    return lin.printRawToLinuxPrinter(printerName, data);
  }

  async function printRawToPrinterUri(printerUri, data) {
    const platformName = platform();
    assertSupportedPlatform(platformName);

    if (getPrinterUriScheme(printerUri) === "tcp") {
      return raw.printRawToTcpPrinter(printerUri, data);
    }

    return uri.printRawToPrinterUri(printerUri, data);
  }

  return { listPrinters, printRaw, printRawToPrinterUri };
}

const defaultBridge = createPrintBridge();

module.exports = {
  createPrintBridge,
  listPrinters: (...args) => defaultBridge.listPrinters(...args),
  printRaw: (...args) => defaultBridge.printRaw(...args),
  printRawToPrinterUri: (...args) => defaultBridge.printRawToPrinterUri(...args)
};
