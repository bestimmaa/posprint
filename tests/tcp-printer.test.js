"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { printRawToTcpPrinter, DEFAULT_TCP_TIMEOUT_MS } = require("../src/tcp-printer");

async function startServer(onConnection, serverOptions = {}) {
  const sockets = new Set();
  const server = net.createServer(serverOptions, (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    onConnection(socket);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close(resolve);
      })
  };
}

function startCollectingServer(serverOptions) {
  const chunks = [];
  let ended;
  const endedPromise = new Promise((resolve) => {
    ended = resolve;
  });

  return startServer((socket) => {
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => ended(Buffer.concat(chunks)));
  }, serverOptions).then((server) => ({ ...server, received: endedPromise }));
}

test("default timeout is 10 seconds", () => {
  assert.equal(DEFAULT_TCP_TIMEOUT_MS, 10000);
});

test("printRawToTcpPrinter requires Buffer payload", async () => {
  await assert.rejects(() => printRawToTcpPrinter("tcp://127.0.0.1:9100", "bad"), /data must be a Buffer/);
});

test("printRawToTcpPrinter rejects invalid timeout", async () => {
  await assert.rejects(
    () => printRawToTcpPrinter("tcp://127.0.0.1:9100", Buffer.from("x"), { timeoutMs: 0 }),
    /timeoutMs must be a positive number/
  );
});

test("printRawToTcpPrinter rejects non-tcp and invalid URIs before connecting", async () => {
  const createConnection = () => {
    throw new Error("must not connect");
  };

  await assert.rejects(
    () => printRawToTcpPrinter("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), { createConnection }),
    /raw TCP printing/
  );
  await assert.rejects(
    () => printRawToTcpPrinter("tcp://127.0.0.1:70000", Buffer.from("x"), { createConnection }),
    /Invalid tcp:\/\/ printer URI port/
  );
});

test("printRawToTcpPrinter sends exact bytes to the listener", async () => {
  const server = await startCollectingServer();

  try {
    const payload = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0a, 0x00, 0xff, 0x1d, 0x56, 0x00]);
    const result = await printRawToTcpPrinter(`tcp://127.0.0.1:${server.port}`, payload);

    assert.deepEqual(await server.received, payload);
    assert.deepEqual(result, {
      backend: "tcp",
      command: "tcp",
      printerUri: `tcp://127.0.0.1:${server.port}`,
      host: "127.0.0.1",
      port: server.port,
      bytes: payload.length
    });
  } finally {
    await server.close();
  }
});

test("printRawToTcpPrinter sends large payloads intact", async () => {
  const server = await startCollectingServer();

  try {
    const payload = Buffer.alloc(2 * 1024 * 1024);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = i % 251;
    }

    await printRawToTcpPrinter(`tcp://127.0.0.1:${server.port}`, payload);
    assert.equal(Buffer.compare(await server.received, payload), 0);
  } finally {
    await server.close();
  }
});

test("printRawToTcpPrinter tolerates printers that send status bytes back", async () => {
  const chunks = [];
  const server = await startServer((socket) => {
    socket.write(Buffer.from([0x10, 0x04, 0x01]));
    socket.on("data", (chunk) => chunks.push(chunk));
  });

  try {
    await printRawToTcpPrinter(`tcp://127.0.0.1:${server.port}`, Buffer.from("receipt"));
    assert.equal(Buffer.concat(chunks).toString(), "receipt");
  } finally {
    await server.close();
  }
});

test("printRawToTcpPrinter resolves when printer keeps connection open after payload", async () => {
  const chunks = [];
  // allowHalfOpen: the server never closes its side, like some printer firmwares.
  const server = await startServer((socket) => {
    socket.on("data", (chunk) => chunks.push(chunk));
  }, { allowHalfOpen: true });

  try {
    const started = Date.now();
    await printRawToTcpPrinter(`tcp://127.0.0.1:${server.port}`, Buffer.from("hold"), { timeoutMs: 100 });
    assert.ok(Date.now() - started >= 90);
    assert.equal(Buffer.concat(chunks).toString(), "hold");
  } finally {
    await server.close();
  }
});

test("printRawToTcpPrinter rejects with host:port on connection refused", async () => {
  const server = await startServer(() => {});
  const { port } = server;
  await server.close();

  await assert.rejects(
    () => printRawToTcpPrinter(`tcp://127.0.0.1:${port}`, Buffer.from("x")),
    (error) => {
      assert.match(error.message, new RegExp(`^TCP connection failed for 127\\.0\\.0\\.1:${port}: .*ECONNREFUSED`));
      return true;
    }
  );
});

class HangingSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
  }

  setTimeout(ms) {
    this.timer = setTimeout(() => this.emit("timeout"), ms);
  }

  end() {
    throw new Error("should not write before connect");
  }

  destroy() {
    clearTimeout(this.timer);
    this.destroyed = true;
    setImmediate(() => this.emit("close"));
  }
}

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
});

test("printRawToTcpPrinter formats IPv6 endpoints in errors", async () => {
  await assert.rejects(
    () =>
      printRawToTcpPrinter("tcp://[fe80::1]:9101", Buffer.from("x"), {
        timeoutMs: 5,
        createConnection: () => new HangingSocket()
      }),
    /for \[fe80::1\]:9101$/
  );
});
