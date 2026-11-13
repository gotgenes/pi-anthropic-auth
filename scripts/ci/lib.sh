#!/usr/bin/env bash
# Shared definitions for the scripts in scripts/ci/. Source this file; do not run it.

# The Pi packages this package peers on. CI installs each at its peer floor
# (`floor` job) and at npm `latest` (`pi-ceiling` workflow).
# shellcheck disable=SC2034 # read by the sourcing scripts
PI_PACKAGES=(
  "@earendil-works/pi-ai"
  "@earendil-works/pi-coding-agent"
)
