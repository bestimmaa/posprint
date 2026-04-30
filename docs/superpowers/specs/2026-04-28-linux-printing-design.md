# Linux Printing Support Design (posprint)

Date: 2026-04-28
Status: Draft for review

## 1) Goals

Add Linux printing support while preserving existing Windows behavior.

Required outcomes:
- CLI supports Linux printing from markdown input (`--markdown-file`, `--markdown`) and dry runs.
- Module supports Linux printing and keeps backward compatibility with existing Windows export(s).
- Printer selection order remains exactly:
  1. CLI `--printer`
  2. `ESC_POS_PRINTER`
  3. fuzzy match `epson|tm-t88v|receipt`
  4. first discovered printer
- Linux printing uses CUPS commands in raw mode, with fallback:
  - first `lp`
  - then `lpr`

Non-goals:
- No macOS backend in this change.
- No changes to markdown rendering semantics.

## 2) Recommended Approach

Use a platform adapter layer (recommended approach B):
- Keep Windows backend isolated.
- Add Linux backend isolated.
- Add a small cross-platform bridge that dispatches by platform.

This keeps behavior practical and testable while avoiding scattered `process.platform` conditionals.

## 3) Architecture & Components

### Existing components (kept)
- `src/markdown-to-escpos.js` + `src/escpos-builder.js` (conversion pipeline)
- `src/windows-raw-printer.js` (Windows RAW bridge)
- `src/cli-common.js` (selection helpers)
- `src/print-cli.js` (CLI orchestration)
- `src/index.js` (module exports)

### New / changed components
- **New:** `src/linux-cups-printer.js`
  - `listLinuxPrinters()` from CUPS (`lpstat -a` parsing)
  - `printRawToLinuxPrinter(printerName, buffer)`
  - command preference: `lp` then `lpr`
  - enforce raw mode (`-o raw`)
- **New:** `src/print-bridge.js`
  - `listPrinters()` dispatch by platform
  - `printRaw(printerName, buffer)` dispatch by platform
- **Changed:** `src/index.js`
  - export new cross-platform API
  - keep compatibility export(s), notably `printRawToWindowsPrinter`
- **Changed:** `src/print-cli.js`
  - use bridge API; no new flags required

## 4) API Design

Primary module API:
- `listPrinters()` → returns available printer names for current platform.
- `printRaw(printerName, buffer)` → sends ESC/POS bytes to current platform print backend.

Compatibility:
- Keep `printRawToWindowsPrinter` export as-is (existing consumers unaffected).
- Existing markdown conversion exports remain unchanged.

## 5) Data Flow

### CLI print flow (Linux + Windows)
1. Parse CLI args and markdown input.
2. Convert markdown to ESC/POS bytes using existing converter.
3. Call bridge `listPrinters()`.
4. Resolve printer with current shared selection helper (same precedence as today).
5. If not `--dry-run`, call bridge `printRaw(printerName, payload)`.

### Linux backend print submission
1. Attempt `lp` execution with raw mode and stdin payload.
2. If `lp` unavailable/fails due to command-not-found, fallback to `lpr` with raw mode and stdin payload.
3. Return success metadata or throw actionable error.

## 6) Error Handling

Linux-specific errors should be explicit and actionable:
- Neither `lp` nor `lpr` found:
  - message indicates missing CUPS client tooling.
- No printers discovered:
  - message points to `lpstat -a` / printer setup checks.
- Submission failure:
  - include command used (`lp` or `lpr`) and stderr summary.

General behavior:
- Keep `--dry-run` independent of printer availability.
- Keep Windows error behavior unchanged.

## 7) Testing Strategy

Add/update tests with process stubbing (no real CUPS required):
- Bridge dispatch tests by platform.
- Linux printer-list parsing tests (`lpstat -a` output variants).
- Linux print command tests:
  - successful `lp` path
  - fallback to `lpr` when `lp` missing
  - raw mode always set
- Selection-order tests remain consistent.
- CLI integration-style tests for markdown inputs on Linux path (mock backend calls).

Verification command:
- `npm test`

## 8) Documentation Updates

Update `README.md` in same change to keep module/CLI docs aligned:
- Add Linux support and requirements (CUPS with `lp`/`lpr`).
- Document raw mode printing on Linux.
- Keep Windows guidance intact.
- Confirm markdown workflows are documented as cross-platform.

## 9) Rollout & Compatibility

- Backward compatible for existing Windows consumers.
- Linux support is additive.
- No breaking CLI flags or argument changes.

## 10) Open Risks and Mitigations

Risk: `lpstat` output formatting differences across distros.
- Mitigation: robust parser tests with multiple output samples.

Risk: `lp`/`lpr` option behavior differences.
- Mitigation: prefer `lp`, fallback `lpr`, include clear diagnostics and tests.

Risk: accidental Windows regression during refactor.
- Mitigation: keep Windows backend file unchanged where possible and verify with tests.
