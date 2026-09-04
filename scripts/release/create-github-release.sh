#!/usr/bin/env bash
# Create the GitHub Release for the tag at HEAD, with notes rendered by git-cliff.
#
# release-please created these as a side effect of tagging. With git-cliff the
# tag and the release are separate acts, so this runs after the publish job and
# is the last step of a release (Refs #63).
#
# Required environment variables:
#   GH_TOKEN   GitHub token with contents:write.
#
# Usage:
#   ./scripts/release/create-github-release.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/release/lib.sh
. scripts/release/lib.sh

: "${GH_TOKEN:?Required: set GH_TOKEN}"

git fetch --tags --force origin

tag=$(git tag --points-at HEAD --list "v[0-9]*" | head -1)
if [ -z "$tag" ]; then
  echo "Error: HEAD carries no v* tag, so there is no release to create." >&2
  exit 1
fi

if gh release view "$tag" >/dev/null 2>&1; then
  echo "Release $tag already exists; nothing to do."
  exit 0
fi

notes=$(mktemp)
cliff_args
# `--latest` is the newest tagged release, which is `$tag` because
# prepare-release.sh has already pushed it.
git-cliff "${CLIFF_ARGS[@]}" --latest --strip header > "$notes"

echo "Creating GitHub Release $tag"
gh release create "$tag" --title "$tag" --notes-file "$notes"
