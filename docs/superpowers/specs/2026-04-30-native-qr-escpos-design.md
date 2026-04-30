# Native ESC/POS QR Support Design

- **Date:** 2026-04-30
- **Project:** `posprint`
- **Status:** Draft approved in chat, written for review

## 1. Goal

Add native ESC/POS QR printing support to the markdown conversion pipeline using shortcode syntax:

- `{{qr:PAYLOAD|size=6|ec=M}}`

This must work in both module and CLI flows because both already pass through `markdownToEscpos`.

## 2. Scope

### In scope
- Parse inline QR shortcodes in markdown text content.
- Emit native ESC/POS QR command sequence (`GS ( k`) for valid shortcodes.
- Support QR options:
  - `size` (integer, range `1..16`)
  - `ec` (`L`, `M`, `Q`, `H`)
- Mode behavior:
  - `strictMarkdown: true` → invalid shortcode/options cause hard failure.
  - `strictMarkdown: false` → invalid shortcode/options produce `console.warn(...)` and render literal shortcode text.
- Keep normal text rendering intact around QR shortcode usage.

### Out of scope (v1)
- Additional QR options (model overrides, mask patterns, encoding hints).
- New CLI flags for QR behavior.
- Auto-converting URLs/text to QR without shortcode.

## 3. Syntax contract

### Accepted form
`{{qr:PAYLOAD|size=6|ec=M}}`

- Prefix is exactly `qr:` after `{{`.
- `PAYLOAD` is required and must be non-empty after trimming.
- Option segments are `key=value`, separated by `|`.

### Supported keys
- `size`: decimal integer, `1..16`
- `ec`: one of `L|M|Q|H` (case-insensitive input accepted, normalized upper-case)

### Invalid examples
- `{{qr:}}` (missing payload)
- `{{qr:hello|size=0}}` (out of range)
- `{{qr:hello|ec=Z}}` (invalid EC)
- `{{qr:hello|foo=bar}}` (unknown option)
- `{{qr:hello|size}}` (malformed option)

## 4. Rendering + data flow

1. Markdown is parsed with existing Markdown-It tokenizer.
2. Inline text processing scans for `{{qr:...}}` blocks.
3. For each shortcode:
   - Parse + validate shortcode and options.
   - If valid: flush pending text, emit centered native QR bytes, reset left alignment.
   - If invalid:
     - strict mode: throw error.
     - best-effort: warn + emit literal shortcode as normal text.
4. Continue rendering remaining text normally.

## 5. ESC/POS command model

Add a builder utility in `src/escpos-builder.js` for native QR commands.

Sequence emitted for each QR code:
1. Select model (`GS ( k` fn 65)
2. Set module size (`GS ( k` fn 67)
3. Set error correction (`GS ( k` fn 69)
4. Store data (`GS ( k` fn 80)
5. Print symbol (`GS ( k` fn 81)

The builder performs bounds checks and constructs proper `pL/pH` lengths.

## 6. Error handling policy

Errors are QR-syntax/validation specific and include enough context to debug quickly.

- Strict mode: throw `Error` with message including offending shortcode.
- Best-effort mode: `console.warn` with same message and continue rendering literal text.

No silent failures.

## 7. Testing strategy

Tests are added to `tests/markdown-to-escpos.test.js` and (if needed) new focused builder tests.

Required cases:
1. Valid shortcode emits QR command bytes (`GS ( k` present in output).
2. Option mapping for `size` and `ec` produces expected command bytes.
3. Strict mode rejects invalid `size`.
4. Strict mode rejects invalid `ec`.
5. Strict mode rejects unknown option.
6. Best-effort mode warns and keeps literal shortcode text for invalid syntax.
7. Mixed content preserves ordering (`text -> qr -> text`).

## 8. Files expected to change

- `src/escpos-builder.js` (add native QR command builder)
- `src/markdown-to-escpos.js` (shortcode parsing + fallback behavior)
- `tests/markdown-to-escpos.test.js` (new TDD cases)
- `README.md` (document shortcode syntax and strict/best-effort behavior)

## 9. Risks and mitigations

- **Risk:** Inline parser accidentally affects existing markdown text handling.
  - **Mitigation:** Keep QR parsing narrowly scoped to explicit `{{qr:` patterns and preserve literal text path.
- **Risk:** ESC/POS byte framing mistakes.
  - **Mitigation:** Byte-level tests asserting function identifiers and expected sequence segments.
- **Risk:** Warning spam if many malformed shortcodes exist.
  - **Mitigation:** One warning per malformed shortcode occurrence (explicit, debuggable behavior).

## 10. Acceptance criteria

- Valid `{{qr:...}}` shortcodes print native QR commands.
- Invalid shortcodes fail in strict mode.
- Invalid shortcodes warn and render literally in best-effort mode.
- Existing markdown/image rendering behavior remains passing.
- README documents feature and failure-mode behavior.
