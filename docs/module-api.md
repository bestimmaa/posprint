# Module API Guide

Package entry point: `require("@bestimmaa/posprint")`

Exports:

- `markdownToEscpos`
- `getPrinterStatus`
- `listPrinters`
- `printRaw`
- `printRawToPrinterUri`
- `printRawToWindowsPrinter`
- `selectPrinterName`

## Text Conversion Behavior

Supported code pages are `cp437`, `cp850`, `cp858`, and `cp1252`.

Text conversion only normalizes these exceptions before encoding:

- smart quotes to ASCII quotes
- Unicode dashes to `-`
- non-breaking spaces to regular spaces

Other unsupported characters become `?`.

- The CLI warns when fallback replacement occurs.
- Module conversion stays silent by default.

## CommonJS Local Queue

Convert markdown to ESC/POS bytes and print to a selected local queue:

```js
const { markdownToEscpos, listPrinters, selectPrinterName, printRaw } = require("@bestimmaa/posprint");

async function printReceipt() {
  const markdown = "# Cafe Receipt\n\n- Americano\n- Croissant";
  const escpos = markdownToEscpos(markdown, { charsPerLine: 42 });
  const printers = await listPrinters();
  const printerName = selectPrinterName({
    requested: null,
    envPrinter: process.env.ESC_POS_PRINTER,
    printers
  });

  await printRaw(printerName, Buffer.from(escpos));
}

printReceipt().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

## CommonJS Printer URI

`printRawToPrinterUri(printerUri, data)` accepts:

- `ipp://host:port/printers/queue` or `ipps://...`, submitted as an IPP `Print-Job` with raw document format
- `tcp://host[:port]`, where the bytes are written straight to the printer socket (JetDirect/AppSocket). The port defaults to `9100`. A path, query, or credentials are rejected. The call resolves after the payload is flushed and the connection closes. It rejects with `TCP connection failed for host:port: ...` on connection errors, or `TCP print timed out after 10000ms for host:port` when the connection or write makes no progress for 10 seconds.

Both schemes work on Windows, Linux, and macOS. Invalid URIs throw an `Error` whose `code` is `INVALID_URI`, `UNSUPPORTED_SCHEME`, `UNSUPPORTED_PATH`, or `INVALID_PORT`.

Print directly to an IPP/IPPS URI:

```js
const { markdownToEscpos, printRawToPrinterUri } = require("@bestimmaa/posprint");

async function printToUri() {
  const markdown = "# Hello\n\n- Espresso";
  const escpos = markdownToEscpos(markdown, { charsPerLine: 42 });

  await printRawToPrinterUri("ipp://taiga.local:631/printers/TM-T88V", Buffer.from(escpos));
}

printToUri().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

Print to a network printer over raw TCP:

```js
const { markdownToEscpos, printRawToPrinterUri } = require("@bestimmaa/posprint");

async function printToNetworkPrinter() {
  const escpos = markdownToEscpos("# Hello\n\n- Espresso", { charsPerLine: 42 });

  // Same as tcp://192.168.1.50:9100
  await printRawToPrinterUri("tcp://192.168.1.50", Buffer.from(escpos));
}

printToNetworkPrinter().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

## CommonJS Printer Status

`getPrinterStatus(printerUri, { timeoutMs })` queries a network ESC/POS printer over a `tcp://host[:port]` URI. It sends the real-time status queries `DLE EOT 1`–`4` (`0x10 0x04 n`) on one connection, reads the four response bytes, and closes the connection. `timeoutMs` defaults to `5000`.

It resolves with:

```js
{
  printerUri: "tcp://192.168.1.50:9100",
  host: "192.168.1.50",
  port: 9100,
  ok: true,                  // online && !paperEnd && !coverOpen && no errors
  online: true,
  coverOpen: false,
  paperEnd: false,
  paperNearEnd: false,       // warning only, does not affect ok
  paperFeedButton: false,
  paperFeeding: false,
  waitingForOnlineRecovery: false,
  errorOccurred: false,
  errors: { autocutter: false, unrecoverable: false, autoRecoverable: false },
  raw: [0x12, 0x12, 0x12, 0x12]  // DLE EOT 1..4 response bytes
}
```

It rejects with an `Error` whose `code` is:

- `STATUS_UNSUPPORTED_TARGET` for anything but `tcp://` URIs (`Printer status is only supported for tcp:// printer URIs.`). IPP, CUPS queues, and the Windows spooler don't give bidirectional raw access.
- `STATUS_TIMEOUT` when the printer doesn't answer in time (`Printer did not answer status query within 5000ms for host:port ...`).
- `STATUS_CONNECTION_FAILED` or `STATUS_CONNECTION_CLOSED` when the connection fails or closes early.
- `STATUS_INVALID_RESPONSE` when a response byte doesn't match the fixed DLE EOT bit pattern (bit0 = 0, bit1 = 1, bit4 = 1, bit7 = 0).

Malformed `tcp://` URIs throw the same `INVALID_PORT` / `UNSUPPORTED_PATH` errors as `printRawToPrinterUri`.

```js
const { markdownToEscpos, getPrinterStatus, printRawToPrinterUri } = require("@bestimmaa/posprint");

async function printIfReady() {
  const printerUri = "tcp://192.168.1.50";
  const status = await getPrinterStatus(printerUri, { timeoutMs: 3000 });

  if (!status.ok) {
    throw new Error(`Printer not ready: ${JSON.stringify(status)}`);
  }

  if (status.paperNearEnd) {
    console.warn("Paper is running low.");
  }

  await printRawToPrinterUri(printerUri, Buffer.from(markdownToEscpos("# Ready\n\n- Espresso")));
}

printIfReady().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

## CommonJS Conversion Only

Convert markdown to ESC/POS bytes without submitting a print job:

```js
const { markdownToEscpos } = require("@bestimmaa/posprint");

const escpos = markdownToEscpos("# Dry Run\n\n- Tea\n- Muffin", {
  charsPerLine: 42,
  codePage: "cp858",
  font: "B",
  lineSpacingMm: 3,
  leftMarginMm: 2,
  printAreaWidthMm: 42
});

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```

## ESM Interop

`posprint` publishes CommonJS. In ESM, import the default export and destructure:

```js
import posprint from "@bestimmaa/posprint";

const { markdownToEscpos } = posprint;
const escpos = markdownToEscpos("# ESM Interop\n\n- Latte", { charsPerLine: 42 });

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```
