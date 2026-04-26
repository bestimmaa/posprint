# AGENTS

This repository is for exploring the EPSON TM-T88V thermal printer.

## Scope
- Focus on printer setup, drivers, SDKs, and ESC/POS experimentation for TM-T88V.
- Keep notes and downloaded references in the repository for reproducible tests.

## Project Goal
- Build and test a Node.js ESC/POS app for TM-T88V over the Windows RAW spooler path.
- Keep experiments small, reproducible, and easy to rerun from the CLI.

## Current Setup
- Runtime: Node.js 20+ on Windows.
- ESC/POS builder: `src/escpos-builder.js`.
- Windows RAW print bridge: `src/windows-raw-printer.js`.
- Test entrypoint: `src/print-test.js`.
- Markdown test receipt fixture: `TEST_RECEIPT.md`.

## Conventions
- Store source links in this file for quick reference.
- Prefer plain text or Markdown snapshots for quick diffing and review.
- Include source URL and capture date in stored references.
- Original software and drivers are stored in `./drivers_and_manuals`.

## Quick Commands
- Install: `npm install`
- Dry run (discover/select printer): `npm run print:test:dry`
- Print test receipt: `npm run print:test -- --printer="EPSON TM-T88V Receipt (USB)"`
- Optional env override: `ESC_POS_PRINTER`

## Known Working State
- Windows printer discovery works from Node.
- Test receipt prints over Windows spooler in RAW mode.
- Demo receipt currently prints coffee + croissant lines.

## Current Reference
- `https://download-center.epson.com/softwares/?device_id=TM-T88V&os=MAC15&language=de&region=DE`
