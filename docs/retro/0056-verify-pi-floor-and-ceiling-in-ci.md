---
issue: 56
issue_title: "CI never exercises the >=0.80.8 peer floor, so the floor is an unverified assertion"
---

# Retro: #56 — CI never exercises the >=0.80.8 peer floor, so the floor is an unverified assertion

## Stage: Planning (2026-11-13T03:24:39Z)

### Session summary

Planned a 4-step change: gate `test/message-thread-drift.test.ts` on pi-ai >=1.5.0, add a `floor` job to `ci.yml` that runs the suite at the `peerDependencies` floor, add an hourly `pi-ceiling` workflow that typechecks and tests each new npm `latest` once, and document both.
The operator chose floor plus ceiling, `tsc` plus the full suite at the ceiling, and an hourly poll deduplicated per release by a cache marker.

### Observations

- The issue is stale on its numbers: the floor is `>=0.86.0` since `c68eb2e`, and the devDeps are 1.5.2, which also equals npm `latest` today.
- Measured in a scratch worktree, not predicted:
  - at 0.86.0 the unchanged suite is 258 passed, 2 failed, both in the thread alarm (no threads before pi-ai 1.5.0);
  - with the gate prototyped, it is 257 passed, 3 skipped, while the devDeps stay at 268 passed;
  - `tsc` at the floor fails with 6 `disableContinuation` errors, so the floor job runs tests only.
- The issue's "doubles install time" concern does not hold: the CI install step is about 3 s and the whole `check` job about 34 s, and the new job runs in parallel.
- The operator asked whether the ceiling could trigger on Pi's releases.
  It cannot directly: GitHub has no cross-repository release trigger, and npm retired registry hooks in July 2024.
  Dependabot was offered and declined (pnpm `minimumReleaseAge` friction, `pi-packages` keeps npm out of it).
- The `tidy-first-assessor` recommended no preparatory commits, but its suggested `higherVersion` argument order was the fail-closed one.
  An eight-input measurement showed `higherVersion(installed, "1.5.0") === installed` fails open on prereleases, so the plan uses that order and records the table.
- `pyyaml` is not installed locally; `actionlint` is, so the plan verifies workflows with it.

## Stage: Implementation — TDD (2026-11-13T03:35:27Z)

### Session summary

All 4 TDD steps landed as planned (`854c8f2`, `80d91a8`, `6e32c39`, `8f41ca2`), plus one `ci:` fix for reviewer findings (`6215e6a`) and a plan-alignment `docs:` commit (`a375245`).
The pinned suite stays at 268 passed with no skips; the floor run is 257 passed and 3 skipped (260).
`next-version.sh` prints nothing to release.

### Observations

- Every planned mutation behaved as predicted: `"0.0.0"` reddened the 2 floor tests, `"9.0.0"` showed only as `3 skipped` on the pins, and the eight-input argument-order table reproduced.
- The first mutation's green copy was captured in the same tool batch as the mutating `Edit`, so `/tmp/green.ts` held the mutation; caught by `diff` returning 0, and restored by hand.
  The prompt's warning about running the `cp` alone is real.
- Deviation: the Pi package list lives in `scripts/ci/lib.sh`, mirroring `scripts/release/lib.sh`, so both scripts share it.
- Plan Risk 1 (`pnpm add` under `CI=true`) was retired locally: `CI=true pnpm add -D` at the floor works and the suite gives 257/3.
- The ceiling script's version validation was probed through a `PATH`-shimmed `npm` returning `1.5.2; rm -rf /`: exit 1 with an error.
  The age gate was probed with `npm_config_minimum_release_age=100000`.
- Pre-completion reviewer: WARN, then WARN on the delta.
  Fixed: the marker steps used `always()`, which marks a cancelled run as tested (now `${{ !cancelled() && ... }}`; a bare leading `!` is a YAML tag, so the `${{ }}` wrapper is required), and a forced run inside the release-age window now emits a `::warning::`.
  Accepted: a transient install failure marks a release tested (re-test with `force`), and whether `lookup-only` restores refresh cache access time is unverified, so the plan no longer claims weekly re-tests.
- Not yet verified: neither workflow has run on GitHub.
  `/ship-issue` should watch the `floor` job on the push, then `gh workflow run pi-ceiling.yml -f force=true` (expect typecheck plus 268 tests at 1.5.2 and a saved marker) and one unforced dispatch (expect a green no-op).
