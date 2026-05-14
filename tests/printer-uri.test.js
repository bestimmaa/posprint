"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePrinterUri, parsePrinterUri, PRINTER_URI_ERROR_CODES } = require("../src/printer-uri");

test("printer-uri exports stable error code constants", () => {
  assert.deepEqual(PRINTER_URI_ERROR_CODES, {
    INVALID_URI: "INVALID_URI",
    UNSUPPORTED_SCHEME: "UNSUPPORTED_SCHEME",
    UNSUPPORTED_PATH: "UNSUPPORTED_PATH"
  });
});

test("normalizePrinterUri accepts ipp URI", () => {
  const normalized = normalizePrinterUri("ipp://taiga.local:631/printers/TM-T88V");
  assert.deepEqual(normalized, {
    normalizedUri: "ipp://taiga.local:631/printers/TM-T88V",
    wasUpgraded: false
  });
});

test("normalizePrinterUri accepts ipps URI", () => {
  const normalized = normalizePrinterUri("ipps://taiga.local/printers/TM-T88V");
  assert.deepEqual(normalized, {
    normalizedUri: "ipps://taiga.local/printers/TM-T88V",
    wasUpgraded: false
  });
});

test("normalizePrinterUri upgrades http URI when enabled", () => {
  const normalized = normalizePrinterUri("http://taiga.local:631/printers/TM-T88V", { allowHttpUpgrade: true });
  assert.deepEqual(normalized, {
    normalizedUri: "ipp://taiga.local:631/printers/TM-T88V",
    wasUpgraded: true
  });
});

test("normalizePrinterUri upgrades https URI when enabled", () => {
  const normalized = normalizePrinterUri("https://taiga.local/printers/TM-T88V", { allowHttpUpgrade: true });
  assert.deepEqual(normalized, {
    normalizedUri: "ipps://taiga.local/printers/TM-T88V",
    wasUpgraded: true
  });
});

test("normalizePrinterUri rejects http URI when upgrade disabled", () => {
  assert.throws(
    () => normalizePrinterUri("http://taiga.local:631/printers/TM-T88V"),
    /Unsupported printer URI scheme/i
  );
});

test("normalizePrinterUri rejects unsupported URI scheme", () => {
  assert.throws(() => normalizePrinterUri("socket://10.0.0.10:9100"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME);
    assert.match(error.message, /Unsupported printer URI scheme/i);
    return true;
  });
});

test("normalizePrinterUri rejects malformed URI", () => {
  assert.throws(() => normalizePrinterUri("not a uri"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.INVALID_URI);
    assert.match(error.message, /Invalid printer URI/i);
    return true;
  });
});

test("parsePrinterUri reads printerName from final path segment", () => {
  const parsed = parsePrinterUri("ipp://taiga.local:631/printers/TM-T88V%20Front");
  assert.equal(parsed.printerName, "TM-T88V Front");
  assert.equal(parsed.normalizedUri, "ipp://taiga.local:631/printers/TM-T88V%20Front");
});

test("parsePrinterUri requires at least two path segments", () => {
  assert.throws(() => parsePrinterUri("ipp://taiga.local:631/printers"), /Unsupported printer URI path/i);
});

test("parsePrinterUri supports HTTP upgrade option", () => {
  const parsed = parsePrinterUri("http://taiga.local:631/printers/TM-T88V", { allowHttpUpgrade: true });
  assert.equal(parsed.printerName, "TM-T88V");
  assert.equal(parsed.normalizedUri, "ipp://taiga.local:631/printers/TM-T88V");
});

test("parsePrinterUri rejects malformed percent-encoded queue name", () => {
  assert.throws(
    () => parsePrinterUri("ipp://taiga.local:631/printers/TM-T88V%ZZ"),
    /Invalid printer URI/i
  );
});
