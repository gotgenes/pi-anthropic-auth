#!/usr/bin/env bash
# Print the tag this package would release right now, or nothing if it would not.
#
# Read-only and offline. This is the question release-please could never answer
# locally: it derived versions over the GitHub API, so "what would release?"
# required a CI run and an open pull request. git-cliff reads tags and local
# history, so the answer is available in a working checkout in under a second
# (Refs #63).
#
# Prints `v<version>` to stdout when there is something to release, and nothing
# at all when there is not. Diagnostics go to stderr.
#
# Usage:
#   ./scripts/release/next-version.sh
#
# Exit status is 0 whether or not a release is pending; test the output, not the
# status. A nonzero status means the question could not be answered.

set -euo pipefail

cd "$(dirname "$0")/../.."
# shellcheck source=scripts/release/lib.sh
. scripts/release/lib.sh

current=$(latest_tag)
if [ -z "$current" ]; then
  # No tag means this package has never released. git-cliff cannot derive a
  # first version here — it falls back to `0.1.0` and then rejects it for not
  # matching the tag pattern — so refuse rather than invent one.
  echo "Error: no v* tag exists, so this package has never released." >&2
  echo "       Publish and tag the first version by hand, then this script" >&2
  echo "       takes over." >&2
  exit 1
fi

cliff_args

# git-cliff prints the *current* version, plus a "nothing to bump" warning on
# stderr, when no releasable commit has landed since the last tag.
next=$(git-cliff "${CLIFF_ARGS[@]}" --bumped-version 2>/dev/null)

if [ -z "$next" ]; then
  echo "Error: git-cliff produced no version." >&2
  exit 1
fi

if [ "$next" = "$current" ]; then
  echo "Nothing to release (at $current)." >&2
  exit 0
fi

printf '%s\n' "$next"
