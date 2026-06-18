---
description: Push, verify CI, and merge the release-please PR (no issue to close)
---

# Ship (no issue)

## 1. Sync with remote

Before pushing, make sure local `HEAD` is current with the remote:

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure to the user.
   Do not attempt to stash, rebase, force, or otherwise resolve.
3. Only proceed once the pull reports a clean fast-forward (or `Already up to date.`).

## 2. Pre-push checks

Mirror what CI runs (`.github/workflows/ci.yml` runs these on every push and PR):

1. `pnpm run check` — typecheck.
2. `pnpm run lint` — biome, eslint, and rumdl.
3. `pnpm test` — the vitest suite.

If any fails, fix the issues and commit before pushing.
Optionally run `pnpm fallow:dead-code` for dead-code hygiene — it is not a CI gate here, so do not block the push on pre-existing fallow findings.

## 3. Push

- Determine the current branch (`git branch --show-current`).
- `git push`.
- If the push is rejected as non-fast-forward, stop and report — do not force-push.

## 4. Verify CI on the pushed commit

1. Use `ci_find` with the pushed SHA (`git rev-parse HEAD`) and workflow `ci` to locate the CI run.
2. Use `ci_watch` with the returned `run_id` and workflow `ci` to wait for it to complete.
3. If the run conclusion is `failure`, stop and report.
   Do not merge anything.
4. If it lands `success`, continue.

## 5. Merge release-please PR (if present)

This repo is a single package, so release-please opens a single repo-wide release PR (tagged `vX.Y.Z`).

1. Use `release_pr_find` to locate an open release-please PR.
2. If none is found (timeout), skip to step 6.
3. If one exists, use `release_pr_merge` with the PR number.
   - Note: release-please PRs typically have **no CI runs** because PRs created by the default `GITHUB_TOKEN` do not trigger workflows.
     This is expected; do not block on it.
   - If `release_pr_merge` returns an error (not mergeable), stop and report — let the user decide.
   - Exception: if it fails with `merge_state: UNSTABLE`, check `gh pr view <N> --json statusCheckRollup`.
     An empty rollup means no checks ran — the `GITHUB_TOKEN` case above; merge with `gh pr merge <N> --rebase` so the release lands as a linear commit, then `git pull --ff-only`.
     Stop and report only when the PR is genuinely blocked (`CONFLICTING`/`DIRTY`/`BEHIND` or a failing check).
4. Use `release_watch` to wait for the release tag to land on HEAD.

## 6. Final report

Print:

- The new HEAD on `main` (`git log --oneline -1`).
- The released version, if a release commit just landed (`git tag --points-at HEAD` or read `package.json`).
- Anything that was skipped and why.

## Constraints

- Never force-push.
- Never merge a release-please PR that is genuinely blocked (`CONFLICTING`/`DIRTY`/`BEHIND` or a failing check); an `UNSTABLE` state from no checks running is the expected `GITHUB_TOKEN` case (step 5.3).
- If CI fails, do not merge anything.
- If multiple release-please PRs exist, stop and ask — that's a configuration issue, not a normal merge.
