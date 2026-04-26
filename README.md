# ESC/POS over Windows Spooler (Node.js)

This playground uses the Windows print spooler (RAW mode) to send ESC/POS bytes to an EPSON TM-T88V from Node.js.

## Prerequisites

- Windows machine with the printer installed in Windows Printers.
- Node.js 20+.

## Setup

```bash
npm install
```

Dependencies are installed via `npm install` (including `markdown-it` for markdown rendering).

## Run

Dry-run (list printers and selected target only):

```bash
npm run print:test:dry
```

Send test receipt:

```bash
npm run print:test -- --printer="EPSON TM-T88V Receipt"
```

You can also set the printer via environment variable:

```powershell
$env:ESC_POS_PRINTER="EPSON TM-T88V Receipt"
npm run print:test
```

Save the generated ESC/POS payload to `tmp/escpos-demo.bin`:

```bash
npm run print:test:save
```

## Markdown Printing

Dry run with inline markdown:

```bash
npm run print:dry -- --markdown="# Hello\n\n- One\n- Two"
```

PowerShell multiline example:

```powershell
npm run print:dry -- --markdown "# Hello`n`n- One`n- Two"
```

Print from markdown file:

```bash
npm run print -- --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt"
```

Strict mode:

```bash
npm run print -- --markdown-file="receipt.md" --strict-markdown
```

### CLI Usage

The production markdown CLI is `src/print-cli.js` and is exposed through:

- `npm run print`
- `npm run print:dry`

Supported flags:

- `--markdown-file=<path>`: Read markdown from a file.
- `--markdown="..."`: Pass markdown inline (single argument).
- `--printer="Printer Name"`: Choose the exact Windows printer.
- `--chars-per-line=<n>`: Wrap width for receipt formatting (default: `42`).
- `--strict-markdown`: Reject unsupported markdown/HTML constructs.
- `--dry-run`: Build payload and select printer, but do not send print job.

Selection behavior:

1. `--printer` flag (if provided)
2. `ESC_POS_PRINTER` environment variable
3. First printer matching `epson|tm-t88v|receipt`
4. First detected Windows printer

Examples:

```bash
# Dry run with explicit width
npm run print:dry -- --markdown="# Hello\n\n1. Espresso\n2. Croissant" --chars-per-line=42

# Real print from file
npm run print -- --markdown-file="tests/fixtures/markdown-basic.md" --printer="EPSON TM-T88V Receipt (USB)"

# Validate markdown strictly without printing
npm run print:dry -- --markdown-file="tests/fixtures/unsupported-html.md" --strict-markdown
```

## Files

- `src/escpos-builder.js` - ESC/POS command builder and demo receipt.
- `src/windows-raw-printer.js` - Windows RAW spooler bridge via PowerShell and WinSpool API.
- `src/print-test.js` - CLI test entrypoint.
