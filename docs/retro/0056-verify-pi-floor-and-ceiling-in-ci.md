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
