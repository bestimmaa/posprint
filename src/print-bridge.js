"use strict";

const os = require("node:os");
const windows = require("./windows-raw-printer");
const linux = require("./linux-cups-printer");
const ipp = require("./ipp-printer");

function assertSupportedPlatform(platform) {
  if (platform !== "win32" && platform !== "linux" && platform !== "darwin") {
    throw new Error(`Unsupported platform: ${platform}. Supported platforms are win32, linux, and darwin.`);
  }
}

function createPrintBridge({ platform = os.platform, windows: win = windows, linux: lin = linux, ipp: uri = ipp } = {}) {
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
