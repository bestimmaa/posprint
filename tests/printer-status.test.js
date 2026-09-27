"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const {
  getPrinterStatus,
  decodePrinterStatus,
  describePrinterStatusProblems,
  DEFAULT_STATUS_TIMEOUT_MS,
  PRINTER_STATUS_ERROR_CODES,
  STATUS_QUERY
} = require("../src/printer-status");
const api = require("../src/index");

// Idle bytes: only the fixed bits (bit1, bit4) set.
const IDLE = 0x12;
const ALL_OK = [IDLE, IDLE, IDLE, IDLE];

/**
 * Fake network printer: parses DLE EOT n queries and answers with scripted bytes.
 * `respond(socket, bytesForQueries)` controls how answers are written (chunking, silence, ...).
 */
async function startFakePrinter(responses, { respond } = {}) {
  const sockets = new Set();
  const queries = [];

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});

    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const answers = [];

      while (buffer.length >= 3 && buffer[0] === 0x10 && buffer[1] === 0x04) {
        const n = buffer[2];
        queries.push(n);
        answers.push(responses[n - 1]);
        buffer = buffer.subarray(3);
      }

      if (!answers.length) {
        return;
      }

      if (respond) {
        respond(socket, answers);
      } else {
        socket.write(Buffer.from(answers));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: server.address().port,
    uri: `tcp://127.0.0.1:${server.address().port}`,
    queries,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(resolve);
      })
  };
}

async function withFakePrinter(responses, options, fn) {
  const printer = await startFakePrinter(responses, options);
  try {
    return await fn(printer);
  } finally {
    await printer.close();
  }
}

test("status query sends DLE EOT 1..4", () => {
  assert.deepEqual([...STATUS_QUERY], [0x10, 4, 1, 0x10, 4, 2, 0x10, 4, 3, 0x10, 4, 4]);
  assert.equal(DEFAULT_STATUS_TIMEOUT_MS, 5000);
});

test("index exports getPrinterStatus", () => {
  assert.equal(api.getPrinterStatus, getPrinterStatus);
});

test("getPrinterStatus reports an idle printer as ok", async () => {
  await withFakePrinter(ALL_OK, {}, async (printer) => {
    const status = await getPrinterStatus(printer.uri);

    assert.equal(status.ok, true);
    assert.equal(status.online, true);
    assert.equal(status.coverOpen, false);
    assert.equal(status.paperEnd, false);
    assert.equal(status.paperNearEnd, false);
    assert.equal(status.paperFeedButton, false);
    assert.deepEqual(status.errors, { autocutter: false, unrecoverable: false, autoRecoverable: false });
    assert.deepEqual(status.raw, ALL_OK);
    assert.equal(status.printerUri, printer.uri);
    assert.equal(status.port, printer.port);
    assert.deepEqual(printer.queries, [1, 2, 3, 4]);
    assert.deepEqual(describePrinterStatusProblems(status), []);
  });
});

test("getPrinterStatus reports cover open", async () => {
  // n=1 bit3 offline; n=2 bit2 cover open
  await withFakePrinter([0x1a, 0x16, IDLE, IDLE], {}, async (printer) => {
    const status = await getPrinterStatus(printer.uri);

    assert.equal(status.ok, false);
    assert.equal(status.online, false);
    assert.equal(status.coverOpen, true);
    assert.deepEqual(describePrinterStatusProblems(status), ["cover open"]);
  });
});

test("getPrinterStatus reports paper end", async () => {
  // n=1 offline; n=2 bit5 stopped by paper end; n=4 bits 2,3,5,6 near end + end
  await withFakePrinter([0x1a, 0x32, IDLE, 0x7e], {}, async (printer) => {
    const status = await getPrinterStatus(printer.uri);

    assert.equal(status.ok, false);
    assert.equal(status.paperEnd, true);
    assert.equal(status.paperNearEnd, true);
    assert.deepEqual(describePrinterStatusProblems(status), ["paper end"]);
  });
});

test("getPrinterStatus reports paper near end as ok with warning flag", async () => {
  await withFakePrinter([IDLE, IDLE, IDLE, 0x1e], {}, async (printer) => {
    const status = await getPrinterStatus(printer.uri);

    assert.equal(status.ok, true);
    assert.equal(status.paperNearEnd, true);
    assert.equal(status.paperEnd, false);
  });
});

test("getPrinterStatus reports autocutter error", async () => {
  // n=1 offline; n=2 bit6 error occurred; n=3 bit3 autocutter
  await withFakePrinter([0x1a, 0x52, 0x1a, IDLE], {}, async (printer) => {
    const status = await getPrinterStatus(printer.uri);

    assert.equal(status.ok, false);
    assert.equal(status.errorOccurred, true);
    assert.deepEqual(status.errors, { autocutter: true, unrecoverable: false, autoRecoverable: false });
    assert.deepEqual(describePrinterStatusProblems(status), ["autocutter error"]);
  });
});

