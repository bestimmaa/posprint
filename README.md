# posprint

[![CI](https://github.com/bestimmaa/posprint/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bestimmaa/posprint/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@bestimmaa/posprint)](https://www.npmjs.com/package/@bestimmaa/posprint)

`posprint` turns markdown into ESC/POS receipt output for Epson TM-T88V style printers.

- npm: [`@bestimmaa/posprint`](https://www.npmjs.com/package/@bestimmaa/posprint)
- GitHub: [bestimmaa/posprint](https://github.com/bestimmaa/posprint)
- Platforms: Windows RAW spooler, Linux CUPS, macOS CUPS — Node.js 20+ required
- Supported printers: [SUPPORTED_PRINTERS.md](./SUPPORTED_PRINTERS.md)
- Printer setup (Epson TM-T88V on CUPS): [PRINTER_SETUP.md](./PRINTER_SETUP.md)

## What it does

`posprint` ships as both a CLI and a Node.js module for markdown-to-ESC/POS workflows.

- Build receipt payloads from markdown
- Dry-run output before sending a real print job
- Preview the receipt layout as text without spending paper
- Print to a local printer queue, a direct IPP/IPPS printer URI, or a network printer over raw TCP (`tcp://`, port 9100)
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

Preview the approximate receipt layout in the terminal without printing:

```bash
posprint --preview --markdown="# Hello\n\n- Espresso\n- Croissant"
```

Print to a local queue:

```bash
posprint --markdown="# Hello\n\n- Espresso\n- Croissant" --printer="EPSON TM-T88V Receipt (USB)"
```

Pipe markdown via stdin (read when neither `--markdown-file` nor `--markdown` is given):

```bash
cat receipt.md | posprint --printer="EPSON TM-T88V Receipt (USB)"
./generate-receipt | posprint --dry-run
```

Print to a printer URI:

```bash
posprint --markdown-file="./receipt.md" --printer-uri="ipp://taiga.local:631/printers/TM-T88V"
```

Print straight to a network printer over raw TCP (JetDirect/AppSocket), no CUPS or IPP setup needed:

```bash
posprint --markdown-file="./receipt.md" --printer-uri="tcp://192.168.1.50:9100"
```

## CLI

```text
posprint [options]
```

Common options:

- `--markdown-file=<path>` read receipt content from a markdown file; `--markdown-file=-` reads from stdin
- `--markdown="..."` pass markdown inline as a single argument
- `--printer="Printer Name"` target an exact local printer queue
- `--printer-uri="ipp://host:631/printers/queue"` print directly to an IPP/IPPS printer URI, or `--printer-uri="tcp://host[:port]"` send raw bytes to a network printer over TCP (port defaults to `9100`). This takes precedence over `--printer`.
- `--dry-run` build and inspect output without sending a print job
- `--preview` print a framed plain-text preview of the ESC/POS payload to stdout (implies `--dry-run`)
- `--strict-markdown` reject unsupported constructs and invalid QR/row shortcodes
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

`tcp://host[:port]` URIs take no path and work on every platform. The job fails if the connection or write makes no progress for 10 seconds.

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
- GFM tables rendered as aligned monospace columns fitted to `charsPerLine` (see [Module API guide](https://github.com/bestimmaa/posprint/blob/main/docs/module-api.md#table-rendering))
- Markdown image support for `.png`, `.jpg`, and `.jpeg`
- Native QR shortcode support like `{{qr:https://example.com|size=6|ec=M}}`
- Left/right receipt rows like `{{row:Espresso|2.50}}` or `{{row:Total|12.00|fill=.}}` (see [Receipt rows](#receipt-rows))
- Layout controls for font, character spacing, line spacing, left margin, and print area width
- Unicode-to-code-page conversion with `cp858` as the default
- Text preview (`--preview` / `previewEscpos`) that decodes the actual ESC/POS bytes: alignment, double-width text, code page characters, and placeholders for images, QR codes, drawer pulses, and cuts

### Receipt rows

Use `{{row:<left>|<right>[|fill=<char>]}}` to print a line with left text, fill characters, and right-aligned text spanning exactly `charsPerLine`:

```markdown
{{row:Espresso|2.50}}
{{row:Total|12.00|fill=.}}
```

```text
Espresso                              2.50
Total................................12.00
```

- `fill` must be exactly one character (default: space); at least one fill character separates left and right.
- Long left text wraps onto preceding lines; the right text stays right-aligned on the last line.
- Rows respect list markers and blockquote prefixes. Inline emphasis prints as plain text; `|` cannot appear inside left or right text.
- Invalid row shortcodes fail with `--strict-markdown`; otherwise a warning is printed and the shortcode is printed literally.

Show supported code pages:

```bash
posprint --list-code-pages
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

Helpful local commands:

- `npm run print -- --help`
- `npm run print:test:dry`
- `npm run print:test -- --printer="EPSON TM-T88V Receipt (USB)"`

For maintainer release steps, see [the release guide](https://github.com/bestimmaa/posprint/blob/main/docs/release.md).

## License

MIT
