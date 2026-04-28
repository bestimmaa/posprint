"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPrintBridge } = require("../src/print-bridge");

test("bridge dispatches listPrinters to linux backend", async () => {
  const bridge = createPrintBridge({
    platform: () => "linux",
    windows: { listPrinters: async () => ["win"] },
    linux: { listPrintersLinux: async () => ["lin"] }
  });

  assert.deepEqual(await bridge.listPrinters(), ["lin"]);
});

test("bridge dispatches printRaw to windows backend", async () => {
  const bridge = createPrintBridge({
    platform: () => "win32",
    windows: { printRawToWindowsPrinter: async () => ({ backend: "win" }) },
    linux: { printRawToLinuxPrinter: async () => ({ backend: "lin" }) }
  });

  assert.deepEqual(await bridge.printRaw("P", Buffer.from("x")), { backend: "win" });
});

test("bridge throws on unsupported platform", async () => {
  const bridge = createPrintBridge({
    platform: () => "darwin",
    windows: {},
    linux: {}
  });

  await assert.rejects(() => bridge.listPrinters(), /Unsupported platform/);
});
