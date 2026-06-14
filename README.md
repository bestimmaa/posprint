# posprint

[![CI](https://github.com/bestimmaa/posprint/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bestimmaa/posprint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@bestimmaa/posprint)](https://www.npmjs.com/package/@bestimmaa/posprint)

`posprint` turns markdown into ESC/POS receipt output for Epson TM-T88V style printers.

- npm: [`@bestimmaa/posprint`](https://www.npmjs.com/package/@bestimmaa/posprint)
- GitHub: [bestimmaa/posprint](https://github.com/bestimmaa/posprint)
- Platforms: Windows RAW spooler, Linux CUPS, macOS CUPS

## What it does

`posprint` ships as both a CLI and a Node.js module for markdown-to-ESC/POS workflows.

- Build receipt payloads from markdown
- Dry-run output before sending a real print job
- Print to a local printer queue or direct IPP/IPPS printer URI
- Support practical receipt features like inline emphasis, images, QR codes, layout controls, and code pages

## Install

Install as a project dependency:

```bash
npm install @bestimmaa/posprint
```

Install the CLI globally:

```bash
npm i -g @bestimmaa/posprint
```

## Quick Start

Show CLI help:

```bash
posprint --help
```

Dry run inline markdown without contacting a printer:

```bash
posprint --dry-run --markdown="# Hello\n\n- Espresso\n- Croissant"
```

Print to a local queue:

```bash
posprint --markdown="# Hello\n\n- Espresso\n- Croissant" --printer="EPSON TM-T88V Receipt (USB)"
```

Print to a printer URI:

```bash
posprint --markdown-file="./receipt.md" --printer-uri="ipp://taiga.local:631/printers/TM-T88V"
```

## CLI

```text
posprint [options]
```

Common options:

- `--markdown-file=<path>` read receipt content from a markdown file
- `--markdown="..."` pass markdown inline as a single argument
- `--printer="Printer Name"` target an exact local printer queue
- `--printer-uri="ipp://host:631/printers/queue"` print directly to an IPP/IPPS printer URI. This takes precedence over `--printer`.
- `--dry-run` build and inspect output without sending a print job
- `--strict-markdown` reject unsupported constructs and invalid QR shortcodes
- `--chars-per-line=<n>` set receipt width, default `42`
- `--code-page=<name>` set ESC/POS code page, default `cp858`
- `--font=A|B|C` select the ESC/POS font
- `--character-spacing-mm=<n>` set character spacing in millimeters
- `--line-spacing-mm=<n>` set line spacing in millimeters
- `--left-margin-mm=<n>` set left margin in millimeters
- `--print-area-width-mm=<n>` set print area width in millimeters
- `--list-code-pages` print supported code pages
- `--help` show CLI usage
- `--version` show package version

`http://.../printers/...` and `https://.../printers/...` inputs are normalized to `ipp://` / `ipps://` with a warning.

Printer selection order:

1. `--printer`
2. `ESC_POS_PRINTER`
3. First printer matching `epson|tm-t88v|receipt`
4. First detected printer

## Text Conversion Behavior

Supported code pages are `cp437`, `cp850`, `cp858`, and `cp1252`.

Text conversion only normalizes these exceptions before encoding:

- smart quotes to ASCII quotes
- Unicode dashes to `-`
- non-breaking spaces to regular spaces

Other unsupported characters become `?`.

- The CLI warns when fallback replacement occurs.
- Module conversion stays silent by default.

## Module API

Package entry point: `require("@bestimmaa/posprint")`

Convert markdown to ESC/POS bytes without submitting a print job:

```js
const { markdownToEscpos } = require("@bestimmaa/posprint");

const escpos = markdownToEscpos("# Dry Run\n\n- Tea\n- Muffin", {
  charsPerLine: 42,
  codePage: "cp858",
  font: "B"
});

console.log(`ESC/POS payload bytes: ${escpos.length}`);
```

For local queue printing, printer URI printing, available exports, and ESM interop, see the public module API guide:

- [Module API guide](https://github.com/bestimmaa/posprint/blob/main/docs/module-api.md)

## Features

- Inline markdown styling with bold, emphasis, and readable strikethrough handling
- Markdown image support for `.png`, `.jpg`, and `.jpeg`
- Native QR shortcode support like `{{qr:https://example.com|size=6|ec=M}}`
- Layout controls for font, character spacing, line spacing, left margin, and print area width
- Unicode-to-code-page conversion with `cp858` as the default

Show supported code pages:

```bash
posprint --list-code-pages
```

## Platform Support

Windows:

- Node.js 20+
- RAW printing through the Windows spooler
- Local queue printing by installed printer name
- Direct `--printer-uri` support for reachable IPP/IPPS endpoints

Linux/macOS:

- Node.js 20+
- CUPS tooling such as `lpstat`, `lp`, or `lpr`
- Local queue printing through the current user session
- Direct URI printing for IPP/IPPS endpoints

For a compatibility overview and support caveats, see [SUPPORTED_PRINTERS.md](./SUPPORTED_PRINTERS.md).

For step-by-step instructions on adding an Epson TM-T88V to CUPS, see [PRINTER_SETUP.md](./PRINTER_SETUP.md).

## Development

Install repository dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Helpful local commands:

- `npm run print -- --help`
- `npm run print:test:dry`
- `npm run print:test -- --printer="EPSON TM-T88V Receipt (USB)"`

For maintainer release steps, see [the release guide](https://github.com/bestimmaa/posprint/blob/main/docs/release.md).

## License

MIT
