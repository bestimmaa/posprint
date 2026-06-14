# Changelog

All notable changes to this project will be documented in this file.

The version history source of truth is git tags in the format `vMAJOR.MINOR.PATCH`.

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
