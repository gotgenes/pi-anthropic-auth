#!/usr/bin/env bash
# Print the `pnpm add` specs that install each Pi package at its peer floor.
#
# Read-only and offline. CI's `floor` job installs these over the pinned
# devDependencies and runs the test suite, so the `peerDependencies` floor is a
# version a build actually exercises rather than an assertion (Refs #56).
#
# Prints `<package>@<version>` for each Pi package, space-separated, on one
# line. Diagnostics go to stderr.
#
# Usage:
#   pnpm add -D $(./scripts/ci/pi-floor-specs.sh)
#
# A peer range not of the form `>=X.Y.Z` exits 1: testing some other version
# while reporting the floor as verified is the failure this exists to prevent.

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/ci/lib.sh
. scripts/ci/lib.sh

specs=()
for package in "${PI_PACKAGES[@]}"; do
  range=$(jq -r --arg package "$package" '.peerDependencies[$package] // ""' package.json)
  if [[ ! "$range" =~ ^\>=([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    echo "Error: the peer range for $package is '$range', not >=X.Y.Z," >&2
    echo "       so its floor cannot be installed." >&2
    exit 1
  fi
  specs+=("$package@${BASH_REMATCH[1]}")
done

echo "${specs[*]}"
