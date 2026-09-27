"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getPrinterUriScheme,
  normalizePrinterUri,
  parsePrinterUri,
  parseTcpPrinterUri,
  PRINTER_URI_ERROR_CODES
} = require("../src/printer-uri");

test("printer-uri exports stable error code constants", () => {
  assert.deepEqual(PRINTER_URI_ERROR_CODES, {
    INVALID_URI: "INVALID_URI",
    UNSUPPORTED_SCHEME: "UNSUPPORTED_SCHEME",
    UNSUPPORTED_PATH: "UNSUPPORTED_PATH"
  });
});

test("normalizePrinterUri accepts tcp URIs and defaults the port to 9100", () => {
  assert.deepEqual(normalizePrinterUri("tcp://192.168.1.50:9101"), {
    normalizedUri: "tcp://192.168.1.50:9101",
    wasUpgraded: false
  });
  assert.equal(normalizePrinterUri("TCP://printer.local/").normalizedUri, "tcp://printer.local:9100");
});

test("parseTcpPrinterUri returns host and port, unwrapping IPv6 hosts", () => {
  assert.deepEqual(parseTcpPrinterUri("tcp://printer.local"), {
    host: "printer.local",
    port: 9100,
    normalizedUri: "tcp://printer.local:9100"
  });
  assert.deepEqual(parseTcpPrinterUri("tcp://[::1]:9101"), {
    host: "::1",
    port: 9101,
    normalizedUri: "tcp://[::1]:9101"
  });
});

test("parseTcpPrinterUri rejects malformed tcp URIs", () => {
  const invalid = [
    "tcp://",
    "tcp://printer.local:0",
    "tcp://printer.local:99999",
    "tcp://printer.local:abc",
    "tcp://printer.local:9100/queue",
    "tcp://printer.local?x=1",
    "tcp://user@printer.local"
  ];

  for (const uri of invalid) {
    assert.throws(() => normalizePrinterUri(uri), (error) => {
      assert.equal(error.code, PRINTER_URI_ERROR_CODES.INVALID_URI, uri);
      return true;
    });
    assert.throws(() => parseTcpPrinterUri(uri), /Invalid tcp:\/\/ printer URI\. Use tcp:\/\/host\[:port\]/, uri);
  }
});

test("tcp and ipp parsers reject each other's schemes", () => {
  assert.throws(() => parseTcpPrinterUri("ipp://taiga.local:631/printers/TM-T88V"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME);
    return true;
  });
  assert.throws(() => parsePrinterUri("tcp://printer.local"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME);
    return true;
  });
});

test("getPrinterUriScheme returns lowercase scheme or null", () => {
  assert.equal(getPrinterUriScheme("TCP://printer.local"), "tcp");
  assert.equal(getPrinterUriScheme("ipp://taiga.local/printers/q"), "ipp");
  assert.equal(getPrinterUriScheme("not a uri"), null);
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
