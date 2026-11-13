#!/usr/bin/env bash
# Print the `pnpm add` specs that install each Pi package at npm `latest`, or
# nothing when there is no new release to test.
#
# Read-only; queries the npm registry. The `pi-ceiling` workflow installs these
# over the pinned devDependencies and runs the typecheck and the test suite, so
# a Pi release that breaks this package is flagged within hours of publication
# instead of at the next devDependency bump (Refs #56, Refs #89).
#
# Prints `<package>@<version>` for each Pi package, space-separated, on one
# line. Prints nothing, and says why on stderr, when:
#
#   - any package's `latest` is younger than pnpm's `minimumReleaseAge`, which
#     pnpm would refuse to install (the next scheduled run retries), or
#   - every package's `latest` equals its devDependency pin, which the `check`
#     job already covers. `--force` prints the specs anyway.
#
# Usage:
#   ./scripts/ci/pi-ceiling-specs.sh [--force]
#
# Exit status is 0 whether or not there is something to test; test the output,
# not the status. A nonzero status means the question could not be answered,
# including a registry answer that is not a version.

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/ci/lib.sh
. scripts/ci/lib.sh

force=false
case "${1:-}" in
  "") ;;
  --force) force=true ;;
  *)
    echo "Usage: $0 [--force]" >&2
    exit 2
    ;;
esac

# Validated before use: the specs reach `pnpm add` and a cache key.
version_pattern='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'

min_age_minutes=$(pnpm config get minimumReleaseAge)
if [[ ! "$min_age_minutes" =~ ^[0-9]+$ ]]; then
  min_age_minutes=0
fi

specs=()
any_unpinned=false
for package in "${PI_PACKAGES[@]}"; do
  latest=$(npm view "$package" version)
  if [[ ! "$latest" =~ $version_pattern ]]; then
    echo "Error: npm reports '$latest' as the latest $package, which is not a version." >&2
    exit 1
  fi

  published=$(npm view "$package" time --json | jq -r --arg version "$latest" '.[$version] // ""')
  age_minutes=$(node -e '
    const published = Date.parse(process.argv[1]);
    console.log(Number.isNaN(published) ? -1 : Math.floor((Date.now() - published) / 60000));
  ' "$published")
  if ((age_minutes < 0)); then
    echo "Error: npm reports no publish time for $package@$latest." >&2
    exit 1
  fi
  if ((age_minutes < min_age_minutes)); then
    echo "$package@$latest is $age_minutes min old, under minimumReleaseAge ($min_age_minutes); not yet installable." >&2
    exit 0
  fi

  pinned=$(jq -r --arg package "$package" '.devDependencies[$package] // ""' package.json)
  if [[ "$latest" != "$pinned" ]]; then
    any_unpinned=true
  fi
  specs+=("$package@$latest")
done

if [[ "$any_unpinned" == false && "$force" == false ]]; then
  echo "npm latest equals the devDependency pins; the check job covers it." >&2
  exit 0
fi

echo "${specs[*]}"
