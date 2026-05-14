"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  parseLpstatPrinters,
  parsePrinterUri,
  listPrintersLinux,
  printRawToLinuxPrinter,
  printRawToPrinterUri
} = require("../src/linux-cups-printer");

function mockSpawnFactory(handlers) {
  return (cmd, args) => {
    const key = `${cmd} ${args.join(" ")}`;
    const handler = handlers[key] || handlers[cmd];
    if (!handler) {
      const err = new Error("ENOENT");
      err.code = "ENOENT";
      throw err;
    }

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
      chunks: [],
      write(chunk) {
        this.chunks.push(Buffer.from(chunk));
      },
      end() {}
    };

    queueMicrotask(() => handler(child));
    return child;
  };
}

test("parseLpstatPrinters parses printer names", () => {
  const output = "EPSON_TM_T88V accepting requests since Tue\nOffice accepting requests since Tue\n";
  assert.deepEqual(parseLpstatPrinters(output), ["EPSON_TM_T88V", "Office"]);
});

test("listPrintersLinux returns parsed lpstat printers", async () => {
  const spawn = mockSpawnFactory({
    lpstat: (child) => {
      child.stdout.emit("data", "EPSON_TM_T88V accepting requests since now\n");
      child.emit("close", 0);
    }
  });

  const printers = await listPrintersLinux({ spawn });
  assert.deepEqual(printers, ["EPSON_TM_T88V"]);
});

test("printRawToLinuxPrinter uses lp with raw mode", async () => {
  let called = "";
  const spawn = mockSpawnFactory({
    lp: (child) => {
      called = "lp";
      child.emit("close", 0);
    }
  });

  const result = await printRawToLinuxPrinter("EPSON_TM_T88V", Buffer.from([0x1b, 0x40]), { spawn });
  assert.deepEqual(result, {
    backend: "cups-local",
    command: "lp",
    printerName: "EPSON_TM_T88V"
  });
  assert.equal(called, "lp");
});

test("printRawToLinuxPrinter falls back to lpr when lp missing", async () => {
  const spawn = (cmd) => {
    if (cmd === "lp") {
      const err = new Error("missing");
      err.code = "ENOENT";
      throw err;
    }

    if (cmd === "lpr") {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { write() {}, end() {} };
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }

    throw new Error("unexpected command");
  };

  const result = await printRawToLinuxPrinter("EPSON_TM_T88V", Buffer.from("x"), { spawn });
  assert.deepEqual(result, {
    backend: "cups-local",
    command: "lpr",
    printerName: "EPSON_TM_T88V"
  });
});

test("parsePrinterUri accepts ipp URI and returns host/queue", () => {
  const parsed = parsePrinterUri("ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(parsed.hostPort, "taiga.local:631");
  assert.equal(parsed.queueName, "TM-T88V");
});

test("parsePrinterUri rejects http URI with helpful message", () => {
  assert.throws(
    () => parsePrinterUri("http://taiga.local:631/printers/TM-T88V"),
    /Use ipp:\/\/ or ipps:\/\//
  );
});

test("printRawToPrinterUri uses lp -h host:port -d queue -o raw", async () => {
  let seen = null;
  const spawn = (cmd, args) => {
    seen = { cmd, args };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { write() {}, end() {} };
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };

  const result = await printRawToPrinterUri(
    "ipp://taiga.local:631/printers/TM-T88V",
    Buffer.from([0x1b, 0x40]),
    { spawn }
  );

  assert.deepEqual(seen, {
    cmd: "lp",
    args: ["-h", "taiga.local:631", "-d", "TM-T88V", "-o", "raw"]
  });
  assert.equal(result.command, "lp");
});
