"use strict";

const ipp = require("ipp");

function parsePrinterUri(printerUri) {
  let uri;

  try {
    uri = new URL(printerUri);
  } catch {
    throw new Error("Invalid printer URI. Use ipp://host:port/path.");
  }

  if (uri.protocol !== "ipp:" && uri.protocol !== "ipps:") {
    throw new Error("Unsupported printer URI scheme. Use ipp:// or ipps://.");
  }

  const pathSegments = uri.pathname.split("/").filter(Boolean);

  if (pathSegments.length < 2) {
    throw new Error("Unsupported printer URI path. Use at least two path segments (for example /printers/queue).");
  }

  return {
    printerName: decodeURIComponent(pathSegments[pathSegments.length - 1]),
    normalizedUri: uri.toString()
  };
}

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
    command: "ipp",
    printerUri: normalizedUri,
    printerName
  };
}

module.exports = {
  parsePrinterUri,
  printRawToPrinterUri
};
