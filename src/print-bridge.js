"use strict";

const os = require("node:os");
const windows = require("./windows-raw-printer");
const linux = require("./linux-cups-printer");

function assertSupportedPlatform(platform) {
  if (platform !== "win32" && platform !== "linux") {
    throw new Error(`Unsupported platform: ${platform}. Supported platforms are win32 and linux.`);
  }
}

function createPrintBridge({ platform = os.platform, windows: win = windows, linux: lin = linux } = {}) {
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

  return { listPrinters, printRaw };
}

const defaultBridge = createPrintBridge();

module.exports = {
  createPrintBridge,
  listPrinters: (...args) => defaultBridge.listPrinters(...args),
  printRaw: (...args) => defaultBridge.printRaw(...args)
};
