# posprint

`posprint` is a Node.js CLI for sending ESC/POS receipts to Epson TM-T88V printers through the Windows RAW spooler, with markdown-to-receipt support for repeatable print flows.

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

Dry run from the test fixture (build payload and select printer, no print job):

```bash
posprint --dry-run --markdown-file="tests/fixtures/markdown-showcase.md"
```

Send a real print job to a specific Windows queue:

```bash
posprint --markdown-file="tests/fixtures/markdown-showcase.md" --printer="EPSON TM-T88V Receipt (USB)"
```

## CLI Usage

```text
posprint [options]
```

Flags:

- `--markdown-file=<path>`: Read receipt content from a markdown file.
- `--markdown="..."`: Pass markdown inline as a single argument.
- `--printer="Printer Name"`: Target an exact Windows printer queue.
- `--chars-per-line=<n>`: Set receipt wrapping width (default: `42`).
- `--strict-markdown`: Fail on unsupported markdown/HTML constructs.
- `--dry-run`: Build and inspect output without sending a print job.

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

Printer selection order:

1. `--printer`
2. `ESC_POS_PRINTER`
3. First printer matching `epson|tm-t88v|receipt`
4. First detected Windows printer

## Examples

Dry run with inline markdown:

```bash
posprint --dry-run --markdown="# Hello\n\n- Espresso\n- Croissant" --chars-per-line=42
```

PowerShell multiline markdown:

```powershell
posprint --dry-run --markdown "# Shift Open`n`n- Till: 3`n- Cashier: Sam"
```

Print from file to the USB receipt queue:

```bash
posprint --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt (USB)"
```

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

## Windows Requirements

- Windows machine with Node.js 20+.
- Epson TM-T88V installed as a Windows printer.
- Printer queue available to the current user session.
- RAW printing enabled through the Windows spooler path.

## License

MIT
