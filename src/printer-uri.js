"use strict";

const DEFAULT_TCP_PORT = 9100;

const INVALID_URI_ERROR = "Invalid printer URI. Use ipp://host:port/path or tcp://host[:port].";
const UNSUPPORTED_SCHEME_ERROR = "Unsupported printer URI scheme. Use ipp://, ipps://, or tcp://.";
const UNSUPPORTED_PATH_ERROR = "Unsupported printer URI path. Use at least two path segments (for example /printers/queue).";
const INVALID_TCP_URI_ERROR = "Invalid tcp:// printer URI. Use tcp://host[:port] with no path and a port between 1 and 65535 (default: 9100).";

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

  if (uri.protocol === "tcp:") {
    return { normalizedUri: parseTcpPrinterUri(printerUri).normalizedUri, wasUpgraded };
  }

  assertSupportedScheme(uri);

  return {
    normalizedUri: uri.toString(),
    wasUpgraded
  };
}

function getPrinterUriScheme(printerUri) {
  try {
    return new URL(printerUri).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function parseTcpPrinterUri(printerUri) {
  let uri;

  try {
    uri = new URL(printerUri);
  } catch {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_TCP_URI_ERROR);
  }

  if (uri.protocol !== "tcp:") {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME, "Unsupported printer URI scheme. Use tcp://host[:port].");
  }

  // URL already limits the port to 0-65535; tcp:// has no default port, so an empty port means 9100.
  const port = uri.port === "" ? DEFAULT_TCP_PORT : Number(uri.port);

  if (!uri.hostname || port === 0 || uri.username || uri.password || uri.search || uri.hash || (uri.pathname !== "" && uri.pathname !== "/")) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_TCP_URI_ERROR);
  }

  return {
    // URL keeps IPv6 hosts bracketed; net.connect expects the bare address.
    host: uri.hostname.replace(/^\[(.*)\]$/, "$1"),
    port,
    normalizedUri: `tcp://${uri.hostname}:${port}`
  };
}

function parsePrinterUri(printerUri, options) {
  const { normalizedUri } = normalizePrinterUri(printerUri, options);
  const uri = new URL(normalizedUri);

  if (uri.protocol === "tcp:") {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME, "Unsupported printer URI scheme for IPP. Use ipp:// or ipps://.");
  }

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
  getPrinterUriScheme,
  normalizePrinterUri,
  parsePrinterUri,
  parseTcpPrinterUri
};
