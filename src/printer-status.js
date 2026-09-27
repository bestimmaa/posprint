"use strict";

const net = require("node:net");
const { parseTcpPrinterUri } = require("./printer-uri");
const { formatEndpoint } = require("./tcp-printer");

const DEFAULT_STATUS_TIMEOUT_MS = 5000;

const STATUS_ONLY_TCP_ERROR = "Printer status is only supported for tcp:// printer URIs.";

const PRINTER_STATUS_ERROR_CODES = {
  UNSUPPORTED_TARGET: "STATUS_UNSUPPORTED_TARGET",
  CONNECTION_FAILED: "STATUS_CONNECTION_FAILED",
  TIMEOUT: "STATUS_TIMEOUT",
  CONNECTION_CLOSED: "STATUS_CONNECTION_CLOSED",
  INVALID_RESPONSE: "STATUS_INVALID_RESPONSE"
};

/*
 * ESC/POS real-time status transmission: DLE EOT n (0x10 0x04 n).
 *
 * Bit meanings per the Epson ESC/POS command reference ("DLE EOT", TM-T88V column), checked
 * against the published reference as recalled at implementation time (2026-09); not verified
 * against a physical printer in this change:
 *
 *   n=1 printer status:    bit2 drawer kick-out connector pin 3 level (not reported here),
 *                          bit3 offline, bit5 waiting for online recovery,
 *                          bit6 paper feed button pressed
 *   n=2 offline cause:     bit2 cover open, bit3 paper being fed by the feed button,
 *                          bit5 printing stopped because of paper end, bit6 error occurred
 *   n=3 error cause:       bit3 autocutter error, bit5 unrecoverable error,
 *                          bit6 auto-recoverable error
 *                          (bit2 is "recoverable/mechanical error" on some models and
 *                          reserved/fixed 0 on others; it is exposed only in `raw`)
 *   n=4 roll paper sensor: bits 2+3 roll paper near-end, bits 5+6 roll paper end
 *                          (the spec documents both bits of a pair as set together; a single
 *                          set bit is treated as "detected" to err on the side of reporting)
 *
 * Every response byte has fixed bits: bit0 = 0, bit1 = 1, bit4 = 1, bit7 = 0. That pattern
 * (0xx1 xx10) is used to reject bytes that are not DLE EOT responses, e.g. Automatic Status
 * Back (ASB) data, which has bit1 = 0 in its first byte.
 */
const STATUS_QUERY = Buffer.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x03, 0x10, 0x04, 0x04]);
const RESPONSE_LENGTH = 4;
const FIXED_BITS_MASK = 0x93; // bits 7, 4, 1, 0
const FIXED_BITS_VALUE = 0x12; // bit4 = 1, bit1 = 1

function bit(byte, index) {
  return (byte & (1 << index)) !== 0;
}

function createStatusError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isValidStatusByte(byte) {
  return Number.isInteger(byte) && byte >= 0 && byte <= 0xff && (byte & FIXED_BITS_MASK) === FIXED_BITS_VALUE;
}

/**
 * Decode the four DLE EOT response bytes (n = 1..4, in that order) into a status object.
 */
function decodePrinterStatus(raw) {
  const bytes = Array.from(raw);

  if (bytes.length !== RESPONSE_LENGTH) {
    throw new TypeError(`Expected ${RESPONSE_LENGTH} status bytes, got ${bytes.length}`);
  }

  bytes.forEach((byte, index) => {
    if (!isValidStatusByte(byte)) {
      throw createStatusError(
        PRINTER_STATUS_ERROR_CODES.INVALID_RESPONSE,
        `Invalid status response byte 0x${Number(byte).toString(16).padStart(2, "0")} for DLE EOT ${index + 1}.`
      );
    }
  });

  const [printer, offline, error, paper] = bytes;

  const errors = {
    autocutter: bit(error, 3),
    unrecoverable: bit(error, 5),
    autoRecoverable: bit(error, 6)
  };

  const status = {
    online: !bit(printer, 3),
    waitingForOnlineRecovery: bit(printer, 5),
    paperFeedButton: bit(printer, 6),
    coverOpen: bit(offline, 2),
    paperFeeding: bit(offline, 3),
    paperEnd: bit(offline, 5) || bit(paper, 5) || bit(paper, 6),
    paperNearEnd: bit(paper, 2) || bit(paper, 3),
    errorOccurred: bit(offline, 6),
    errors,
    raw: bytes
  };

  status.ok =
    status.online &&
    !status.paperEnd &&
    !status.coverOpen &&
    !status.errorOccurred &&
    !Object.values(errors).some(Boolean);

  return status;
}

