# posprint

`posprint` is a Node.js module and CLI for turning markdown into ESC/POS receipt output for Epson TM-T88V style printers. It supports Windows RAW spooler printing and Linux/macOS CUPS workflows, with dry-run output for payload inspection before sending a real print job.

GitHub: `https://github.com/bestimmaa/posprint`

## Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Module Usage](#module-usage)
- [Inline Markdown Styling](#inline-markdown-styling)
- [Markdown Images](#markdown-images)
- [Native QR Codes](#native-qr-codes)
- [Layout Controls (Safe Subset)](#layout-controls-safe-subset)
- [Code Pages and Text Encoding](#code-pages-and-text-encoding)
- [Examples](#examples)
- [Development](#development)
- [Windows Requirements](#windows-requirements)
- [Linux/macOS Requirements](#linuxmacos-requirements)
- [License](#license)

## Install

Install as a project dependency:

```bash
npm install posprint
```

Install the CLI globally:

```bash
npm i -g posprint
```

Browse source, issues, and releases on GitHub:

- `https://github.com/bestimmaa/posprint`
- `https://github.com/bestimmaa/posprint/issues`

## Quick Start

Show CLI help:

```bash
posprint --help
```

Dry run from inline markdown without contacting a printer:

```bash
posprint --dry-run --markdown="# Hello\n\n- Espresso\n- Croissant"
```

Print directly to a local printer queue:

```bash
posprint --markdown="# Hello\n\n- Espresso\n- Croissant" --printer="EPSON TM-T88V Receipt (USB)"
```

## CLI Usage

```text
posprint [options]
```

Flags:

- `--markdown-file=<path>`: Read receipt content from a markdown file.
- `--markdown="..."`: Pass markdown inline as a single argument.
- `--printer="Printer Name"`: Target an exact local printer queue.
- `--printer-uri="ipp://host:631/printers/queue"`: Print directly to an IPP/IPPS printer URI on Windows, Linux, or macOS. This takes precedence over `--printer`. `http://.../printers/...` and `https://.../printers/...` inputs are auto-converted to `ipp://` or `ipps://` with a warning.
- `--chars-per-line=<n>`: Set receipt wrapping width. Default: `42`.
- `--code-page=<name>`: ESC/POS code page name. Default: `cp858`.
- `--list-code-pages`: Print supported code pages as a table and as canonical names.
- `--font=A|B|C`: Select ESC/POS font for the full receipt.
- `--character-spacing-mm=<n>`: Character spacing in millimeters (`>= 0`).
- `--line-spacing-mm=<n>`: Line spacing in millimeters (`> 0`).
- `--left-margin-mm=<n>`: Left margin in millimeters (`>= 0`).
- `--print-area-width-mm=<n>`: Print area width in millimeters (`> 0`).
- `--strict-markdown`: Fail on unsupported HTML tokens and invalid QR shortcodes.
- `--dry-run`: Build and inspect output without sending a print job.
- `--help`: Show CLI usage.
- `--version`: Show package version.

## Module Usage

Package entry point: `require("posprint")`

Exports:

- `markdownToEscpos`
- `listPrinters`
- `printRaw`
- `printRawToPrinterUri`
- `printRawToWindowsPrinter`
- `selectPrinterName`

### CommonJS

Convert markdown to ESC/POS bytes and print to a selected local queue:

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

Print directly to an IPP/IPPS URI:

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

Conversion only:

```js
const { markdownToEscpos } = require("posprint");

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

### ESM Interop

`posprint` publishes CommonJS. In ESM, import the default export and destructure:

```js
import posprint from "posprint";

const { markdownToEscpos } = posprint;
const escpos = markdownToEscpos("# ESM Interop\n\n- Latte", { charsPerLine: 42 });

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```

## Inline Markdown Styling

`posprint` supports a practical subset of inline markdown styling:

- `**strong**` -> ESC/POS bold on and off
- `*emphasis*` -> ESC/POS italic on and off
- `~~strikethrough~~` -> readable plain text with markers removed

## Markdown Images

`posprint` supports standard markdown image syntax:

```md
![Logo](relative/or/absolute/path.png)
```

- Supported formats: `.png`, `.jpg`, `.jpeg`
- Relative paths resolve from the current working directory
- Images are converted to monochrome ESC/POS raster output
- Wide images are scaled down to fit paper width
- Smaller images keep natural size and are centered
- Missing, invalid, or unsupported images fail the command

## Native QR Codes

Use inline shortcode syntax:

```md
{{qr:https://example.com|size=6|ec=M}}
```

Example:

```md
## Loyalty
Scan to join rewards:
{{qr:NORTHWIND-LOYALTY-2026|size=6|ec=M}}
```

Options:

- `size`: `1` to `16`, default `6`
- `ec`: `L`, `M`, `Q`, or `H`, default `M`

Validation behavior:

- `--strict-markdown`: invalid QR shortcodes fail the command
- Default mode: invalid QR shortcodes print a warning and are rendered literally

## Layout Controls (Safe Subset)

Global layout options are available in both the module API and the CLI:

- `font` or `--font=A|B|C`
- `characterSpacingMm` or `--character-spacing-mm=<n>`
- `lineSpacingMm` or `--line-spacing-mm=<n>`
- `leftMarginMm` or `--left-margin-mm=<n>`
- `printAreaWidthMm` or `--print-area-width-mm=<n>`

Values are given in millimeters and converted to ESC/POS units for TM-T88V workflows.

Currently unsupported: tab stops, absolute positioning, and relative positioning.

## Code Pages and Text Encoding

`posprint` transcodes Unicode markdown text into the selected ESC/POS code page before printing.

Default code page:

- `cp858` (`ESC t 19`)

CLI example:

- `--code-page=cp858`

Module example:

- `markdownToEscpos(markdown, { codePage: "cp858" })`

Fallback behavior for unencodable characters:

1. Try direct encode in the active code page.
2. Apply ASCII-safe normalization when possible.
3. Emit `?` if the character still cannot be encoded.

Show supported code pages:

```bash
posprint --list-code-pages
```

### Supported Code Pages

| Name   | CLI value | ESC/POS ID (`ESC t n`) | Notes |
|--------|-----------|------------------------|-------|
| CP437  | `cp437`   | `0`                    | Legacy US DOS table |
| CP850  | `cp850`   | `2`                    | Western Europe DOS table |
| CP858  | `cp858`   | `19`                   | Default; CP850 variant with `€` |
| CP1252 | `cp1252`  | `16`                   | Windows Western punctuation and quotes |

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

Dry run from a local markdown file:

```bash
posprint --dry-run --markdown-file="./receipt.md"
```

PowerShell multiline markdown:

```powershell
posprint --dry-run --markdown "# Shift Open`n`n- Till: 3`n- Cashier: Sam"
```

Print from a file to a local queue:

```bash
posprint --markdown-file="./receipt.md" --printer="EPSON TM-T88V Receipt (USB)"
```

Print directly to a remote IPP or IPPS printer URI:

```bash
posprint --markdown-file="./receipt.md" --printer-uri="ipp://taiga.local:631/printers/TM-T88V"
```

Validate markdown strictly before printing:

```bash
posprint --dry-run --markdown-file="./receipt.md" --strict-markdown
```

Use an environment override for printer selection:

```powershell
$env:ESC_POS_PRINTER="EPSON TM-T88V Receipt (USB)"
posprint --markdown-file="./receipt.md"
```

## Development

Install repository dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Repository helper scripts:

- `npm run print:test:dry` runs a repository-maintainer dry run against an in-repo fixture
- `npm run print:test` runs a repository-maintainer print submission against an in-repo fixture

Public release workflow:

```bash
git branch -M main
git remote -v
git remote add github https://github.com/bestimmaa/posprint.git
git remote set-url github https://github.com/bestimmaa/posprint.git
npm run release -- patch
git push origin main:main --follow-tags
git push github main:main --follow-tags
npm publish --access public
```

Before the first public release from an older clone, do a one-time migration/setup pass:

- Rename the local branch with `git branch -M main` if the release branch is still named something else.
- Confirm your remotes with `git remote -v`.
- If `github` does not exist yet, add it with `git remote add github https://github.com/bestimmaa/posprint.git`.
- If `github` already exists but points somewhere else, fix it with `git remote set-url github https://github.com/bestimmaa/posprint.git`.
- After the first `git push github main:main --follow-tags`, update the GitHub repository default branch to `main`.

Before running `npm run release -- patch`, update `CHANGELOG.md` with the next release heading, for example `## [next-version]` such as `## [0.2.3]`. The release helper enforces that exact upcoming version heading before it will create the release commit and tag.

After the one-time setup, the normal release helper requires `main`, verifies a clean worktree, requires that next-version `CHANGELOG.md` entry, runs `npm test`, creates the release commit and tag, runs `npm pack`, then prints the push guidance you should complete before `npm publish --access public`. In this repository, Bitbucket stays on `origin` and the public GitHub remote is expected to be named `github`.

## Windows Requirements

- Node.js 20+
- Epson TM-T88V installed as a Windows printer for local queue printing
- Printer queue available to the current user session
- RAW printing enabled through the Windows spooler path
- For `--printer-uri`, an IPP or IPPS reachable printer endpoint such as `ipp://host:631/printers/queue`

## Linux/macOS Requirements

- Node.js 20+
- CUPS client tooling installed, such as `lpstat`, `lp`, or `lpr`
- Local queue printing available to the current user session
- URI printing through an IPP or IPPS endpoint such as `ipp://host:631/printers/queue`
- ESC/POS data sent in raw mode

## License

MIT
