"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_TCP_PORT,
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
    UNSUPPORTED_PATH: "UNSUPPORTED_PATH",
    INVALID_PORT: "INVALID_PORT"
  });
});

test("normalizePrinterUri accepts tcp URI with explicit port", () => {
  assert.deepEqual(normalizePrinterUri("tcp://192.168.1.50:9100"), {
    normalizedUri: "tcp://192.168.1.50:9100",
    wasUpgraded: false
  });
});

test("normalizePrinterUri defaults tcp port to 9100", () => {
  assert.equal(DEFAULT_TCP_PORT, 9100);
  assert.equal(normalizePrinterUri("tcp://printer.local").normalizedUri, "tcp://printer.local:9100");
  assert.equal(normalizePrinterUri("tcp://printer.local/").normalizedUri, "tcp://printer.local:9100");
});

test("parseTcpPrinterUri returns host and port", () => {
  assert.deepEqual(parseTcpPrinterUri("tcp://192.168.1.50:9101"), {
    host: "192.168.1.50",
    port: 9101,
    normalizedUri: "tcp://192.168.1.50:9101"
  });
  assert.deepEqual(parseTcpPrinterUri("TCP://printer.local"), {
    host: "printer.local",
    port: 9100,
    normalizedUri: "tcp://printer.local:9100"
  });
});

test("parseTcpPrinterUri unwraps IPv6 hosts", () => {
  assert.deepEqual(parseTcpPrinterUri("tcp://[::1]:9100"), {
    host: "::1",
    port: 9100,
    normalizedUri: "tcp://[::1]:9100"
  });
});

test("parseTcpPrinterUri rejects non-tcp URIs", () => {
  assert.throws(() => parseTcpPrinterUri("ipp://taiga.local:631/printers/TM-T88V"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.UNSUPPORTED_SCHEME);
    return true;
  });
});

test("normalizePrinterUri rejects invalid tcp ports", () => {
  for (const uri of ["tcp://printer.local:99999", "tcp://printer.local:abc", "tcp://printer.local:0", "tcp://[::1]:70000"]) {
    assert.throws(() => normalizePrinterUri(uri), (error) => {
      assert.equal(error.code, PRINTER_URI_ERROR_CODES.INVALID_PORT, uri);
      assert.match(error.message, /Invalid tcp:\/\/ printer URI port/);
      return true;
    });
  }
});

test("normalizePrinterUri rejects tcp URI with path, query, or credentials", () => {
  for (const uri of ["tcp://printer.local:9100/queue", "tcp://printer.local?x=1", "tcp://user@printer.local"]) {
    assert.throws(() => normalizePrinterUri(uri), (error) => {
      assert.equal(error.code, PRINTER_URI_ERROR_CODES.UNSUPPORTED_PATH, uri);
      assert.match(error.message, /tcp:\/\/host\[:port\]/);
      return true;
    });
  }
});

test("normalizePrinterUri rejects tcp URI without host", () => {
  assert.throws(() => normalizePrinterUri("tcp://"), (error) => {
    assert.equal(error.code, PRINTER_URI_ERROR_CODES.INVALID_URI);
    return true;
  });
});

test("parsePrinterUri rejects tcp URIs (IPP only)", () => {
  assert.throws(() => parsePrinterUri("tcp://printer.local"), /IPP printing/);
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