/**
 * Human-readable list of problems that make `status.ok` false. Paper near-end is a warning,
 * not a problem, and is not included.
 */
function describePrinterStatusProblems(status) {
  const problems = [];

  if (status.coverOpen) problems.push("cover open");
  if (status.paperEnd) problems.push("paper end");
  if (status.errors.autocutter) problems.push("autocutter error");
  if (status.errors.unrecoverable) problems.push("unrecoverable error");
  if (status.errors.autoRecoverable) problems.push("auto-recoverable error");
  if (status.paperFeeding) problems.push("paper being fed by feed button");

  if (status.errorOccurred && !Object.values(status.errors).some(Boolean)) {
    problems.push("error");
  }

  if (!status.online && !problems.length) {
    problems.push("offline");
  }

  return problems;
}

/**
 * Query real-time status of a network ESC/POS printer via DLE EOT 1..4 on one TCP connection.
 */
async function getPrinterStatus(
  printerUri,
  { timeoutMs = DEFAULT_STATUS_TIMEOUT_MS, createConnection = net.createConnection } = {}
) {
  // Check the scheme textually so malformed tcp:// URIs (e.g. a bad port) get the URI parser's
  // specific error instead of the generic "tcp only" one.
  if (typeof printerUri !== "string" || !/^tcp:\/\//i.test(printerUri.trim())) {
    throw createStatusError(PRINTER_STATUS_ERROR_CODES.UNSUPPORTED_TARGET, STATUS_ONLY_TCP_ERROR);
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number");
  }

  const { host, port, normalizedUri } = parseTcpPrinterUri(printerUri);
  const endpoint = formatEndpoint(host, port);

  const raw = await new Promise((resolve, reject) => {
    let settled = false;
    let received = Buffer.alloc(0);
    const socket = createConnection({ host, port });

    function finish(error, value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    const timer = setTimeout(() => {
      finish(
        createStatusError(
          PRINTER_STATUS_ERROR_CODES.TIMEOUT,
          `Printer did not answer status query within ${timeoutMs}ms for ${endpoint} ` +
            `(received ${received.length} of ${RESPONSE_LENGTH} bytes).`
        )
      );
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(STATUS_QUERY);
    });

    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);

      if (received.length >= RESPONSE_LENGTH) {
        finish(null, Array.from(received.subarray(0, RESPONSE_LENGTH)));
      }
    });

    socket.on("error", (error) => {
      finish(
        createStatusError(
          PRINTER_STATUS_ERROR_CODES.CONNECTION_FAILED,
          `TCP connection failed for ${endpoint}: ${error.message || error}`
        )
      );
    });

    socket.on("close", () => {
      finish(
        createStatusError(
          PRINTER_STATUS_ERROR_CODES.CONNECTION_CLOSED,
          `Printer closed the connection before answering status query for ${endpoint} ` +
            `(received ${received.length} of ${RESPONSE_LENGTH} bytes).`
        )
      );
    });
  });

  let status;

  try {
    status = decodePrinterStatus(raw);
  } catch (error) {
    if (error.code === PRINTER_STATUS_ERROR_CODES.INVALID_RESPONSE) {
      error.message = `${error.message.replace(/\.$/, "")} from ${endpoint}. Is this an ESC/POS printer?`;
    }

    throw error;
  }

  return { printerUri: normalizedUri, host, port, ...status };
}

module.exports = {
  DEFAULT_STATUS_TIMEOUT_MS,
  PRINTER_STATUS_ERROR_CODES,
  STATUS_QUERY,
  decodePrinterStatus,
  describePrinterStatusProblems,
  getPrinterStatus
};
