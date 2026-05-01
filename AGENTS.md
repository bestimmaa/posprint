# AGENTS

This repository provides `posprint`: a Node.js module + CLI for markdown-to-ESC/POS receipt printing (EPSON TM-T88V focused), with Windows RAW spooler and CUPS (Linux/macOS) support.

## Scope
- Keep CLI and module behavior practical, testable, and repeatable from the command line.
- Keep printer-specific validation fixtures in-repo.

## Project Goal
- Ship a reliable markdown-to-ESC/POS toolchain as:
  - reusable module API (`src/index.js`)
  - `posprint` CLI (`src/print-cli.js`)
- Preserve fast workflows for dry runs and real print submission.

## Architecture (current)
- Runtime: Node.js 20+
- Conversion pipeline: `src/markdown-to-escpos.js` + `src/escpos-builder.js`
- Print bridges:
  - Windows RAW spooler: `src/windows-raw-printer.js`
  - CUPS/local queue + URI printing: `src/linux-cups-printer.js`
  - Cross-platform dispatch: `src/print-bridge.js`
- Shared CLI helpers: `src/cli-common.js`
- Repeatable fixtures: `tests/fixtures/*.md`

## Conventions
- Use semantic commit messages:
  - Format: `<type>(<scope>): <subject>` (`<scope>` optional)
  - Subject is short and present tense
  - Types:
    - `feat` new user feature
    - `fix` user-facing bug fix
    - `docs` documentation only
    - `style` formatting/style only (no behavior change)
    - `refactor` internal code restructure (no feature/fix)
    - `test` test-only changes
    - `chore` tooling/maintenance only
- Keep source references with URL + capture date when storing external material.
- After changing module/CLI behavior, API, scripts, or workflow:
  - verify `README.md`
  - keep module and CLI docs aligned in the same change

## Quick Commands
- Install: `npm install`
- Test: `npm test`
- CLI help: `npm run print -- --help`
- Dry-run fixture: `npm run print:test:dry`
- Submit fixture to local queue: `npm run print:test -- --printer="EPSON TM-T88V Receipt (USB)"`
- Dry-run from file: `npm run print:dry -- --markdown-file="tests/fixtures/markdown-showcase.md"`
- Optional env printer override: `ESC_POS_PRINTER`

## Validation Notes
- Prefer dry-run first for payload inspection.
- For real print tests, use known printer names or `--printer-uri` for CUPS targets.
