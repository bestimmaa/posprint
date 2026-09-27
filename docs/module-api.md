# Module API Guide

Package entry point: `require("@bestimmaa/posprint")`

Exports:

- `markdownToEscpos`
- `previewEscpos`
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

## Markdown Shortcodes

`markdownToEscpos` understands these shortcodes inside paragraphs:

- `{{qr:<payload>|size=<1-16>|ec=<L|M|Q|H>}}` prints a native QR code.
- `{{row:<left>|<right>|fill=<char>}}` prints a left/right aligned receipt row exactly `charsPerLine` wide (`fill` optional, default space).

```js
const { markdownToEscpos } = require("@bestimmaa/posprint");

const escpos = markdownToEscpos("{{row:Espresso|2.50}}\n{{row:Total|12.00|fill=.}}", { charsPerLine: 42 });
// Espresso                              2.50
// Total................................12.00
```

With `strictMarkdown: true`, invalid QR or row shortcodes throw; otherwise a warning is logged and the shortcode is printed literally. See the README's Receipt rows section for row layout rules.

## Table Rendering

GFM tables print as monospace columns fitted to `charsPerLine`:

- bold header row, then a dash separator
- column alignment follows the separator row (`:---`, `:---:`, `---:`)
- when the table is too wide, the widest columns shrink and cell text wraps inside its column; if the columns cannot fit at all, each row prints as wrapped `a | b | c` text
- inline formatting inside cells prints as plain text

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

`printRawToPrinterUri(printerUri, data)` accepts `ipp://host:port/printers/queue` / `ipps://...` (IPP `Print-Job`) or `tcp://host[:port]` (raw bytes over a socket, port defaults to `9100`). A `tcp://` job resolves once the payload is flushed and the connection closes, and rejects on connection errors or after 10 seconds without progress.

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

  await printRawToPrinterUri("tcp://192.168.1.50:9100", Buffer.from(escpos));
}

printToNetworkPrinter().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

## CommonJS Printer Status

`getPrinterStatus(printerUri, { timeoutMs = 5000 })` queries a network ESC/POS printer over `tcp://host[:port]` with the real-time status commands `DLE EOT 1`–`4` and resolves with:

```js
{
  printerUri: "tcp://192.168.1.50:9100",
  ok: true,              // online, cover closed, paper present, no errors
  online: true,
  coverOpen: false,
  paperEnd: false,
  paperNearEnd: false,   // warning only, does not affect ok
  errors: [],            // e.g. ["autocutter error"]
  raw: [0x12, 0x12, 0x12, 0x12] // DLE EOT 1..4 response bytes
}
```

It rejects when the connection fails, the printer closes the connection or doesn't answer within `timeoutMs`, or a response byte isn't a valid `DLE EOT` answer. Non-`tcp://` or malformed URIs throw the same `UNSUPPORTED_SCHEME` / `INVALID_URI` errors as `printRawToPrinterUri`.

```js
const { markdownToEscpos, getPrinterStatus, printRawToPrinterUri } = require("@bestimmaa/posprint");

async function printIfReady(printerUri) {
  const status = await getPrinterStatus(printerUri);

  if (!status.ok) {
    throw new Error(`Printer not ready: ${JSON.stringify(status)}`);
  }

  await printRawToPrinterUri(printerUri, Buffer.from(markdownToEscpos("# Ready")));
}
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

## Text Preview

`previewEscpos(bytes, options)` interprets an ESC/POS payload and returns a plain-text approximation of the printed receipt, framed by a border as wide as the paper. It decodes the actual bytes rather than re-rendering markdown, so it previews exactly what would be sent.

Options:

- `charsPerLine` line width in characters, default `42`
- `ansi` render bold, italic, and underline with ANSI escape codes, default `false`

Rendering rules:

- text is decoded with the active code page (`ESC t`)
- alignment (`ESC a`), left margin (`GS L`), and print area width (`GS W`) are applied by padding
- double-width text (`GS !`) is spaced out, one extra column per character
- raster images become `[image <width>x<height>]`, QR codes `[QR: <payload>]`, drawer pulses `[drawer]`
- cuts become a dashed `✂ cut` line
- only commands posprint itself emits are interpreted; other ESC/GS commands are skipped

```js
const { markdownToEscpos, previewEscpos } = require("@bestimmaa/posprint");

const escpos = markdownToEscpos("# Cafe\n\n- Latte 3,50 €", { charsPerLine: 42 });
console.log(previewEscpos(escpos, { charsPerLine: 42 }));
```

## ESM Interop

`posprint` publishes CommonJS. In ESM, import the default export and destructure:

```js
import posprint from "@bestimmaa/posprint";

const { markdownToEscpos } = posprint;
const escpos = markdownToEscpos("# ESM Interop\n\n- Latte", { charsPerLine: 42 });

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```
