"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { getPrinterStatus } = require("../src/printer-status");
const api = require("../src/index");

// Idle bytes: only the fixed bits (bit1, bit4) set.
const IDLE = 0x12;
const ALL_OK = [IDLE, IDLE, IDLE, IDLE];

// Fake network printer that answers every DLE EOT n query with responses[n - 1] via `respond`.
async function withFakePrinter(responses, fn, respond = (socket, answers) => socket.write(Buffer.from(answers))) {
  const sockets = new Set();
  const queries = [];
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});

    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const answers = [];

      while (buffer.length >= 3 && buffer[0] === 0x10 && buffer[1] === 0x04) {
        queries.push(buffer[2]);
        answers.push(responses[buffer[2] - 1]);
        buffer = buffer.subarray(3);
      }

      if (answers.length) {
        respond(socket, answers);
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    return await fn({ uri: `tcp://127.0.0.1:${server.address().port}`, queries });
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => server.close(resolve));
  }
}

test("index exports getPrinterStatus", () => {
  assert.equal(typeof api.getPrinterStatus, "function");
});

test("getPrinterStatus reports an idle printer as ok", async () => {
  await withFakePrinter(ALL_OK, async (printer) => {
    assert.deepEqual(await getPrinterStatus(printer.uri), {
      printerUri: printer.uri,
      online: true,
      coverOpen: false,
      paperEnd: false,
      paperNearEnd: false,
      errors: [],
      ok: true,
      raw: ALL_OK
    });
    assert.deepEqual(printer.queries, [1, 2, 3, 4]);
  });
});

test("getPrinterStatus decodes problem bits", async () => {
  const cases = [
    { raw: [0x1a, 0x16, IDLE, IDLE], expected: { ok: false, online: false, coverOpen: true } },
    { raw: [0x1a, 0x32, IDLE, 0x7e], expected: { ok: false, paperEnd: true, paperNearEnd: true } },
    { raw: [IDLE, IDLE, IDLE, 0x1e], expected: { ok: true, paperEnd: false, paperNearEnd: true } },
    { raw: [0x1a, 0x52, 0x7a, IDLE], expected: { ok: false, errors: ["autocutter error", "unrecoverable error", "auto-recoverable error"] } },
    { raw: [0x1a, 0x52, IDLE, IDLE], expected: { ok: false, errors: ["error"] } },
    { raw: [0x1a, IDLE, IDLE, IDLE], expected: { ok: false, online: false, errors: [] } }
  ];

  for (const { raw, expected } of cases) {
    await withFakePrinter(raw, async (printer) => {
      const status = await getPrinterStatus(printer.uri);
      for (const [key, value] of Object.entries(expected)) {
        assert.deepEqual(status[key], value, `${key} for ${raw}`);
      }
    });
  }
});

test("getPrinterStatus handles responses split into single-byte chunks", async () => {
  const respond = (socket, answers) => answers.forEach((byte, i) => setTimeout(() => socket.write(Buffer.from([byte])), 10 * (i + 1)));

  await withFakePrinter([IDLE, 0x16, IDLE, IDLE], async (printer) => {
    const status = await getPrinterStatus(printer.uri);
    assert.deepEqual(status.raw, [IDLE, 0x16, IDLE, IDLE]);
    assert.equal(status.coverOpen, true);
  }, respond);
});

test("getPrinterStatus rejects bytes that are not DLE EOT responses", async () => {
  await withFakePrinter([IDLE, 0xff, IDLE, IDLE], async (printer) => {
    await assert.rejects(() => getPrinterStatus(printer.uri), /Invalid status response byte 0xff from 127\.0\.0\.1:\d+/);
  });
});

test("getPrinterStatus times out when the printer answers only partially", async () => {
  await withFakePrinter(ALL_OK, async (printer) => {
    await assert.rejects(
      () => getPrinterStatus(printer.uri, { timeoutMs: 100 }),
      /Printer did not answer status query within 100ms for 127\.0\.0\.1:\d+/
    );
  }, (socket, answers) => socket.write(Buffer.from(answers.slice(0, 2))));
});

test("getPrinterStatus rejects when the printer closes the connection early", async () => {
  await withFakePrinter(ALL_OK, async (printer) => {
    await assert.rejects(() => getPrinterStatus(printer.uri), /Printer closed the connection before answering status query/);
  }, (socket) => socket.destroy());
});

test("getPrinterStatus reports connection failures with host:port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  await assert.rejects(() => getPrinterStatus(`tcp://127.0.0.1:${port}`), new RegExp(`TCP connection failed for 127\\.0\\.0\\.1:${port}: .*ECONNREFUSED`));
});

test("getPrinterStatus rejects non-tcp and invalid URIs before connecting", async () => {
  const createConnection = () => {
    throw new Error("must not connect");
  };

  for (const uri of ["ipp://taiga.local:631/printers/TM-T88V", "EPSON TM-T88V", "tcp://127.0.0.1:70000"]) {
    await assert.rejects(() => getPrinterStatus(uri, { createConnection }), /tcp:\/\/host\[:port\]/);
  }
});
