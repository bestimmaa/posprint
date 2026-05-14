"use strict";

const ipp = require("ipp");
const { parsePrinterUri } = require("./printer-uri");

function getStatusCode(response) {
  return response?.["status-code"] || response?.statusCode || "";
}

function isSuccessfulStatus(statusCode) {
  return /^successful-/i.test(String(statusCode));
}

async function printRawToPrinterUri(printerUri, data, { ippClient = ipp, timeoutMs = 15000 } = {}) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  const { printerName, normalizedUri } = parsePrinterUri(printerUri);

  const message = {
    "operation-attributes-tag": {
      "requesting-user-name": "posprint",
      "job-name": "ESC_POS_RAW",
      "document-format": "application/octet-stream"
    },
    data
  };

  const printer = ippClient.Printer(normalizedUri);

  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`IPP request timed out after ${timeoutMs}ms for ${normalizedUri}`));
    }, timeoutMs);

    try {
      printer.execute("Print-Job", message, (error, result) => {
        clearTimeout(timer);

        if (error) {
          reject(new Error(`IPP connection failed for ${normalizedUri}: ${error.message || error}`));
          return;
        }

        resolve(result || {});
      });
    } catch (error) {
      clearTimeout(timer);
      reject(new Error(`IPP connection failed for ${normalizedUri}: ${error.message || error}`));
    }
  });

  const statusCode = getStatusCode(response);

  if (!isSuccessfulStatus(statusCode)) {
    throw new Error(`IPP print failed (${statusCode || "unknown-status"}) for ${normalizedUri}`);
  }

  return {
    backend: "ipp",
    command: "ipp",
    printerUri: normalizedUri,
    printerName
  };
}

module.exports = {
  printRawToPrinterUri
};
