#!/usr/bin/env bash
# Version, changelog, commit, tag, and push a release.
#
# Run by the `release.yml` workflow. Commits and pushes to main, so it refuses to
# run outside CI unless told otherwise — the read-only half of this pair is
# `scripts/release/next-version.sh`, which is the one to run in a working
# checkout (Refs #63).
#
# The version is derived before anything is written, so a run with nothing to
# release fails before the first mutation rather than after it.
#
# Optional environment variables:
#   EXPECTED_SHA      If set, asserts HEAD matches before proceeding. Guards
#                     against main moving between the caller deriving a SHA and
#                     this run.
#   ALLOW_LOCAL_PUSH  Set to 1 to run outside CI deliberately.
#
# Outputs (via $GITHUB_OUTPUT when available):
#   tag   The tag created, e.g. "v2.0.7"
#   sha   The release commit. Downstream jobs check this out rather than `main`,
#         which another push could move past between jobs.
#
# Usage:
#   ./scripts/release/prepare-release.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/release/lib.sh
. scripts/release/lib.sh

if [ -z "${CI:-}" ] && [ -z "${ALLOW_LOCAL_PUSH:-}" ]; then
  echo "Error: this script commits and pushes to main, and CI is not set." >&2
  echo "       To see what would release without changing anything, run:" >&2
  echo "         ./scripts/release/next-version.sh" >&2
  echo "       To push from here anyway, re-run with ALLOW_LOCAL_PUSH=1." >&2
  exit 1
fi

if [ -n "${EXPECTED_SHA:-}" ]; then
  actual=$(git rev-parse HEAD)
  if [ "$actual" != "$EXPECTED_SHA" ]; then
    echo "Error: HEAD ($actual) does not match expected SHA ($EXPECTED_SHA)." >&2
    echo "       main moved since the release was requested. Aborting." >&2
    exit 1
  fi
  echo "SHA guard passed: HEAD is $EXPECTED_SHA"
fi

# Splice a rendered release section into CHANGELOG.md below its header.
#
# The insertion point is the first line that opens a release section or the
# release-please era marker, so the newest release always lands directly under
# the header and the marker stays put at the migration boundary.
#
# Regenerating the whole file is not an option: the entries below the marker were
# produced under a different exclusion set, and a full regeneration would
# silently rewrite released history.
insert_release_section() {
  local file=$1 section=$2 tmp line
  tmp=$(mktemp)

  line=$(grep -n -m1 -E '^(## |<!-- )' "$file" | cut -d: -f1)
  if [ -z "$line" ]; then
    line=$(($(wc -l < "$file") + 1))
  fi

  head -n "$((line - 1))" "$file" > "$tmp"
  # Drop the section's leading blank lines and guarantee exactly one trailing
  # blank, so the spacing matches the entries already in the file.
  sed '/./,$!d' "$section" >> "$tmp"
  printf '\n' >> "$tmp"
  tail -n +"$line" "$file" >> "$tmp"

  mv "$tmp" "$file"
}

# ── Derive the version before writing anything ───────────────────────────────

tag=$(./scripts/release/next-version.sh)
if [ -z "$tag" ]; then
  echo "Error: nothing to release." >&2
  echo "       No commit since $(latest_tag) maps to a releasable type." >&2
  exit 1
fi

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Error: tag $tag already exists." >&2
  exit 1
fi

# `--bumped-version` prints the prefixed tag; package.json needs the bare
# SemVer. Getting this wrong writes "v2.0.7" into the manifest.
version=${tag#v}
echo "Will release $tag"

# ── Write the version and the changelog ──────────────────────────────────────

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

tmp=$(mktemp)
jq --arg v "$version" '.version = $v' package.json > "$tmp"
mv "$tmp" package.json

# `--tag` pins the version derived above rather than letting git-cliff bump
# again, so the changelog and the tag cannot disagree.
cliff_args
section=$(mktemp)
git-cliff "${CLIFF_ARGS[@]}" --tag "$tag" --unreleased --strip header > "$section"
insert_release_section CHANGELOG.md "$section"
rm -f "$section"

# ── Commit, tag, push ────────────────────────────────────────────────────────

git add package.json CHANGELOG.md
git commit -m "chore(release): $version"
git tag -a "$tag" -m "Release $tag"

echo "Pushing release commit and tag $tag..."
git push origin HEAD:main "$tag"

echo "Released: $tag"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "tag=$tag"
    echo "sha=$(git rev-parse HEAD)"
  } >> "$GITHUB_OUTPUT"
fi
