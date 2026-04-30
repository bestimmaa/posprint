# macOS + CUPS printer URI support design

- Date: 2026-04-30
- Status: Drafted with user, approved for implementation planning
- Scope: Add macOS CUPS RAW printing support and remote CUPS direct-print override via printer URI for CLI and module API.

## Context

The project currently supports:
- Windows RAW spooler printing (`win32`)
- Linux CUPS printing (`linux`) via `lp`/`lpr`

User requirement:
- Print from macOS to an existing CUPS instance, with a RAW queue configured on `taiga`.
- Keep existing local printer flow.
- Add explicit remote CUPS override with `--printer-uri`.
- Expose URI printing in the Node module API as well.

Reference user example:
- Web UI URL: `http://taiga.local:631/printers/TM-T88V`
- Print URI expected form: `ipp://taiga.local:631/printers/TM-T88V` (or `ipps://...` if TLS is required)

## Goals

1. Support macOS (`darwin`) in the cross-platform print bridge for CUPS-based printing.
2. Add CLI option `--printer-uri=<ipp|ipps URI>` for direct remote CUPS printing.
3. Preserve local queue behavior (`--printer`, `ESC_POS_PRINTER`, auto-select) when `--printer-uri` is not set.
4. Add module API for remote URI printing without breaking existing API.
5. Keep ESC/POS payload handling in RAW mode.

## Non-goals

- Replacing existing local printer discovery/selection semantics.
- Supporting `http://` as a print transport URI.
- Adding Windows remote-CUPS URI support.
- Refactoring file/module names beyond what is required for this feature.

## Chosen approach

Approach A (user-approved): minimally extend current Linux CUPS backend to also serve macOS and add `--printer-uri` support.

Why:
- Small, practical delta.
- Reuses existing CUPS command execution path.
- Preserves current architecture and testability.

## Design

### 1) Platform and bridge updates

Files:
- `src/print-bridge.js`
- `src/print-cli.js`

Changes:
- Expand supported platforms from `win32, linux` to `win32, linux, darwin`.
- Route both `linux` and `darwin` through the existing CUPS backend module (`src/linux-cups-printer.js`).
- Keep `win32` routed to Windows RAW spooler module.

Result:
- macOS gets the same CUPS command-driven behavior as Linux.

### 2) CLI surface and behavior

File:
- `src/print-cli.js`

New option:
- `--printer-uri=<uri>`

Help text update:
- Include `--printer-uri` with an example-friendly description.

Validation and precedence:
- Accept only `ipp://` and `ipps://` schemes.
- Reject `http://` and other schemes with a clear guidance message.
- If both `--printer-uri` and `--printer` are provided, URI mode takes precedence.

Execution flow:
1. Parse args and build ESC/POS payload.
2. If `--dry-run`, exit with dry-run result (no printer submission).
3. If `--printer-uri` present, submit via URI mode.
4. Else run current local-printer flow (list/select/print).

### 3) CUPS URI print path

File:
- `src/linux-cups-printer.js`

New function:
- `printRawToPrinterUri(printerUri, data, opts)`

Behavior:
- Validate `data` is `Buffer`.
- Parse URI and extract:
  - host + optional port
  - queue name from path `/printers/<queue>` (primary supported form)
- Submit via `lp` in RAW mode:
  - `lp -h host[:port] -d <queue> -o raw`
  - write payload via stdin

Rationale:
- `lp -h + -d` is broadly compatible and maps cleanly from CUPS server + queue.

Command availability:
- URI mode requires `lp`; if missing, return explicit command-not-found error.
- Existing local mode behavior remains (`lp` with fallback to `lpr`).

### 4) Module API changes

Files:
- `src/print-bridge.js`
- `src/index.js`

Backward compatibility:
- Keep existing `printRaw(printerName, data)` unchanged.

Additions:
- Export `printRawToPrinterUri(printerUri, data)` through index.
- Bridge exposes same method and routes to CUPS backend for `linux/darwin`.
- On unsupported platforms (e.g., `win32` for URI mode), throw clear unsupported error.

### 5) Error handling

Explicit errors for:
- Invalid URI format.
- Unsupported URI scheme (`http`, etc.).
- Missing or unparseable queue segment from URI path.
- Missing `lp` executable in URI mode.
- Unsupported platform for selected operation.

All errors should remain user-oriented and actionable.

### 6) Testing strategy

Files likely touched:
- `tests/*` around CLI and bridge/cups modules.

Add/adjust tests for:
- Platform acceptance includes `darwin`.
- CLI `--printer-uri` parsing and precedence over `--printer`.
- URI scheme validation (`ipp`/`ipps` accept, `http` reject).
- URI parsing to `host[:port]` and queue.
- `lp` command invocation for URI mode with `-h`, `-d`, `-o raw` and stdin payload.
- Module export and behavior of `printRawToPrinterUri`.
- `--dry-run` unaffected regardless of URI/local options.

## Data flow summary

URI mode:
1. Markdown -> ESC/POS payload buffer.
2. CLI/module receives `printerUri`.
3. URI parsed/validated.
4. `lp -h host[:port] -d queue -o raw` invoked.
5. Payload piped to stdin.

Local mode (unchanged):
1. Markdown -> ESC/POS payload buffer.
2. Discover local printers.
3. Select printer (arg/env/default).
4. Submit RAW via existing local CUPS path.

## Risks and mitigations

Risk: URI path shape varies across CUPS installs.
- Mitigation: start with strict `/printers/<queue>` support and emit precise error message for unsupported shapes.

Risk: macOS command-line CUPS tools absent/misconfigured.
- Mitigation: explicit command-not-found errors, preserve dry-run path.

Risk: behavior drift between local and URI modes.
- Mitigation: centralize raw submission in CUPS backend and add focused tests per mode.

## Documentation updates required during implementation

- `README.md`
  - Add macOS support statement.
  - Document `--printer-uri` and expected URI format.
  - Clarify `http://` web UI vs `ipp://` print URI.
  - Add example commands for local and remote CUPS on macOS.

## Acceptance criteria

1. `posprint` accepts `--printer-uri=ipp://...` and submits RAW print job via CUPS `lp`.
2. On macOS, local queue printing works through bridge-supported `darwin` platform.
3. Existing Windows and Linux local workflows remain unchanged.
4. Node module exports URI print function and it works on linux/darwin.
5. Tests cover new CLI, bridge, URI parsing, and command invocation behavior.
6. README reflects new platform/CLI/module capabilities.
