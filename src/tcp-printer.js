"use strict";

const net = require("node:net");
const { parseTcpPrinterUri } = require("./printer-uri");

const DEFAULT_TCP_TIMEOUT_MS = 10000;

function formatEndpoint(host, port) {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * Send a raw payload to a network printer over TCP (JetDirect/AppSocket, default port 9100).
 *
 * Resolves once the payload has been flushed and the socket has closed. If the printer keeps
 * the connection open after the payload was flushed, the socket is closed after `timeoutMs`
 * of inactivity and the job counts as submitted. Rejects on connection errors, or when the
 * connection cannot be established or the payload cannot be flushed within `timeoutMs`.
 */
async function printRawToTcpPrinter(
  printerUri,
  data,
  { timeoutMs = DEFAULT_TCP_TIMEOUT_MS, createConnection = net.createConnection } = {}
) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive number");
  }

  const { host, port, normalizedUri } = parseTcpPrinterUri(printerUri);
  const endpoint = formatEndpoint(host, port);

  await new Promise((resolve, reject) => {
    let settled = false;
    let flushed = false;
    let failure = null;

    const socket = createConnection({ host, port });

    function settle() {
      if (settled) {
        return;
      }

      settled = true;

      if (failure) {
        reject(failure);
      } else {
        resolve();
      }
    }

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.end(data);
    });

    socket.on("finish", () => {
      flushed = true;
    });

    // Drain anything the printer sends back (status bytes) so the socket never stalls.
    socket.on("data", () => {});

    socket.on("timeout", () => {
      if (!flushed) {
        failure = new Error(`TCP print timed out after ${timeoutMs}ms for ${endpoint}`);
      }

      socket.destroy();
    });

    socket.on("error", (error) => {
      failure = failure || new Error(`TCP connection failed for ${endpoint}: ${error.message || error}`);
    });

    socket.on("close", settle);
  });

  return {
    backend: "tcp",
    command: "tcp",
    printerUri: normalizedUri,
    host,
    port,
    bytes: data.length
  };
}

module.exports = {
  DEFAULT_TCP_TIMEOUT_MS,
  formatEndpoint,
  printRawToTcpPrinter
};
