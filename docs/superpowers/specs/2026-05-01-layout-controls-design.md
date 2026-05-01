# Layout Controls (Safe Subset) Design

## Summary
Implement global ESC/POS font and layout controls via module options and CLI flags, using millimeter inputs converted internally to printer units. Scope is intentionally limited to a safe subset.

## In Scope
- Font selection: A/B/C
- Character spacing
- Line spacing
- Left margin
- Print area width

## Out of Scope (Deferred)
- Tab stops
- Absolute positioning
- Relative positioning

## Goals
- Keep current rendering behavior unchanged when new options are not set.
- Add practical, testable global controls for TM-T88V workflows.
- Keep CLI and module docs aligned in the same change.

## Architecture
`markdownToEscpos()` will keep the existing pipeline and add a global layout preamble:

1. Existing init commands (`ESC @`, charset, code page)
2. New optional layout commands (if options are provided)
3. Existing markdown render flow
4. Existing feed/cut

No markdown syntax changes are introduced.

## Public API Changes
Add optional fields to `markdownToEscpos(markdown, options)`:

- `font`: `"A" | "B" | "C"`
- `characterSpacingMm`: `number` (>= 0)
- `lineSpacingMm`: `number` (> 0)
- `leftMarginMm`: `number` (>= 0)
- `printAreaWidthMm`: `number` (> 0)

All fields are optional and global (applied once per receipt generation).

## CLI Changes
Add flags in `src/print-cli.js` and help text:

- `--font=A|B|C`
- `--character-spacing-mm=<number>`
- `--line-spacing-mm=<number>`
- `--left-margin-mm=<number>`
- `--print-area-width-mm=<number>`

CLI validates these values and forwards normalized options to `markdownToEscpos()`.

## ESC/POS Command Mapping
- Font select: `ESC M n`
  - A => `n=0`
  - B => `n=1`
  - C => `n=2`
- Character spacing: `ESC SP n`
- Line spacing: `ESC 3 n`
- Left margin: `GS L nL nH`
- Print area width: `GS W nL nH`

## Unit Conversion
Inputs are in mm and converted internally using TM-T88V practical dot density:

- `dots = round(mm * 8)`

Command clamping:
- 1-byte parameters: `0..255`
- 2-byte parameters: `0..65535`

## Validation Rules
- `font` must be `A`, `B`, or `C` (case-insensitive accepted; normalized uppercase).
- Numeric values must be finite numbers.
- `characterSpacingMm` and `leftMarginMm` must be `>= 0`.
- `lineSpacingMm` and `printAreaWidthMm` must be `> 0`.
- Invalid values fail fast with clear errors.

## Testing Plan
### `tests/markdown-to-escpos.test.js`
- Assert generated payload contains expected bytes for:
  - `ESC M` for fonts A/B/C
  - `ESC SP` for character spacing
  - `ESC 3` for line spacing
  - `GS L` for left margin
  - `GS W` for print area width
- Assert representative mm rounding outcomes.

### `tests/print-cli.test.js`
- Assert new CLI flags are parsed and forwarded as options.
- Assert invalid numeric values and invalid font inputs throw errors.

### Backward compatibility
- Existing behavior remains unchanged when new options/flags are omitted.

## Documentation Updates
Update `README.md` and CLI help with:
- new flags
- corresponding module options
- concise examples
- note that values are in mm

## Risks and Mitigations
- **Printer model variance for Font C**: Some devices may ignore unsupported fonts. Mitigation: document behavior as printer-dependent fallback.
- **Unit mismatch confusion**: Mitigation: explicit mm naming in flags/options and docs.
- **Regression in default output**: Mitigation: retain optional behavior and keep existing tests green.

## Acceptance Criteria
- New module options and CLI flags exist and validate correctly.
- ESC/POS byte sequences for safe-subset controls are emitted correctly.
- Tests cover new behavior and pass.
- README and help text are aligned with implementation.
