# posprint

`posprint` is a Node.js module + CLI for markdown-to-ESC/POS receipt printing to Epson TM-T88V, supporting Windows RAW spooler and Linux/macOS CUPS raw printing, with practical workflows for conversion-only and real print jobs.

## Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Module Usage](#module-usage)
- [Markdown Images](#markdown-images)
- [Native QR Codes](#native-qr-codes)
- [Layout Controls (Safe Subset)](#layout-controls-safe-subset)
- [Code Pages and Text Encoding](#code-pages-and-text-encoding)
- [Examples](#examples)
- [Development](#development)
- [Bitbucket Pipeline Artifact Build](#bitbucket-pipeline-artifact-build)
- [Windows Requirements](#windows-requirements)
- [Linux/macOS Requirements](#linuxmacos-requirements)
- [License](#license)

## Install

Install globally:

```bash
npm i -g posprint
```

For local development in this repository:

```bash
npm install
```

## Quick Start

Show CLI help:

```bash
posprint --help
```

Dry run from inline markdown (build payload only; no printer discovery and no print job):

```bash
posprint --dry-run --markdown="# Hello\n\n- Espresso\n- Croissant"
```

Send a real print job to a specific printer queue (Windows, Linux, or macOS):

```bash
posprint --markdown="# Hello\n\n- Espresso\n- Croissant" --printer="EPSON TM-T88V Receipt (USB)"
```

## Module Usage

### CommonJS

Print flow (convert markdown, discover/select printer, submit RAW job):

```js
const { markdownToEscpos, listPrinters, selectPrinterName, printRaw } = require("posprint");

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

Direct CUPS URI printing (linux/macOS):

```js
const { markdownToEscpos, printRawToPrinterUri } = require("posprint");

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

Conversion only (build ESC/POS bytes without sending a print job):

```js
const { markdownToEscpos } = require("posprint");

const markdown = "# Dry Run\n\n- Tea\n- Muffin";
const escpos = markdownToEscpos(markdown, {
  charsPerLine: 42,
  codePage: "cp858",
  font: "B",
  lineSpacingMm: 3,
  leftMarginMm: 2,
  printAreaWidthMm: 42
});

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```

### ESM interop

Use default import and destructure named exports from the CommonJS module:

```js
import posprint from "posprint";

const { markdownToEscpos } = posprint;
const escpos = markdownToEscpos("# ESM Interop\n\n- Latte", { charsPerLine: 42 });

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```

## CLI Usage

```text
posprint [options]
```

Flags:

- `--markdown-file=<path>`: Read receipt content from a markdown file.
- `--markdown="..."`: Pass markdown inline as a single argument.
- `--printer="Printer Name"`: Target an exact local printer queue.
- `--printer-uri="ipp://host:631/printers/queue"`: Print directly to a CUPS URI (takes precedence over `--printer`). `http://.../printers/...` and `https://.../printers/...` inputs are auto-converted to `ipp://`/`ipps://` with a warning.
- `--chars-per-line=<n>`: Set receipt wrapping width (default: `42`).
- `--code-page=<name>`: ESC/POS code page name (default: `cp858`).
- `--list-code-pages`: Print supported code pages as a table (`name` + ESC/POS id) and as canonical names for scripting.
- `--font=A|B|C`: Select ESC/POS font for the full receipt.
- `--character-spacing-mm=<n>`: Character spacing in millimeters (`>= 0`).
- `--line-spacing-mm=<n>`: Line spacing in millimeters (`> 0`).
- `--left-margin-mm=<n>`: Left margin in millimeters (`>= 0`).
- `--print-area-width-mm=<n>`: Print area width in millimeters (`> 0`).
- `--strict-markdown`: Fail on unsupported markdown/HTML constructs.
- `--dry-run`: Build and inspect output without sending a print job.
- `--help`: Show CLI usage.
- `--version`: Show package version.

## Markdown Images

`posprint` supports standard markdown image syntax:

```md
![Logo](relative/or/absolute/path.png)
```

- Supported formats: `.png`, `.jpg`, `.jpeg`
- Relative paths are resolved from the current working directory.
- Images are converted automatically to monochrome ESC/POS raster output.
- Images wider than paper are scaled down to fit.
- Images smaller than paper keep natural size and are centered.
- Missing/invalid/unsupported images fail the command with an error.

## Native QR Codes

`posprint` supports native ESC/POS QR codes via inline shortcode syntax:

```md
{{qr:https://example.com|size=6|ec=M}}
```

Example inside receipt markdown (text payload):

```md
## Loyalty
Scan to join rewards:
{{qr:NORTHWIND-LOYALTY-2026|size=6|ec=M}}
```

Options:

- `size` (`1`-`16`, default `6`)
- `ec` (`L`, `M`, `Q`, `H`, default `M`)

Validation behavior:

- `--strict-markdown`: invalid QR shortcodes fail the command.
- Default best-effort mode: invalid QR shortcodes print a warning and are rendered literally.

## Layout Controls (Safe Subset)

Global layout options are supported for each generated receipt (module + CLI):

- `font` / `--font=A|B|C`
- `characterSpacingMm` / `--character-spacing-mm=<n>`
- `lineSpacingMm` / `--line-spacing-mm=<n>`
- `leftMarginMm` / `--left-margin-mm=<n>`
- `printAreaWidthMm` / `--print-area-width-mm=<n>`

Values are in millimeters and converted internally to ESC/POS units for TM-T88V workflows.

Currently unsupported: tab stops, absolute positioning, and relative positioning.

## Code Pages and Text Encoding

`posprint` transcodes Unicode markdown text into the selected ESC/POS code page bytes before sending print payloads.
This is required for receipt printers because selecting a code page command (`ESC t n`) does not make UTF-8 payload bytes print correctly on its own.

Default code page:

- `cp858` (ESC/POS `ESC t 19`)

CLI:

- `--code-page=cp858`

Module:

- `markdownToEscpos(markdown, { codePage: "cp858" })`

Fallback behavior for unencodable characters:

1. Try direct encode in active code page.
2. If not encodable, apply ASCII-safe normalization fallback.
3. If still not encodable, emit `?`.

Show supported code pages from CLI:

```bash
posprint --list-code-pages
```

### Supported code pages

| Name   | CLI value | ESC/POS ID (`ESC t n`) | Notes |
|--------|-----------|------------------------|-------|
| CP437  | `cp437`   | `0`                    | Legacy US DOS table |
| CP850  | `cp850`   | `2`                    | Western Europe DOS table |
| CP858  | `cp858`   | `19`                   | Default; CP850 variant with `€` |
| CP1252 | `cp1252`  | `16`                   | Windows Western punctuation/quotes |

Printer selection order:

1. `--printer`
2. `ESC_POS_PRINTER`
3. First printer matching `epson|tm-t88v|receipt`
4. First detected printer

## Examples

Dry run with inline markdown:

```bash
posprint --dry-run --markdown="# Hello\n\n- Espresso\n- Croissant" --chars-per-line=42
```

Dry run with global layout controls:

```bash
posprint --dry-run --markdown-file="tests/fixtures/markdown-showcase.md" \
  --font=B --character-spacing-mm=1 --line-spacing-mm=3 --left-margin-mm=2 --print-area-width-mm=42
```

PowerShell multiline markdown:

```powershell
posprint --dry-run --markdown "# Shift Open`n`n- Till: 3`n- Cashier: Sam"
```

Print from file to the USB receipt queue:

```bash
posprint --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt (USB)"
```

Print directly to a remote CUPS queue via URI:

```bash
posprint --markdown-file="tests/fixtures/markdown-showcase.md" \
  --printer-uri="ipp://taiga.local:631/printers/TM-T88V"
```

Note: `http://...` URLs are CUPS web UI endpoints. For printing, use `ipp://...` or `ipps://...`.

Validate markdown strictly before printing:

```bash
posprint --dry-run --markdown-file="tests/fixtures/unsupported-html.md" --strict-markdown
```

Use environment override for printer selection:

```powershell
$env:ESC_POS_PRINTER="EPSON TM-T88V Receipt (USB)"
posprint --markdown-file="tests/fixtures/markdown-showcase.md"
```

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Project scripts for ESC/POS and spooler verification:

- `npm run print:test:dry` runs `src/print-cli.js` with `tests/fixtures/markdown-showcase.md` and `--dry-run`.
- `npm run print:test` runs `src/print-cli.js` with `tests/fixtures/markdown-showcase.md` to submit a RAW print job.

## Bitbucket Pipeline Artifact Build

- Pipeline runs on all branch pushes.
- Test step runs `npm test`.
- Pack step runs `npm pack`.
- Artifact tarball name format: `<packageName>-<version>-<sanitizedBranch>-<shortSha>.tgz`.
- Download generated tarballs from Bitbucket Artifacts for each pipeline run.

## Windows Requirements

- Windows machine with Node.js 20+.
- Epson TM-T88V installed as a Windows printer.
- Printer queue available to the current user session.
- RAW printing enabled through the Windows spooler path.

## Linux/macOS Requirements

- Linux or macOS machine with Node.js 20+.
- CUPS client tooling installed (`lpstat`, `lp`, and/or `lpr`).
- Local queue printing uses discovered queues from the current user session.
- URI printing uses CUPS `lp` with raw mode (for example: `lp -h host:port -d queue -o raw`).
- ESC/POS is sent in raw mode.

## License

MIT
