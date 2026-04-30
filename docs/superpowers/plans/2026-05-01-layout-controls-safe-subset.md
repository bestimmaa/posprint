# Layout Controls (Safe Subset) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global font/layout ESC/POS controls (font, character spacing, line spacing, left margin, print area width) via module options and CLI flags, with mm-based inputs.

**Architecture:** Keep the existing markdown pipeline intact and emit optional layout preamble commands once near initialization in `markdownToEscpos`. Add low-level builder helpers for each command and validate/parse CLI flags into converter options. Maintain backward compatibility by only emitting new commands when options are provided.

**Tech Stack:** Node.js (CommonJS), node:test, existing ESC/POS byte builder utilities.

---

### Task 1: Add low-level ESC/POS layout builder commands

**Files:**
- Modify: `src/escpos-builder.js`
- Test: `tests/markdown-to-escpos.test.js`

- [ ] **Step 1: Write failing tests for raw command byte helpers**

Add tests to `tests/markdown-to-escpos.test.js` asserting exact bytes for:
- `font('A') -> [0x1b,0x4d,0x00]`
- `font('B') -> [0x1b,0x4d,0x01]`
- `font('C') -> [0x1b,0x4d,0x02]`
- `characterSpacing(8) -> [0x1b,0x20,0x08]`
- `lineSpacing(24) -> [0x1b,0x33,0x18]`
- `leftMargin(16) -> [0x1d,0x4c,0x10,0x00]`
- `printAreaWidth(336) -> [0x1d,0x57,0x50,0x01]`

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/markdown-to-escpos.test.js`
Expected: FAIL because functions are not exported/implemented.

- [ ] **Step 3: Implement minimal builder functions**

In `src/escpos-builder.js`, add and export:
- `font(value)` mapping `A|B|C` (case-insensitive) to `ESC M n`
- `characterSpacing(n)` (`ESC SP n`, clamp 0..255)
- `lineSpacing(n)` (`ESC 3 n`, clamp 0..255)
- `leftMargin(n)` (`GS L nL nH`, clamp 0..65535)
- `printAreaWidth(n)` (`GS W nL nH`, clamp 0..65535)

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/markdown-to-escpos.test.js`
Expected: PASS for the new command tests.

- [ ] **Step 5: Commit**

```bash
git add src/escpos-builder.js tests/markdown-to-escpos.test.js
git commit -m "feat: add escpos builder layout command helpers"
```

### Task 2: Add markdown converter layout option handling (module API)

**Files:**
- Modify: `src/markdown-to-escpos.js`
- Test: `tests/markdown-to-escpos.test.js`

- [ ] **Step 1: Write failing converter tests for layout option preamble**

Add tests asserting `markdownToEscpos("hello", options)` contains bytes for:
- `{ font: 'B' }` -> `ESC M 1`
- `{ characterSpacingMm: 1 }` -> `ESC SP 8`
- `{ lineSpacingMm: 3 }` -> `ESC 3 24`
- `{ leftMarginMm: 2 }` -> `GS L 16 0`
- `{ printAreaWidthMm: 42 }` -> `GS W 80 1` (336 dots)

Also add validation tests asserting throws for:
- invalid font
- negative `characterSpacingMm`
- non-positive `lineSpacingMm`
- negative `leftMarginMm`
- non-positive `printAreaWidthMm`
- non-numeric mm values

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/markdown-to-escpos.test.js`
Expected: FAIL because options are ignored and validation missing.

- [ ] **Step 3: Implement minimal converter option handling**

In `src/markdown-to-escpos.js`:
- import new builder functions.
- add small helpers:
  - `toDots(mm) => Math.round(mm * 8)`
  - numeric validators with clear errors
- in `markdownToEscpos(...)`, after existing init/charset/codepage chunks, conditionally push layout commands when options are defined.

Keep behavior unchanged when options absent.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/markdown-to-escpos.test.js`
Expected: PASS for new option/validation tests and existing markdown tests.

- [ ] **Step 5: Commit**

```bash
git add src/markdown-to-escpos.js tests/markdown-to-escpos.test.js
git commit -m "feat: support global layout options in markdown conversion"
```

### Task 3: Add CLI flag parsing/validation/pass-through

**Files:**
- Modify: `src/print-cli.js`
- Test: `tests/print-cli.test.js`

- [ ] **Step 1: Write failing CLI tests for new flags**

Add tests covering:
- `formatHelp()` includes new flags:
  - `--font`
  - `--character-spacing-mm`
  - `--line-spacing-mm`
  - `--left-margin-mm`
  - `--print-area-width-mm`
- `main()` forwards parsed layout values into `markdownToEscpos` options (inject converter dependency to assert passed options)
- invalid values reject with clear errors:
  - invalid font
  - non-number mm values
  - invalid ranges (negative/zero where forbidden)

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/print-cli.test.js`
Expected: FAIL for missing help text/parsing/validation behavior.

- [ ] **Step 3: Implement minimal CLI parsing + validation**

In `src/print-cli.js`:
- extend help text with new flags.
- add parser helpers for optional numeric mm args.
- validate and normalize font to uppercase.
- build `layoutOptions` object.
- pass layout options to `markdownToEscpos(markdown, {...})`.

For testability, allow injecting `markdownToEscpos` via `deps.markdownToEscpos` fallback to imported function.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/print-cli.test.js`
Expected: PASS with new CLI coverage.

- [ ] **Step 5: Commit**

```bash
git add src/print-cli.js tests/print-cli.test.js
git commit -m "feat: add cli flags for global escpos layout controls"
```

### Task 4: Update README and align docs with behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write doc updates**

Add to CLI flags section:
- `--font=A|B|C`
- `--character-spacing-mm=<n>`
- `--line-spacing-mm=<n>`
- `--left-margin-mm=<n>`
- `--print-area-width-mm=<n>`

Add module options examples and a concise “Layout controls” note clarifying:
- units are mm
- controls are global for each generated receipt
- tab/absolute/relative positioning are not included in this change

- [ ] **Step 2: Verify docs match implementation**

Run quick grep checks:
```bash
rg "font|character-spacing-mm|line-spacing-mm|left-margin-mm|print-area-width-mm" README.md src/print-cli.js
```
Expected: README and help mention the same flags/options.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document safe-subset layout controls for cli and module"
```

### Task 5: Full verification before completion

**Files:**
- Modify: none
- Test: full suite

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run CLI help snapshot check**

Run: `npm run print -- --help`
Expected: displays new layout flags.

- [ ] **Step 3: Optional dry-run smoke test with layout flags**

Run:
```bash
npm run print:dry -- --markdown-file="tests/fixtures/markdown-showcase.md" --font=B --line-spacing-mm=3 --left-margin-mm=2 --print-area-width-mm=42
```
Expected: dry run completes and prints payload byte count.

- [ ] **Step 4: Commit verification notes if needed**

If no code/doc changes from verification: no commit.
If fixes needed: commit with focused message.
