# Module API Guide

Package entry point: `require("@bestimmaa/posprint")`

Exports:

- `markdownToEscpos`
- `listPrinters`
- `printRaw`
- `printRawToPrinterUri`
- `printRawToWindowsPrinter`
- `selectPrinterName`

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

## ESM Interop

`posprint` publishes CommonJS. In ESM, import the default export and destructure:

```js
import posprint from "@bestimmaa/posprint";

const { markdownToEscpos } = posprint;
const escpos = markdownToEscpos("# ESM Interop\n\n- Latte", { charsPerLine: 42 });

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```