test("getPrinterStatus decodes unrecoverable, auto-recoverable, and feed button bits", () => {
  const status = decodePrinterStatus([0x52, 0x12, 0x72, 0x12]);

  assert.equal(status.paperFeedButton, true);
  assert.equal(status.errors.unrecoverable, true);
  assert.equal(status.errors.autoRecoverable, true);
  assert.equal(status.ok, false);
});

test("describePrinterStatusProblems falls back to offline when no cause is reported", () => {
  const status = decodePrinterStatus([0x1a, IDLE, IDLE, IDLE]);
  assert.equal(status.ok, false);
  assert.deepEqual(describePrinterStatusProblems(status), ["offline"]);
});

test("getPrinterStatus handles responses split into single-byte chunks", async () => {
  const respond = (socket, answers) => {
    answers.forEach((byte, index) => {
      setTimeout(() => socket.write(Buffer.from([byte])), 10 * (index + 1));
    });
  };

  await withFakePrinter([IDLE, 0x16, IDLE, IDLE], { respond }, async (printer) => {
    const status = await getPrinterStatus(printer.uri);
    assert.equal(status.coverOpen, true);
    assert.deepEqual(status.raw, [IDLE, 0x16, IDLE, IDLE]);
  });
});

test("getPrinterStatus handles responses with two bytes per chunk", async () => {
  const respond = (socket, answers) => {
    socket.write(Buffer.from(answers.slice(0, 2)));
    setTimeout(() => socket.write(Buffer.from(answers.slice(2))), 20);
  };

  await withFakePrinter(ALL_OK, { respond }, async (printer) => {
    const status = await getPrinterStatus(printer.uri);
    assert.equal(status.ok, true);
  });
});

test("getPrinterStatus rejects an invalid response byte", async () => {
  await withFakePrinter([IDLE, 0xff, IDLE, IDLE], {}, async (printer) => {
    await assert.rejects(
      () => getPrinterStatus(printer.uri),
      (error) => {
        assert.equal(error.code, PRINTER_STATUS_ERROR_CODES.INVALID_RESPONSE);
        assert.match(error.message, /Invalid status response byte 0xff for DLE EOT 2 from 127\.0\.0\.1:\d+/);
        return true;
      }
    );
  });
});

test("getPrinterStatus times out when the printer never answers", async () => {
  await withFakePrinter(ALL_OK, { respond: () => {} }, async (printer) => {
    const started = Date.now();
    await assert.rejects(
      () => getPrinterStatus(printer.uri, { timeoutMs: 150 }),
      (error) => {
        assert.equal(error.code, PRINTER_STATUS_ERROR_CODES.TIMEOUT);
        assert.match(
          error.message,
          new RegExp(`Printer did not answer status query within 150ms for 127\\.0\\.0\\.1:${printer.port}`)
        );
        return true;
      }
    );
    assert.ok(Date.now() - started < 2000);
  });
});

test("getPrinterStatus reports partial answers on timeout", async () => {
  const respond = (socket, answers) => socket.write(Buffer.from(answers.slice(0, 2)));

  await withFakePrinter(ALL_OK, { respond }, async (printer) => {
    await assert.rejects(() => getPrinterStatus(printer.uri, { timeoutMs: 150 }), /received 2 of 4 bytes/);
  });
});

test("getPrinterStatus rejects when the printer closes the connection early", async () => {
  const respond = (socket) => socket.destroy();

  await withFakePrinter(ALL_OK, { respond }, async (printer) => {
    await assert.rejects(
      () => getPrinterStatus(printer.uri),
      /Printer closed the connection before answering status query for 127\.0\.0\.1:\d+/
    );
  });
});

test("getPrinterStatus reports connection failures with host:port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  await assert.rejects(
    () => getPrinterStatus(`tcp://127.0.0.1:${port}`),
    new RegExp(`TCP connection failed for 127\\.0\\.0\\.1:${port}: .*ECONNREFUSED`)
  );
});

test("getPrinterStatus only supports tcp:// URIs", async () => {
  const createConnection = () => {
    throw new Error("must not connect");
  };

  for (const uri of ["ipp://taiga.local:631/printers/TM-T88V", "EPSON TM-T88V", undefined]) {
    await assert.rejects(
      () => getPrinterStatus(uri, { createConnection }),
      (error) => {
        assert.equal(error.code, PRINTER_STATUS_ERROR_CODES.UNSUPPORTED_TARGET);
        assert.match(error.message, /status is only supported for tcp:\/\/ printer URIs/);
        return true;
      }
    );
  }

  await assert.rejects(
    () => getPrinterStatus("tcp://127.0.0.1:70000", { createConnection }),
    /Invalid tcp:\/\/ printer URI port/
  );
});

test("getPrinterStatus rejects invalid timeout", async () => {
  await assert.rejects(() => getPrinterStatus("tcp://127.0.0.1", { timeoutMs: 0 }), /timeoutMs must be a positive number/);
});
