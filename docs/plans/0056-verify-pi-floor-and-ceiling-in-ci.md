---
issue: 56
issue_title: "CI never exercises the >=0.80.8 peer floor, so the floor is an unverified assertion"
---

# Verify the Pi peer floor and the latest Pi release in CI

## Release Recommendation

**Release:** ship independently

The issue is not part of any `docs/architecture.md` roadmap batch.
Every planned commit is `test:` or `ci:` (both skipped by `cliff.toml`) or `docs:` touching only `AGENTS.md` and `.pi/` (excluded by `CLIFF_EXCLUDED_PATHS`), so `./scripts/release/next-version.sh` is expected to print nothing and no release is dispatched.

## Problem Statement

CI runs one `check` job against a frozen lockfile, so it only ever exercises the pinned devDependency version of Pi (1.5.2 today).
That leaves both ends of the supported range unverified:

1. **The floor.** `peerDependencies` claims `>=0.86.0` (raised from the `>=0.80.8` the issue title names in c68eb2e), but no build installs 0.86.0.
   A constant or resolver that holds on the pinned Pi and not on the floor would pass CI and still be wrong for a supported host.
2. **The ceiling.** The drift suites check against whichever Pi is installed, which is always the pinned one.
   Issue [#89] (comment on this issue) is the worked example: Pi 1.5.0 reworded its default prompt on 2026-11-02, OAuth shaping passed the whole prompt through unshaped, and `test/upstream-prompt-drift.test.ts` would have caught it the same day, but only fired eleven days later when a scratch devDep bump happened to run it.

## Goals

- Run the full test suite against the peer floor on every push and pull request, with the floor version read from `package.json` so it follows the next floor raise.
- Run the typecheck and full test suite against npm `latest` once per new Pi release, within roughly two hours of publication, without turning our pull requests red when Pi ships.
- Keep `test/message-thread-drift.test.ts` meaningful at both ends: skipped below pi-ai 1.5.0 (no message threads exist there), never skipped on the pinned or a newer Pi.
- Not breaking: no `src/` change, no published behavior change.

## Non-Goals

- Typechecking at the floor.
  Measured: `tsc --noEmit` against 0.86.0 fails with 6 errors, all `disableContinuation` (Issue [#89] typed the opt-out with pi-ai's own option, which 0.86 does not declare).
  Types newer than the floor are expected; only runtime behavior is in the peer contract.
- Lint or fallow at either end; they do not depend on Pi's version.
- Narrowing the peer range to the tested version (the issue's alternative).
  With the floor verified, the range is honest as written.
- Dependabot for the Pi packages.
  It was offered and not chosen: pnpm's `minimumReleaseAge` has open Dependabot friction (pnpm/pnpm#12450, dependabot/dependabot-core#16375), `pi-packages` deliberately keeps npm out of Dependabot, and a bump that needs code changes (as Issue [#89] did) would sit as a red PR.
- A true release-triggered run.
  GitHub Actions has no trigger for another repository's releases, upstream will not send `repository_dispatch`, and npm retired its registry hooks in July 2024; hourly polling is the closest equivalent.
- Opening a GitHub issue automatically on a ceiling failure; GitHub's failed-scheduled-run email is the notification.
- Pre-push floor runs in `/ship-issue` and `/ship-no-issue` (see Module-Level Changes, predicted unchanged).
- Message-thread support for OAuth (Issue [#90]).

## Background

- `.github/workflows/ci.yml` has one `check` job: `pnpm install --frozen-lockfile`, then `check`, `lint`, `test`, and the fallow gates.
  Measured over the last five `main` runs: about 34 s per run, of which the install step is about 3 s.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 60`, so pnpm refuses any package published in the last hour (`pnpm config get minimumReleaseAge` prints `60`).
- `scripts/release/next-version.sh` is the house style for a read-only derivation script: `set -euo pipefail`, `cd` to the repo root, the answer on stdout, diagnostics on stderr, and "nothing to do" signalled by empty output with exit 0.
- The four drift suites (`upstream-prompt-drift`, `claude-code-version-drift`, `managed-effort-drift`, `message-thread-drift`) read the installed Pi, which is the property both new jobs exploit: swapping the installed version re-targets them with no test edit.
- `test/upstream-prompt-drift.test.ts` already imports an upstream file through a filesystem path (`../node_modules/@earendil-works/pi-coding-agent/dist/...`) to bypass the package `exports` map; the version gate below uses the same technique for `package.json`.
- `higherVersion(baseline, candidate)` in `src/claude-code-version.ts` compares `X.Y.Z` numerically and returns `baseline` on a tie or an unparseable `candidate`; `test/claude-code-version-drift.test.ts` already uses it in a test.
- AGENTS.md constraint: the `bash` tool is zsh, but CI scripts run under `#!/usr/bin/env bash` like `scripts/release/`.

## Design Overview

### How the evidence was produced

All numbers below were measured in a disposable worktree of `HEAD` (`/tmp/floor56`, since removed), not predicted:

| Configuration | Result |
| --- | --- |
| `pnpm add -D` both Pi packages at 0.86.0, fresh tree | installed in 4.3 s (warm store) |
| `vitest run` at 0.86.0, unchanged suite | 258 passed, 2 failed (260) |
| `tsc --noEmit` at 0.86.0 | 6 errors, all `disableContinuation` |
| `vitest run` at 0.86.0 with the version gate prototyped | 257 passed, 3 skipped (260) |
| `vitest run` at 1.5.2 (devDeps) with the gate | 268 passed (268) |
| Prototype ceiling script, pins equal `latest` | empty stdout, reason on stderr, 1.7 s |
| Prototype ceiling script with `--force` | `@earendil-works/pi-ai@1.5.2 @earendil-works/pi-coding-agent@1.5.2` |
| Prototype ceiling script with the pins edited to 1.5.1 | same two specs |

The two floor failures were the control test ("Pi continues an OAuth session's second turn without system") and the API-key test in `test/message-thread-drift.test.ts`: pi-ai 0.86 has no message threads, so there is no `thread` field to observe.
The floor pairing installs `pi-ai@0.86.0` at the top level while `pi-coding-agent@0.86.0` brings its own `pi-ai@0.86.1`; the tests import the top-level copy, which is the literal peer floor.

### Floor job (per push and pull request)

A second job in `ci.yml`, parallel to `check`, so it adds runner time (about 30 s, estimated from the `check` job) but no wall-clock time:

```yaml
floor:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: pnpm/action-setup@v6
    - uses: actions/setup-node@v6
      with: { node-version: 22, cache: pnpm }
    # Installs every dependency, then replaces the two Pi packages with the
    # peer floor.  No typecheck: types newer than the floor are expected.
    - run: pnpm add -D $(./scripts/ci/pi-floor-specs.sh)
    - run: pnpm run test
```

`scripts/ci/pi-floor-specs.sh` reads each Pi package's `peerDependencies` range, requires the form `>=X.Y.Z`, and prints the install specs:

```text
$ ./scripts/ci/pi-floor-specs.sh
@earendil-works/pi-ai@0.86.0 @earendil-works/pi-coding-agent@0.86.0
```

A range in any other form (`^0.86.0`, `>=0.86`) exits 1 with an error naming the package, because silently testing the wrong version is the failure this job exists to prevent.

### Ceiling workflow (hourly poll, once per release)

A new `.github/workflows/pi-ceiling.yml`, triggered by `schedule: cron: "17 * * * *"` and `workflow_dispatch` with a boolean `force` input.
`permissions: contents: read`; `concurrency: pi-ceiling` without cancellation.

Steps:

1. Checkout, `pnpm/action-setup`, `actions/setup-node` (node 22, pnpm cache).
2. **Detect.** `scripts/ci/pi-ceiling-specs.sh [--force]` prints the install specs for each Pi package's npm `latest`, or nothing:
   - nothing when any package's `latest` is younger than `pnpm config get minimumReleaseAge` minutes (pnpm would refuse it; the next hourly run retries);
   - nothing when every package's `latest` equals its devDependency pin, unless `--force` (the `check` job already covers that version);
   - otherwise the specs, with each version validated against `^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$` so a malformed registry answer exits 1 rather than reaching a shell.

   The step writes `specs` and a cache `key` (`pi-ceiling-` plus the specs with spaces, `/`, and `@` mapped to `_`, `-`, and `-`) to `$GITHUB_OUTPUT`.
   Inputs reach the script through `env:`, not `${{ }}` interpolation inside `run:`.
3. **Dedupe.** `actions/cache/restore@v6` with `lookup-only: true` on that key, skipped when `force` is set.
   A hit means this release was already tested; every later step is skipped and the run is green.
4. **Run** (only when specs are non-empty and the lookup missed or `force` is set): `pnpm add -D <specs>`, `pnpm run check`, `pnpm run test`.
5. **Mark.** With `if: always()` and the same run condition, write a marker file and `actions/cache/save@v6` it under the key.
   Pass or fail, each release is tested once, so a red result sends one failure email rather than one per hour.
   A cache entry is evicted after 7 days without access; while `latest` is still ahead of the pin, that re-tests the release about weekly, which reads as a reminder.

```text
$ ./scripts/ci/pi-ceiling-specs.sh            # today: latest 1.5.2 equals the pins
latest equals the devDependency pins; the check job covers it.     (stderr)
$ ./scripts/ci/pi-ceiling-specs.sh --force
@earendil-works/pi-ai@1.5.2 @earendil-works/pi-coding-agent@1.5.2
```

A no-op hourly run costs about 10 s of runner time (estimated: checkout, setup, a 1.7 s measured detect, and a cache lookup); a real run about 40 s, once per release (estimated from the `check` job).
GitHub sends a scheduled run's failure to the user who last edited the cron line.

### Version gate in `test/message-thread-drift.test.ts`

```typescript
import piAiPackage from "../node_modules/@earendil-works/pi-ai/package.json" with { type: "json" };

// pi-ai 1.5.0 introduced Anthropic message threads; below it there is no
// continuation to opt out of.  Fails open: `higherVersion` returns its
// baseline for an unparseable candidate, so a prerelease or malformed
// version runs the suite rather than skipping it.
const PI_HAS_MESSAGE_THREADS =
  higherVersion(piAiPackage.version, "1.5.0") === piAiPackage.version;

describe.skipIf(!PI_HAS_MESSAGE_THREADS)("Anthropic message threads", () => { ... });
```

The argument order is load-bearing, and was measured across eight inputs:

| Installed | `higherVersion(installed, "1.5.0") === installed` | Reverse order |
| --- | --- | --- |
| 0.86.0, 1.4.9 | false (skip) | false |
| 1.5.0, 1.5.2, 2.0.0 | true (run) | true |
| 1.5.0-rc.1, 1.6.0-beta.1, garbage | true (run, fail open) | false (silent skip) |

The reverse order fails closed: a prerelease Pi would silently skip the alarm.
The `tidy-first-assessor` recommended the reverse order; the measurement above overrules it.

The `"1.5.0"` threshold is a literal fact about pi-ai, so it lives in the test next to its comment, not in `src/`.

## Module-Level Changes

1. `test/message-thread-drift.test.ts`: import `higherVersion` and the installed pi-ai `package.json`; add `PI_HAS_MESSAGE_THREADS`; `describe` becomes `describe.skipIf(!PI_HAS_MESSAGE_THREADS)`; extend the file's header comment to say why the suite skips below 1.5.0.
2. `scripts/ci/pi-floor-specs.sh` (new): the floor derivation described above.
3. `.github/workflows/ci.yml`: add the `floor` job.
4. `scripts/ci/pi-ceiling-specs.sh` (new): the ceiling derivation described above.
5. `.github/workflows/pi-ceiling.yml` (new): the ceiling workflow.
6. `AGENTS.md`:
   - the "Fallow runs in CI" paragraph under Commands gains a sentence on the `floor` job and the `pi-ceiling` workflow, including the kill criterion (see Open Questions);
   - Coverage areas item 10 (`upstream-prompt-drift`): "It verifies only the installed wording" now also holds at the floor (the `floor` job) and at `latest` (`pi-ceiling`);
   - Coverage areas item 15 (`message-thread-drift`): note the skip below pi-ai 1.5.0.
7. `.pi/skills/upstream-watch/SKILL.md`: the prompt-wording row's "`test/upstream-prompt-drift.test.ts` alarms only once the devDeps reach the new Pi" becomes "the `pi-ceiling` workflow runs it against each new Pi release within about two hours"; the Impact classes table's Compile-time detector gains the `pi-ceiling` typecheck.
8. `.pi/prompts/upstream-impact.md`: one line telling the assessor to start from the `pi-ceiling` run for the release, if one exists (`gh run list --workflow pi-ceiling.yml`).

Predicted unchanged, with the claim each rests on:

- `src/` (all files): the change is CI and test-gating only.
- `test/upstream-prompt-drift.test.ts`, `test/claude-code-version-drift.test.ts`, `test/managed-effort-drift.test.ts`: measured green at 0.86.0 unchanged.
- `.pi/prompts/ship-issue.md`, `.pi/prompts/ship-no-issue.md`: `ci_watch` watches the whole `ci` run, so a red `floor` job already fails step 4; the pre-push mirror stays at the pinned version because the floor run needs a scratch tree.
- `README.md`: its CI badge reads `ci.yml`'s overall status, which now includes `floor`; no CI prose to update.
- `docs/architecture.md`: line 161's description of the thread alarm stays true at every version that has threads; nothing describes CI.
- `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`: the jobs mutate them only inside the runner.

## Test Impact Analysis

1. New tests enabled: none are added; the existing 260 floor-applicable tests now run against 0.86.0, and all 268 against each new `latest`.
2. Redundant tests: none.
3. Unchanged tests: everything except the thread suite's gate.

The shell scripts' testable surface is their output, dry-run at planning time against a prototype (table in Design Overview).
`/tdd-plan` re-runs each as verification:

| Command | Expected |
| --- | --- |
| `./scripts/ci/pi-floor-specs.sh` | `@earendil-works/pi-ai@0.86.0 @earendil-works/pi-coding-agent@0.86.0`, exit 0 |
| same, with one peer range edited to `^0.86.0` | error naming the package on stderr, exit 1 |
| `./scripts/ci/pi-ceiling-specs.sh` | empty stdout, a reason on stderr, exit 0 (while `latest` is 1.5.2) |
| `./scripts/ci/pi-ceiling-specs.sh --force` | the two `@1.5.2` specs |
| same, with both devDependency pins edited to 1.5.1 | the two `@1.5.2` specs |

If npm `latest` has moved past 1.5.2 by implementation time, the third row prints the new specs instead; record what it printed.

## Invariants at risk

1. **The thread alarm still runs on the pinned Pi** (Issue [#89]; constituency: anyone bumping devDeps, who relies on it to catch a dropped billing header).
   A gate written wrong skips silently and CI stays green.
   Baseline measured: `pnpm test` reports `268 passed (268)` with no `skipped`; the gate step must reproduce exactly that.
2. **The thread alarm still fails loudly on a newer Pi** (constituency: the `pi-ceiling` run).
   Pinned by the fail-open argument order, measured above for prereleases and malformed versions.
3. **The `check` job is unchanged** (constituency: every push).
   `floor` is a separate job, so the frozen-lockfile install, lint, and fallow gates are untouched; verify by diff.

## TDD Order

1. **Gate the message-thread suite on pi-ai having threads.**
   Test surface: `test/message-thread-drift.test.ts`.
   Red: in a scratch worktree with the floor installed (`pnpm add -D` the two `@0.86.0` specs), the unchanged suite shows 2 failures; green: the gated suite shows `257 passed | 3 skipped (260)`.
   Then on the devDeps: `pnpm test` shows `268 passed (268)`, no skips; `pnpm run check` and `pnpm run lint` pass.
   Killing mutations:
   - change `"1.5.0"` to `"0.0.0"` in the gate: the floor tree reds the control and API-key tests again (gate does nothing);
   - change `"1.5.0"` to `"9.0.0"`: on the devDeps the summary shows `3 skipped` (the invariant 1 failure mode, visible only in the count, which is why the count is the verification);
   - swap the `higherVersion` arguments: no change at 0.86.0 or 1.5.2, so this one is pinned by the eight-input table above, not by the suite; re-run that table in a disposable test and record the output.

   Commit: `test: skip the message-thread alarm on Pi releases without threads`
2. **Floor job.**
   Add `scripts/ci/pi-floor-specs.sh` (executable) and the `floor` job.
   Verify: the two floor rows of the script table; in a scratch worktree, `pnpm add -D $(./scripts/ci/pi-floor-specs.sh) && pnpm run test` gives `257 passed | 3 skipped`; `actionlint .github/workflows/ci.yml` passes (installed at `/opt/homebrew/bin/actionlint`; it also runs shellcheck over `run:` blocks).
   Killing mutation: point the job at the devDeps by replacing the `pnpm add` line with `pnpm install --frozen-lockfile`; the scratch run then shows 268 tests, not 260, so the test count is the evidence the floor was actually installed.
   Commit: `ci: run the test suite against the Pi peer floor`
3. **Ceiling workflow.**
   Add `scripts/ci/pi-ceiling-specs.sh` (executable) and `.github/workflows/pi-ceiling.yml`.
   Verify: the three ceiling rows of the script table, plus a version-validation probe (run the validation function against `1.5.2; rm -rf /` and confirm exit 1); `actionlint .github/workflows/pi-ceiling.yml` passes.
   The end-to-end check happens after push (a `workflow_dispatch` only works once the file is on the default branch): `gh workflow run pi-ceiling.yml -f force=true`, then `ci_find`/`ci_watch` with workflow `pi-ceiling`; expect the run step to typecheck and pass 268 tests at 1.5.2 and the mark step to save the cache entry.
   Then dispatch once without `force` and expect the detect step to print nothing and the run to finish green in seconds.
   Commit: `ci: test each new Pi release once, within two hours of publication`
4. **Docs.**
   `AGENTS.md`, `.pi/skills/upstream-watch/SKILL.md`, `.pi/prompts/upstream-impact.md` as listed in Module-Level Changes.
   Verify: `pnpm run lint` and `pnpm exec rumdl check .pi`.
   Commit: `docs: document the floor job and the pi-ceiling workflow`

## Risks and Mitigations

1. **`pnpm add` behaves differently under `CI=true`.**
   pnpm defaults `install` to `--frozen-lockfile` in CI; `add` was only measured locally.
   Mitigation: the first push shows it; if `add` refuses, use `pnpm add --no-frozen-lockfile`.
2. **A fresh transitive dependency trips the age gate on a ceiling install.**
   A Pi release can pull a third-party package published under an hour earlier, and pnpm then fails the install.
   The marker is saved anyway, so this costs one false alarm; re-run with `force` once the dependency ages.
3. **Cache-key characters.**
   GitHub rejects keys containing commas; the specs are mapped to `_`/`-` before use, so no raw `@`, `/`, or space reaches the key.
4. **Script injection through registry data.**
   The ceiling script validates every version against a strict pattern before printing it, and the workflow passes values through `env:`.
5. **The scheduled workflow is disabled after 60 days of repository inactivity.**
   This repository commits far more often; if it goes quiet, the floor job is unaffected and the ceiling can be re-enabled from the Actions tab.
6. **A ceiling failure that nobody fixes keeps re-testing weekly** (cache eviction).
   Accepted: it reads as a reminder, and the fix is the devDep bump the failure asked for.

## Open Questions

1. **Kill criterion (from the issue).**
   If the `floor` job catches nothing across the next few Pi minor bumps, it costs runner time for nothing and should be removed rather than kept for symmetry.
   The `pi-ceiling` workflow has a cheaper no-op path, so the same review should judge it on false alarms rather than cost.
   Recorded in the `AGENTS.md` CI paragraph so a later retro can apply it.
2. Whether the floor job should also typecheck `src/` alone, once the floor rises past 1.5.0 and `disableContinuation` exists there.
   Defer until a floor raise makes it pass.

[#89]: https://github.com/gotgenes/pi-anthropic-auth/issues/89
[#90]: https://github.com/gotgenes/pi-anthropic-auth/issues/90
