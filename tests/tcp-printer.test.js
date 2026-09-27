"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { printRawToTcpPrinter } = require("../src/tcp-printer");

// Starts a local "printer" that records everything it receives.
async function startPrinter({ allowHalfOpen = false, greeting } = {}) {
  const chunks = [];
  const sockets = new Set();
  const server = net.createServer({ allowHalfOpen }, (socket) => {
    sockets.add(socket);
    if (greeting) {
      socket.write(greeting);
    }
    socket.on("data", (chunk) => chunks.push(chunk));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    received: () => Buffer.concat(chunks),
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(resolve);
      })
  };
}

// A socket that never connects, to exercise the timeout path without the network.
class HangingSocket extends EventEmitter {
  setTimeout(ms) {
    this.timer = setTimeout(() => this.emit("timeout"), ms);
  }

  destroy() {
    clearTimeout(this.timer);
    this.destroyed = true;
    setImmediate(() => this.emit("close"));
  }
}

test("printRawToTcpPrinter requires Buffer payload", async () => {
  await assert.rejects(() => printRawToTcpPrinter("tcp://127.0.0.1:9100", "bad"), /data must be a Buffer/);
});

test("printRawToTcpPrinter rejects non-tcp and invalid URIs before connecting", async () => {
  const createConnection = () => {
    throw new Error("must not connect");
  };

  for (const uri of ["ipp://taiga.local:631/printers/TM-T88V", "tcp://127.0.0.1:70000"]) {
    await assert.rejects(() => printRawToTcpPrinter(uri, Buffer.from("x"), { createConnection }), /tcp:\/\/host\[:port\]/);
  }
});

test("printRawToTcpPrinter sends exact bytes and tolerates status bytes sent back", async () => {
  const printer = await startPrinter({ greeting: Buffer.from([0x10, 0x04, 0x01]) });

  try {
    const payload = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x00, 0xff, 0x1d, 0x56, 0x00]);
    const result = await printRawToTcpPrinter(`tcp://127.0.0.1:${printer.port}`, payload);

    assert.deepEqual(printer.received(), payload);
    assert.deepEqual(result, {
      backend: "tcp",
      command: "tcp",
      printerUri: `tcp://127.0.0.1:${printer.port}`,
      host: "127.0.0.1",
      port: printer.port,
      bytes: payload.length
    });
  } finally {
    await printer.close();
  }
});

test("printRawToTcpPrinter resolves when printer keeps connection open after payload", async () => {
  const printer = await startPrinter({ allowHalfOpen: true });

  try {
    await printRawToTcpPrinter(`tcp://127.0.0.1:${printer.port}`, Buffer.from("hold"), { timeoutMs: 100 });
    assert.equal(printer.received().toString(), "hold");
  } finally {
    await printer.close();
  }
});

test("printRawToTcpPrinter rejects with host:port and reason on connection refused", async () => {
  const printer = await startPrinter();
  const { port } = printer;
  await printer.close();

  await assert.rejects(
    () => printRawToTcpPrinter(`tcp://127.0.0.1:${port}`, Buffer.from("x")),
    new RegExp(`^Error: TCP connection failed for 127\\.0\\.0\\.1:${port}: .*ECONNREFUSED`)
  );

  // Node reports a host with several refused addresses as an AggregateError with an empty message.
  await assert.rejects(
    () =>
      printRawToTcpPrinter("tcp://printer.local", Buffer.from("x"), {
        createConnection: () => {
          const socket = new HangingSocket();
          setImmediate(() => {
            socket.emit("error", Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" }));
            socket.destroy();
          });
          return socket;
        }
      }),
    /^Error: TCP connection failed for printer\.local:9100: ECONNREFUSED$/
  );
});

test("printRawToTcpPrinter times out when connection never establishes", async () => {
  let socket;
  let options;

  await assert.rejects(
    () =>
      printRawToTcpPrinter("tcp://printer.local", Buffer.from("x"), {
        timeoutMs: 20,
        createConnection: (opts) => {
          options = opts;
          socket = new HangingSocket();
          return socket;
        }
      }),
    /^Error: TCP print timed out after 20ms for printer\.local:9100$/
  );

  assert.deepEqual(options, { host: "printer.local", port: 9100 });
  assert.equal(socket.destroyed, true);

  await assert.rejects(
    () => printRawToTcpPrinter("tcp://[fe80::1]:9101", Buffer.from("x"), { timeoutMs: 5, createConnection: () => new HangingSocket() }),
    /for \[fe80::1\]:9101$/
  );
});
