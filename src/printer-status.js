"use strict";

const net = require("node:net");
const { parseTcpPrinterUri } = require("./printer-uri");
const { formatEndpoint, tcpConnectionError } = require("./tcp-printer");

const DEFAULT_STATUS_TIMEOUT_MS = 5000;

// ESC/POS real-time status: DLE EOT n for n = 1 (printer), 2 (offline cause), 3 (error cause),
// 4 (roll paper sensor). Bits per the Epson ESC/POS command reference, DLE EOT, TM-T88V column
// (https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_eot.html, 2026-09; not yet
// verified on a physical printer).
const STATUS_QUERY = Buffer.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x03, 0x10, 0x04, 0x04]);
const RESPONSE_LENGTH = 4;

function bit(byte, index) {
  return (byte & (1 << index)) !== 0;
}

function decodePrinterStatus([printer, offline, error, paper]) {
  const errors = [];

  if (bit(error, 3)) errors.push("autocutter error");
  if (bit(error, 5)) errors.push("unrecoverable error");
  if (bit(error, 6)) errors.push("auto-recoverable error");
  if (bit(offline, 6) && !errors.length) errors.push("error");

  const status = {
    online: !bit(printer, 3),
    coverOpen: bit(offline, 2),
    paperEnd: bit(offline, 5) || bit(paper, 5) || bit(paper, 6),
    paperNearEnd: bit(paper, 2) || bit(paper, 3),
    errors
  };

  status.ok = status.online && !status.coverOpen && !status.paperEnd && !errors.length;
  return status;
}

/**
 * Query the real-time status of a network ESC/POS printer (DLE EOT 1..4 over one TCP connection).
 * Paper near-end is reported but does not make `ok` false.
 */
async function getPrinterStatus(
  printerUri,
  { timeoutMs = DEFAULT_STATUS_TIMEOUT_MS, createConnection = net.createConnection } = {}
) {
  const { host, port, normalizedUri } = parseTcpPrinterUri(printerUri);
  const endpoint = formatEndpoint(host, port);

  const raw = await new Promise((resolve, reject) => {
    let received = Buffer.alloc(0);
    let failure = null;

    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.write(STATUS_QUERY));
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length >= RESPONSE_LENGTH) {
        socket.destroy();
      }
    });
    socket.on("timeout", () => {
      failure = new Error(`Printer did not answer status query within ${timeoutMs}ms for ${endpoint}`);
      socket.destroy();
    });
    socket.on("error", (error) => {
      failure = failure || tcpConnectionError(endpoint, error);
    });
    // "close" fires exactly once, after any "error".
    socket.on("close", () => {
      if (received.length >= RESPONSE_LENGTH) {
        resolve([...received.subarray(0, RESPONSE_LENGTH)]);
      } else {
        reject(failure || new Error(`Printer closed the connection before answering status query for ${endpoint}`));
      }
    });
  });

  // Every DLE EOT response byte has the fixed pattern 0xx1xx10 (bits 7/4/1/0).
  const invalid = raw.find((byte) => (byte & 0x93) !== 0x12);
  if (invalid !== undefined) {
    throw new Error(
      `Invalid status response byte 0x${invalid.toString(16).padStart(2, "0")} from ${endpoint}. Is this an ESC/POS printer?`
    );
  }

  return { printerUri: normalizedUri, ...decodePrinterStatus(raw), raw };
}

module.exports = {
  DEFAULT_STATUS_TIMEOUT_MS,
  getPrinterStatus
};
