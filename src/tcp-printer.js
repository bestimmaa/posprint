"use strict";

const net = require("node:net");
const { parseTcpPrinterUri } = require("./printer-uri");

const DEFAULT_TCP_TIMEOUT_MS = 10000;

function formatEndpoint(host, port) {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

function tcpConnectionError(endpoint, error) {
  // Multi-address hosts fail with an AggregateError whose message is empty; its code is not.
  return new Error(`TCP connection failed for ${endpoint}: ${error.message || error.code}`);
}

/**
 * Send a raw payload to a network printer over TCP (JetDirect/AppSocket, default port 9100).
 *
 * Resolves once the payload is flushed and the socket has closed. A printer that keeps the
 * connection open after the payload is flushed is disconnected after `timeoutMs` of inactivity.
 * Rejects on connection errors or when connecting/flushing makes no progress for `timeoutMs`.
 */
async function printRawToTcpPrinter(
  printerUri,
  data,
  { timeoutMs = DEFAULT_TCP_TIMEOUT_MS, createConnection = net.createConnection } = {}
) {
  if (!Buffer.isBuffer(data)) {
    throw new TypeError("data must be a Buffer");
  }

  const { host, port, normalizedUri } = parseTcpPrinterUri(printerUri);
  const endpoint = formatEndpoint(host, port);

  await new Promise((resolve, reject) => {
    let flushed = false;
    let failure = null;

    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => socket.end(data));
    socket.on("finish", () => {
      flushed = true;
    });
    // Discard anything the printer sends back (status bytes) so the socket never stalls.
    socket.on("data", () => {});
    socket.on("timeout", () => {
      if (!flushed) {
        failure = new Error(`TCP print timed out after ${timeoutMs}ms for ${endpoint}`);
      }
      socket.destroy();
    });
    socket.on("error", (error) => {
      failure = failure || tcpConnectionError(endpoint, error);
    });
    // "close" fires exactly once, after any "error".
    socket.on("close", () => (failure ? reject(failure) : resolve()));
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
  printRawToTcpPrinter,
  tcpConnectionError
};
