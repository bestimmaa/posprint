#!/usr/bin/env bash
set -euo pipefail

# Print the commit range to use for the next changelog entry.
# Source of truth: vMAJOR.MINOR.PATCH tags
# Fallback: package.json version + HEAD when tags are missing/incomplete

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required" >&2
  exit 1
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: not inside a git repository" >&2
  exit 1
fi

current_version="$(node -p "require('./package.json').version" 2>/dev/null || true)"
if [[ -z "${current_version}" ]]; then
  echo "ERROR: could not read package.json version" >&2
  exit 1
fi

current_tag="v${current_version}"
semver_re='^v[0-9]+\.[0-9]+\.[0-9]+$'

tags=()
while IFS= read -r line; do
  [[ -n "$line" ]] && tags+=("$line")
done < <(git tag --list 'v*' | grep -E "${semver_re}" | sort -V || true)

find_prev_tag() {
  local target="$1"
  shift || true
  local arr=("$@")

  if [[ ${#arr[@]} -eq 0 ]]; then
    return 1
  fi

  local merged
  merged="$(printf '%s\n' "${arr[@]}" "$target" | sort -V)"
  local prev=""
  while IFS= read -r line; do
    if [[ "$line" == "$target" ]]; then
      if [[ -n "$prev" ]]; then
        printf '%s' "$prev"
        return 0
      fi
      return 1
    fi
    prev="$line"
  done <<< "$merged"

  return 1
}

has_current_tag="false"
if git rev-parse -q --verify "refs/tags/${current_tag}" >/dev/null 2>&1; then
  has_current_tag="true"
fi

prev_tag=""
if [[ ${#tags[@]} -gt 0 ]]; then
  prev_tag="$(find_prev_tag "$current_tag" "${tags[@]}" || true)"
fi

source_of_truth="tags"
range=""
range_note=""

if [[ ${#tags[@]} -eq 0 ]]; then
  source_of_truth="package-json-fallback"
  range="HEAD"
  range_note="No semver release tags found; derive entry from history and package.json version."
elif [[ "$has_current_tag" == "true" ]]; then
  if [[ -n "$prev_tag" ]]; then
    range="${prev_tag}..${current_tag}"
    range_note="Release range from previous tag to current release tag."
  else
    range="${current_tag}"
    range_note="First tagged release; include history up to current tag."
  fi
else
  source_of_truth="tags+package-json-fallback"
  if [[ -n "$prev_tag" ]]; then
    range="${prev_tag}..HEAD"
    range_note="Current package version is not tagged yet; using previous tag to HEAD."
  else
    range="HEAD"
    range_note="No prior lower semver tag found; using HEAD history."
  fi
fi

printf 'CURRENT_VERSION=%s\n' "$current_version"
printf 'CURRENT_TAG=%s\n' "$current_tag"
printf 'PREVIOUS_TAG=%s\n' "${prev_tag:-none}"
printf 'SOURCE_OF_TRUTH=%s\n' "$source_of_truth"
printf 'CHANGELOG_RANGE=%s\n' "$range"
printf 'RANGE_NOTE=%s\n' "$range_note"
printf 'SUGGESTED_LOG_COMMAND=%s\n' "git log --pretty=format:'- %s (%h)' ${range}"
