# ESC/POS Code Page Transcoding Design

Date: 2026-05-01

## Context
Current text emission uses UTF-8 bytes (`TextEncoder`) while ESC/POS code page selection (`ESC t n`) is handled separately. On TM-T88V this causes non-ASCII Western characters to print incorrectly.

## Goals
- Transcode Unicode input to selected ESC/POS code page bytes before printing.
- Support Western characters with correct fidelity using `cp850`.
- Keep existing ASCII-safe normalization as fallback for unencodable characters.
- Expose explicit code page selection in CLI and module API.
- Add fixtures/tests for: `°, ä, ö, ü, ß, é, è, à, ñ`.
- Document behavior and supported code pages in README.

## Non-Goals
- Broad multi-language support in this issue.
- Replacing all normalization behavior.
- Introducing strict-encoding failure mode.

## Chosen Approach
Introduce a dedicated transcoder layer that cleanly separates:
1. code page metadata + mappings,
2. Unicode-to-byte conversion,
3. fallback normalization behavior.

This keeps renderer logic focused on markdown/layout and makes future code page additions low-risk.

## External Behavior

### Defaults
- Default code page becomes `cp850`.
- ESC/POS setup emits `ESC t 2` for `cp850`.

### CLI
- New option: `--code-page=<name>`.
- Accepted values in this change: `cp850`.
- Unknown code page name fails with clear validation error.

### Module API
- `markdownToEscpos(markdown, { codePage: "cp850" })`.
- Same accepted names as CLI.

### Fallback semantics
Per character:
1. Try direct encode in active code page.
2. If not encodable, apply existing ASCII-safe normalization fallback.
3. Retry encode for normalized text.
4. If still not encodable, emit `?` as deterministic last resort.

No strict-failure mode is added in this issue.

## Internal Architecture

### New module: `src/text-transcoder.js`
Exports:
- `resolveCodePage(name)`
- `getSupportedCodePages()`
- `encodeText(input, { codePage }) -> Uint8Array`

Responsibilities:
- Validate and normalize code page names.
- Hold code page registry entries (initially `cp850`).
- Encode text with fallback behavior.

### Code page metadata
Registry shape:
- `name`: canonical identifier (`cp850`)
- `escposId`: integer for `ESC t n` (`2` for cp850)
- `encodeChar(char)`: returns byte or null

`cp850` implementation strategy:
- Fast path for ASCII (`0x00..0x7F`).
- Lookup map for extended Western characters used by cp850.

### Integration points
- `src/markdown-to-escpos.js`
  - Parse/validate `options.codePage` (default `cp850`).
  - Emit `setCodePage(selected.escposId)`.
  - Route all text byte creation through transcoder (instead of UTF-8 bytes).
- `src/print-cli.js` / shared CLI parsing
  - Parse `--code-page` and pass into `markdownToEscpos`.
  - Validate names and produce helpful errors.
- `src/index.js`
  - Ensure API docs/exports remain aligned if helper exports are exposed.

## Data Flow
1. User provides markdown + optional `codePage`.
2. Markdown parser yields text segments.
3. Segment text sent to transcoder.
4. Transcoder emits code-page bytes with fallback logic.
5. ESC/POS payload includes init + charset/codepage commands + encoded content.

## Error Handling
- Unknown `codePage`: throw descriptive validation error.
- Invalid option type: throw descriptive error.
- Unencodable char after fallback: replace with `?` (no throw).

## Testing Strategy

### Unit tests (transcoder)
- Verify byte mappings for `cp850` for:
  - `°, ä, ö, ü, ß, é, è, à, ñ`.
- Verify ASCII pass-through is unchanged.
- Verify fallback path for unsupported characters produces ASCII-safe output or `?`.

### Integration tests (`markdown-to-escpos`)
- Default payload includes `ESC t 2`.
- Markdown fixture containing target characters yields expected cp850 bytes.
- CLI option roundtrip: `--code-page=cp850` reaches converter.
- Unknown `--code-page` returns clear error.

### Fixture
- Add dedicated markdown fixture with Western characters used in acceptance criteria.

## README Updates
- Add section explaining why code page transcoding is required for ESC/POS.
- Document default `cp850`.
- Document `--code-page` and module `codePage` option.
- Add explicit **Supported code pages** table including:
  - `cp850` (default)
  - CLI value
  - ESC/POS ID (`2`)
  - scope note that this release supports cp850.
- Clarify fallback behavior and limitations.

## Implementation Steps (high-level)
1. Add transcoder module + cp850 registry/mapping.
2. Add option parsing/validation for code page in module + CLI.
3. Replace UTF-8 text byte emission path with transcoder output.
4. Add fixtures and unit/integration tests.
5. Update README for behavior and supported code pages.

## Risks and Mitigations
- **Risk:** mapping mistakes for extended bytes.
  - **Mitigation:** byte-level tests for representative chars + fixture regression.
- **Risk:** accidental behavior drift for ASCII.
  - **Mitigation:** keep ASCII fast path and existing tests.
- **Risk:** hidden UTF-8 text paths remain.
  - **Mitigation:** grep-based verification + integration tests over mixed content.

## Success Criteria
- TM-T88V prints listed Western characters correctly using `cp850`.
- Tests assert exact output bytes for representative characters.
- README clearly documents behavior, supported code pages, and fallback limits.
