"use strict";

const INVALID_URI_ERROR = "Invalid printer URI. Use ipp://host:port/path.";
const UNSUPPORTED_SCHEME_ERROR = "Unsupported printer URI scheme. Use ipp:// or ipps://.";
const UNSUPPORTED_PATH_ERROR = "Unsupported printer URI path. Use at least two path segments (for example /printers/queue).";

const PRINTER_URI_ERROR_CODES = {
  INVALID_URI: "INVALID_URI",
  UNSUPPORTED_SCHEME: "UNSUPPORTED_SCHEME",
  UNSUPPORTED_PATH: "UNSUPPORTED_PATH"
};

function createPrinterUriError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSupportedScheme(uri) {
  if (uri.protocol !== "ipp:" && uri.protocol !== "ipps:") {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME, UNSUPPORTED_SCHEME_ERROR);
  }
}

function assertSupportedPath(pathSegments) {
  if (pathSegments.length < 2) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_PATH, UNSUPPORTED_PATH_ERROR);
  }
}

function normalizePrinterUri(printerUri, { allowHttpUpgrade = false } = {}) {
  let uri;
  let wasUpgraded = false;

  try {
    uri = new URL(printerUri);
  } catch {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_URI_ERROR);
  }

  if (allowHttpUpgrade && (uri.protocol === "http:" || uri.protocol === "https:")) {
    const upgradedProtocol = uri.protocol === "http:" ? "ipp:" : "ipps:";
    uri = new URL(`${upgradedProtocol}//${uri.host}${uri.pathname}${uri.search}`);
    wasUpgraded = true;
  }

  assertSupportedScheme(uri);

  return {
    normalizedUri: uri.toString(),
    wasUpgraded
  };
}

function parsePrinterUri(printerUri, options) {
  const { normalizedUri } = normalizePrinterUri(printerUri, options);
  const uri = new URL(normalizedUri);
  const pathSegments = uri.pathname.split("/").filter(Boolean);

  assertSupportedPath(pathSegments);

  let printerName;

  try {
    printerName = decodeURIComponent(pathSegments[pathSegments.length - 1]);
  } catch {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_URI_ERROR);
  }

  return {
    printerName,
    normalizedUri
  };
}

module.exports = {
  PRINTER_URI_ERROR_CODES,
  normalizePrinterUri,
  parsePrinterUri
};
