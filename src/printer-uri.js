"use strict";

const DEFAULT_TCP_PORT = 9100;

const INVALID_URI_ERROR = "Invalid printer URI. Use ipp://host:port/path or tcp://host[:port].";
const UNSUPPORTED_SCHEME_ERROR = "Unsupported printer URI scheme. Use ipp://, ipps://, or tcp://.";
const UNSUPPORTED_PATH_ERROR = "Unsupported printer URI path. Use at least two path segments (for example /printers/queue).";
const UNSUPPORTED_TCP_PATH_ERROR = "Unsupported tcp:// printer URI. Use tcp://host[:port] without a path, query, credentials, or fragment.";
const INVALID_TCP_PORT_ERROR = "Invalid tcp:// printer URI port. Use a port between 1 and 65535 (default: 9100).";

const PRINTER_URI_ERROR_CODES = {
  INVALID_URI: "INVALID_URI",
  UNSUPPORTED_SCHEME: "UNSUPPORTED_SCHEME",
  UNSUPPORTED_PATH: "UNSUPPORTED_PATH",
  INVALID_PORT: "INVALID_PORT"
};

function createPrinterUriError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSupportedScheme(uri) {
  if (uri.protocol !== "ipp:" && uri.protocol !== "ipps:" && uri.protocol !== "tcp:") {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME, UNSUPPORTED_SCHEME_ERROR);
  }
}

function assertSupportedPath(pathSegments) {
  if (pathSegments.length < 2) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_PATH, UNSUPPORTED_PATH_ERROR);
  }
}

// `new URL()` rejects out-of-range or non-numeric ports with a generic error; detect that case
// for tcp:// so callers get a port-specific message.
function looksLikeTcpUriWithBadPort(printerUri) {
  const match = /^tcp:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^/:?#]*):([^/?#]*)/i.exec(String(printerUri));
  return Boolean(match) && (!/^\d+$/.test(match[2]) || Number(match[2]) > 65535);
}

function resolveTcpTarget(uri) {
  if (!uri.hostname) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_URI_ERROR);
  }

  if (uri.username || uri.password || (uri.pathname && uri.pathname !== "/") || uri.search || uri.hash) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.UNSUPPORTED_PATH, UNSUPPORTED_TCP_PATH_ERROR);
  }

  const port = uri.port === "" ? DEFAULT_TCP_PORT : Number(uri.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_PORT, INVALID_TCP_PORT_ERROR);
  }

  // URL keeps IPv6 hosts bracketed; net.connect expects the bare address.
  const host = uri.hostname.replace(/^\[(.*)\]$/, "$1");

  return {
    host,
    port,
    normalizedUri: `tcp://${uri.hostname}:${port}`
  };
}

function normalizePrinterUri(printerUri, { allowHttpUpgrade = false } = {}) {
  let uri;
  let wasUpgraded = false;

  try {
    uri = new URL(printerUri);
  } catch {
    if (looksLikeTcpUriWithBadPort(printerUri)) {
      throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_PORT, INVALID_TCP_PORT_ERROR);
    }

    throw createPrinterUriError(PRINTER_URI_ERROR_CODES.INVALID_URI, INVALID_URI_ERROR);
  }

  if (allowHttpUpgrade && (uri.protocol === "http:" || uri.protocol === "https:")) {
    const upgradedProtocol = uri.protocol === "http:" ? "ipp:" : "ipps:";
    uri = new URL(`${upgradedProtocol}//${uri.host}${uri.pathname}${uri.search}`);
    wasUpgraded = true;
  }

  assertSupportedScheme(uri);

  if (uri.protocol === "tcp:") {
    return {
      normalizedUri: resolveTcpTarget(uri).normalizedUri,
      wasUpgraded
    };
  }

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
  const { normalizedUri } = normalizePrinterUri(printerUri);
  const uri = new URL(normalizedUri);

  if (uri.protocol !== "tcp:") {
    throw createPrinterUriError(
      PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME,
      "Unsupported printer URI scheme for raw TCP printing. Use tcp://host[:port]."
    );
  }

  return resolveTcpTarget(uri);
}

function parsePrinterUri(printerUri, options) {
  const { normalizedUri } = normalizePrinterUri(printerUri, options);
  const uri = new URL(normalizedUri);

  if (uri.protocol === "tcp:") {
    throw createPrinterUriError(
      PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME,
      "Unsupported printer URI scheme for IPP printing. Use ipp:// or ipps:// (tcp:// URIs are printed over raw TCP)."
    );
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
  DEFAULT_TCP_PORT,
  PRINTER_URI_ERROR_CODES,
  getPrinterUriScheme,
  normalizePrinterUri,
  parsePrinterUri,
  parseTcpPrinterUri
};
