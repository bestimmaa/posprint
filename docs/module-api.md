# Module API Guide

Package entry point: `require("@bestimmaa/posprint")`

Exports:

- `markdownToEscpos`
- `previewEscpos`
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
- unknown commands are skipped

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
