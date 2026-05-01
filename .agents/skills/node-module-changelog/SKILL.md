---
name: node-module-changelog
description: Use when preparing a Node.js module release before npm version, to confirm major/minor/patch, compute the next version, and update CHANGELOG.md without editing existing release sections.
---

# Node Module Changelog

## Goal
Prepare `CHANGELOG.md` **before** running `npm version <type>`.

- Version-history source of truth: tags `vMAJOR.MINOR.PATCH`
- Fallback when tags are missing/incomplete: `package.json` version
- No `Unreleased` section

## Required Behavior
- Always ask the user to choose release type: `major`, `minor`, or `patch`.
- Assume upcoming release notes are based on `LAST_TAG..HEAD`.
- Compute the **next version** from the selected type.
- Build a complete release view from version history (`vMAJOR.MINOR.PATCH` tags + `LAST_TAG..HEAD` for next version).
- **Never modify existing release sections** already present in `CHANGELOG.md`.
- Only add missing tagged sections and recreate/update the next-version section.

## Workflow
1. Collect valid semver tags and sort them ascending:
   ```bash
   git tag --list 'v*' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V
   ```
2. Ask user to confirm bump type (`major`/`minor`/`patch`).
3. Compute expected next version from latest version + bump type.
4. Build release notes for **every tagged version** using tag ranges:
   - for each adjacent pair: `PREV_TAG..TAG`
   - for first tag: history up to that tag
   ```bash
   git log --pretty=format:'- %s (%h)' PREV_TAG..TAG
   ```
5. Build upcoming release notes for next version from:
   ```bash
   git log --pretty=format:'- %s (%h)' LAST_TAG..HEAD
   ```
6. Update `CHANGELOG.md` to ensure it contains:
   - all tagged versions (add only sections that are missing)
   - the new upcoming release section for computed next version (replace/recreate this section only)
   - existing historical sections remain unchanged verbatim
   ```md
   ## [MAJOR.MINOR.PATCH] - YYYY-MM-DD
   ### Added
   - ...

   ### Changed
   - ...

   ### Fixed
   - ...
   ```
7. Tell user to run the exact matching bump command:
   ```bash
   npm version <confirmed-type> --no-git-tag-version
   ```
   Then commit version files + updated changelog together.

## Style Rules
- Keep entries concise and user-relevant.
- Do not include process metadata (ranges, commands, generated-by notes) inside release entries.
- Never add or maintain an `Unreleased` section.

## Fallback Rule
If no valid semver tags exist:
- Use `package.json` current version as baseline
- Compute next version from that baseline + confirmed bump type
- Use available history up to `HEAD` for notes
