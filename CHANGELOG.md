# Changelog

All notable changes to this project will be documented in this file.

The version history source of truth is git tags in the format `vMAJOR.MINOR.PATCH`.

## [0.3.0] - 2026-09-27

### Added

- Added GFM table rendering as aligned monospace columns fitted to `charsPerLine`, with column alignment, a bold header row, and wrapping of long cells.
- Added the `{{row:<left>|<right>|fill=<char>}}` shortcode for left/right aligned receipt lines such as item and price.
- Added reading markdown from stdin, with `--markdown-file=-` or implicitly when input is piped and no input flag is given.
- Added direct raw TCP printing to network printers via `tcp://host[:port]` printer URIs (default port 9100) on all platforms.
- Added `--preview` to render a framed plain-text preview of the ESC/POS payload without printing, and the `previewEscpos` module export.
- Added `--status` and `--check-status` to query real-time printer status (cover open, paper end, paper near end, errors) over `tcp://` printer URIs, and the `getPrinterStatus` module export.

### Fixed

- Fixed GFM tables being silently dropped from the output.
- Fixed tight lists printing a blank line after every item.

## [0.2.5] - 2026-06-15

### Added

- Added Epson TM-T88V CUPS setup guide (`PRINTER_SETUP.md`) covering macOS, Linux, and Windows USB configurations.
- Added CI build status and npm version badges to README.

### Changed

- Surfaced platform compatibility and printer setup links at the top of README for faster onboarding.
- Release workflow now restricted to `main` branch only.

## [0.2.4] - 2026-06-14

### Added

- Added public module API and release workflow guides.
- Added a supported printers reference for ESC/POS compatibility validation.
- Added CLI warnings when code page conversion falls back to `?` for unsupported characters.

### Changed

- Published package metadata and documentation now use the scoped package name `@bestimmaa/posprint`.
- Expanded `cp437`, `cp850`, `cp858`, and `cp1252` text conversion coverage.
- Preserved supported degree-sign output instead of rewriting it to `deg`.
- Streamlined README content for public install and usage workflows.

### Fixed

- Fixed direct IPP/IPPS printer URI jobs to declare CUPS raw document format.
- Fixed CI and packaging workflow compatibility for current GitHub Actions and scoped npm tarballs.

## [0.2.3] - 2026-05-23
### Added
- Added direct IPP/IPPS printer URI printing support on Windows.
- Added validated `--printer-uri` handling in the CLI for direct network printer targets.
### Changed
- Improved cross-platform printer URI handling across local and direct printer paths.
### Fixed
- Fixed italic markdown rendering with smart quotes and related text normalization behavior.
- Improved validation and error handling for printer URI input and strict markdown mode.

## [0.2.2] - 2026-05-01

### Changed

- Centralized printer URI handling and backend metadata.
- Streamlined internal IPP printing flow.
- Added release helper tooling groundwork.

## [0.2.1] - 2026-05-01

### Changed

- Refreshed repository guidance and changelog/versioning policy documentation.

## [0.2.0] - 2026-05-01

### Added

- Initial tagged package release baseline.
