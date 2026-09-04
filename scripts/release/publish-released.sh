#!/usr/bin/env bash
# Publish the package to npm when HEAD carries a release tag.
#
# Replaces the release-please variant, which was gated on the action's
# `release_created` output. `prepare-release.sh` tags the release commit, so git
# itself says whether this checkout is a release — no action output to plumb
# (Refs #63).
#
# Refusing on an untagged HEAD is deliberate: it keeps a stray dispatch or a
# re-run against the wrong ref from publishing a tree that was never released.
#
# Usage:
#   ./scripts/release/publish-released.sh

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/release/lib.sh
. scripts/release/lib.sh

# The tag was created by a previous job on a different runner, so it is not in
# this checkout until fetched.
git fetch --tags --force origin

tag=$(git tag --points-at HEAD --list "v[0-9]*" | head -1)
if [ -z "$tag" ]; then
  echo "Error: HEAD carries no v* tag, so there is nothing to publish." >&2
  exit 1
fi

version=${tag#v}
pkgver=$(package_json_version)
if [ "$version" != "$pkgver" ]; then
  echo "Error: tag $tag disagrees with package.json version $pkgver." >&2
  exit 1
fi

name=$(jq -r '.name' package.json)

echo "::group::Publishing $name@$version from $tag"
pnpm publish --access public --no-git-checks --provenance
echo "::endgroup::"
