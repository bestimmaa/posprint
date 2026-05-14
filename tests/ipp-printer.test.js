"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePrinterUri } = require("../src/printer-uri");
const { printRawToPrinterUri } = require("../src/ipp-printer");

test("parsePrinterUri accepts ipp URI with /printers/<queue>", () => {
  const parsed = parsePrinterUri("ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(parsed.printerName, "TM-T88V");
  assert.equal(parsed.normalizedUri, "ipp://taiga.local:631/printers/TM-T88V");
});

test("parsePrinterUri accepts ipps URI with /printers/<queue>", () => {
  const parsed = parsePrinterUri("ipps://taiga.local/printers/TM-T88V");
  assert.equal(parsed.printerName, "TM-T88V");
  assert.equal(parsed.normalizedUri, "ipps://taiga.local/printers/TM-T88V");
});

test("parsePrinterUri rejects unsupported URI scheme", () => {
  assert.throws(() => parsePrinterUri("socket://10.0.0.10:9100"), /Unsupported printer URI scheme/i);
});

test("parsePrinterUri accepts two-segment non-printers path", () => {
  const parsed = parsePrinterUri("ipp://taiga.local:631/ipp/printer-01");
  assert.equal(parsed.printerName, "printer-01");
  assert.equal(parsed.normalizedUri, "ipp://taiga.local:631/ipp/printer-01");
});

test("parsePrinterUri rejects empty URI path", () => {
  assert.throws(() => parsePrinterUri("ipp://taiga.local:631"), /Unsupported printer URI path/i);
});

test("parsePrinterUri rejects single-segment URI path", () => {
  assert.throws(() => parsePrinterUri("ipp://taiga.local:631/printers"), /Unsupported printer URI path/i);
});

test("printRawToPrinterUri requires Buffer payload", async () => {
  await assert.rejects(
    () => printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", "bad"),
    /data must be a Buffer/i
  );
});

test("printRawToPrinterUri sends Print-Job with expected attributes", async () => {
  let call;

  const fakeIpp = {
    Printer(uri) {
      return {
        execute(operation, message, callback) {
          call = { uri, operation, message };
          callback(null, { "status-code": "successful-ok" });
        }
      };
    }
  };

  const payload = Buffer.from([0x1b, 0x40]);
  const result = await printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", payload, {
    ippClient: fakeIpp
  });

  assert.equal(call.operation, "Print-Job");
  assert.equal(call.uri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(call.message.data, payload);
  assert.equal(call.message["operation-attributes-tag"]["document-format"], "application/octet-stream");
  assert.equal(result.backend, "ipp");
  assert.equal(result.command, "ipp");
  assert.equal(result.printerUri, "ipp://taiga.local:631/printers/TM-T88V");
  assert.equal(result.printerName, "TM-T88V");
});

test("printRawToPrinterUri maps IPP status failures", async () => {
  const fakeIpp = {
    Printer() {
      return {
        execute(_operation, _message, callback) {
          callback(null, { "status-code": "client-error-not-found" });
        }
      };
    }
  };

  await assert.rejects(
    () => printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), { ippClient: fakeIpp }),
    /IPP print failed/i
  );
});

test("printRawToPrinterUri maps transport errors", async () => {
  const fakeIpp = {
    Printer() {
      return {
        execute(_operation, _message, callback) {
          callback(new Error("connect ECONNREFUSED"));
        }
      };
    }
  };

  await assert.rejects(
    () => printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), { ippClient: fakeIpp }),
    /IPP connection failed/i
  );
});

test("printRawToPrinterUri accepts statusCode response shape", async () => {
  const fakeIpp = {
    Printer() {
      return {
        execute(_operation, _message, callback) {
          callback(null, { statusCode: "successful-ok" });
        }
      };
    }
  };

  const result = await printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), {
    ippClient: fakeIpp
  });

  assert.equal(result.backend, "ipp");
  assert.equal(result.command, "ipp");
});

test("printRawToPrinterUri times out hung requests", async () => {
  const fakeIpp = {
    Printer() {
      return {
        execute() {
          // intentionally never calls callback
        }
      };
    }
  };

  await assert.rejects(
    () => printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), { ippClient: fakeIpp, timeoutMs: 10 }),
    /timed out/i
  );
});

test("printRawToPrinterUri maps synchronous execute errors", async () => {
  const fakeIpp = {
    Printer() {
      return {
        execute() {
          throw new Error("sync failure");
        }
      };
    }
  };

  await assert.rejects(
    () => printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from("x"), { ippClient: fakeIpp }),
    /IPP connection failed/i
  );
});
