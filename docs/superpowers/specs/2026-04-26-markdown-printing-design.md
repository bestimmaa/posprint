# Markdown Printing Design (TM-T88V)

Date: 2026-04-26
Project: posprint
Status: Draft approved in chat, ready for implementation planning

## Goal

Add markdown printing support so markdown input (from file or inline string) can be rendered with receipt-friendly formatting and printed to the EPSON TM-T88V via the existing Windows RAW spooler flow.

## Confirmed Scope (v1)

- Markdown features in scope: headings, bold/italic, paragraphs, unordered/ordered lists, horizontal rules, inline code, fenced code blocks, links.
- Primary interface: CLI-first.
- Width behavior: configurable with `--chars-per-line`.
- Unsupported syntax behavior: hybrid mode.
  - Default: best-effort degradation to readable text.
  - Strict mode: fail with explicit error using `--strict-markdown`.

## Architecture

### Existing modules kept intact

- `src/escpos-builder.js` remains the low-level ESC/POS primitive builder.
- `src/windows-raw-printer.js` remains the Windows RAW transport layer.
- `src/print-test.js` remains a stable smoke/demo script for known-good receipt output.

### New modules

- `src/markdown-to-escpos.js`
  - Pure conversion module: markdown + options -> ESC/POS byte payload.
  - No printer I/O.
- `src/print-cli.js`
  - Non-test CLI entrypoint for practical printing workflows.
  - Accepts markdown input and printer options, then submits bytes using existing RAW print bridge.

### Optional shared helper

- Small utility for shared CLI concerns (argument parsing and printer resolution) used by both `src/print-cli.js` and `src/print-test.js`.

## CLI Contract

`src/print-cli.js` supports:

- `--markdown-file="path/to/file.md"`
- `--markdown="inline markdown content"`
- `--chars-per-line=<n>`
- `--strict-markdown`
- Existing printer targeting (`--printer=...` and `ESC_POS_PRINTER` fallback behavior).

Input precedence:

1. `--markdown-file`
2. `--markdown`
3. If neither is present, return usage error (no implicit demo fallback in `print-cli`).

## Data Flow

1. CLI resolves markdown source and options.
2. Markdown text is parsed into AST.
3. AST nodes are converted into receipt-oriented render operations.
4. Render operations are emitted as ESC/POS bytes through `escpos-builder` primitives.
5. Payload is sent to selected Windows printer via `printRawToWindowsPrinter`.

## Rendering Rules

### Headings and hierarchy

- `#`: centered + bold + extra large (`size(1,1)`), matching demo receipt title style.
- `##`: centered + bold + large (one level below `#`, still clearly prominent).
- `###` to `######`: left-aligned + bold + normal size.

### Block/inline elements

- Paragraphs: left-aligned wrapped text.
- Unordered lists: `- ` prefix.
- Ordered lists: `<index>. ` prefix.
- Horizontal rules: `-` repeated to `charsPerLine`.
- Inline code: plain-text rendering suitable for receipt readability.
- Fenced code blocks: left-aligned verbatim-style lines, wrapping only as needed.
- Links: `label (url)`; if no label, print URL.

### Wrapping

- Width controlled by `--chars-per-line`.
- Word-wrap preferred; hard split only when a token exceeds line width.

## Error Handling and Validation

- Missing markdown input (`--markdown-file` and `--markdown` both absent): usage error.
- If both markdown inputs are provided: deterministic precedence (`--markdown-file` wins) and optional informational notice.
- Unreadable/missing markdown file: fail with actionable path-specific error.
- Strict mode (`--strict-markdown`): parsing/rendering fails on unsupported constructs with concise error context.
- Best-effort mode (default): unsupported constructs degrade to readable plain text output.
- RAW print transport errors are surfaced from existing printer bridge behavior.
- Do not submit a print job if conversion fails.

## Testing Strategy

### Unit tests (renderer)

- Heading style mapping, including `#` extra-large and `##` large behavior.
- List prefixing, horizontal rule width, link formatting, code block rendering.
- Wrapping behavior for normal prose and long unbroken tokens.
- Best-effort vs strict-mode unsupported syntax behavior.

### CLI tests

- Input precedence and missing-input usage errors.
- `--chars-per-line` parsing/validation.
- `--strict-markdown` behavior toggling.

### Regression confidence

- Snapshot-like payload checks for representative markdown fixtures.
- Manual printer verification on TM-T88V for visual hierarchy and readability.
- Keep `src/print-test.js` smoke path unchanged for baseline hardware sanity checks.

## Out of Scope (v1)

- Table rendering.
- Images/graphics rendering from markdown.
- Full HTML-in-markdown support beyond plain-text degradation.

## Open Decisions Resolved

- Keep `print-test` as test/demo entrypoint: resolved.
- Create non-test production-style CLI entrypoint (`print-cli`): resolved.
- Heading size hierarchy for receipts (`#` extra-large from demo style): resolved.
