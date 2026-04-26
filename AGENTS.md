# AGENTS

This repository builds a usable Node.js module + CLI for markdown-based receipt printing to EPSON TM-T88V through the Windows RAW spooler.

## Scope
- Keep the CLI and module behavior practical, testable, and repeatable from the command line.
- Keep printer-specific references and assets in-repo for reproducible TM-T88V validation.

## Project Goal
- Provide a reliable markdown-to-ESC/POS toolchain as both:
  - a reusable Node module, and
  - the `posprint` CLI entrypoint.
- Preserve a fast workflow for dry runs and real print tests against the Windows spooler path.

## Current Architecture
- Runtime: Node.js 20+ on Windows.
- Module entrypoint: `src/index.js`.
- CLI entrypoint: `src/print-cli.js` (published as `posprint`).
- Markdown conversion pipeline: `src/markdown-to-escpos.js` + `src/escpos-builder.js`.
- Windows RAW print bridge: `src/windows-raw-printer.js`.
- Shared CLI helpers: `src/cli-common.js`.
- Fixture-based print tests and samples: `tests/fixtures/*.md`.

## Conventions
- Store source links in this file for quick reference.
- Prefer plain text or Markdown snapshots for quick diffing and review.
- Include source URL and capture date in stored references.
- Original software and drivers are stored in `./drivers_and_manuals`.
- After module or CLI behavior, API, script, or workflow changes, verify README.md and keep module and CLI docs aligned in the same change.

## Quick Commands
- Install: `npm install`
- Run unit/integration tests: `npm test`
- Show CLI help: `npm run print -- --help`
- Dry run from markdown fixture: `npm run print:test:dry`
- Submit fixture print job: `npm run print:test -- --printer="EPSON TM-T88V Receipt (USB)"`
- Direct CLI dry run: `npm run print:dry -- --markdown-file="tests/fixtures/markdown-showcase.md"`
- Optional env override: `ESC_POS_PRINTER`

## Known Working State
- Windows printer discovery works from Node.
- Test receipt prints over Windows spooler in RAW mode.
- Markdown fixtures in `tests/fixtures` provide repeatable receipt content.

## Current Reference
- `https://download-center.epson.com/softwares/?device_id=TM-T88V&os=MAC15&language=de&region=DE`
