---
description: Push, close a GitHub issue with a summary, and merge the release-please PR
---

# Ship the implementation

Argument: `$1` is the issue number that was just implemented.

Fetch the issue title via `gh issue view $1 --json title -q .title`, then call `set_session_name` with name `#$1 Ship — <issue title>` to identify this session in the session selector.

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

1. Run `git rev-parse HEAD` to capture the full 40-char SHA.
   Pass that exact value to `ci_find` — never hand-expand the short SHA from the `git push` output, and never type a SHA from memory.
2. Use `ci_find` with that SHA and workflow `ci` to locate the CI run.
3. Use `ci_watch` with the returned `run_id` and workflow `ci` to wait for it to complete.
4. If the run conclusion is `failure`, stop and report.
   Do not close the issue or merge anything.
5. If it lands `success`, continue.

## 4b. Check for a stacked release

First check the unreleased range for a releasing commit: `git log --oneline <last-tag>..HEAD`.
If every commit is a non-releasing type (`refactor:`/`docs:`/`style:`/`chore:`/`test:` — no `feat`/`fix`/`!`/`BREAKING CHANGE`), release-please will cut nothing now; the work auto-batches until a `feat`/`fix` lands.
Say so in the final report and skip the batch-vs-release question.

If the plan frames this issue as part of a multi-issue sequence (e.g. "step N of M", a phased roadmap, or a lift-and-shift with sibling `#M` issues), ask the user once whether to release now or batch the release until the sequence completes.
If batching: stop here — the push and CI are done; leave the issue open and skip steps 5–6.
Note the deferral in the final report.

## 4c. Create planned follow-up issues

If the plan or its retro defers work to a follow-up issue ("created at ship time", "deferred to a follow-up"), create it now with `gh issue create` before closing — the shipped issue's close comment should reference its number.
Skip if the plan names no deferred follow-up.

## 5. Close the issue

Build the close comment from the commits since the previous release:

```bash
git log --oneline <previous-tag-or-base>..HEAD
```

The comment should include:

- The commit hash that lands the change ("Implemented in <sha> …").
  Write the SHA as plain text — no backticks — so GitHub auto-links it to the commit.
- A short bullet list of feature/breaking commits.
- One sentence on user-visible behavior change.
- A note flagging any breaking change (matches `feat!:` commits).
- If the change unblocks or partially addresses other issues, mention them.

Then use `issue_close` with issue number `$1` and the summary as the comment.

Then check whether this push shipped work for **other** issues (a stacked refactor/enabler, other `(#M)` commit refs, or sibling `docs/plans/`/`docs/retro/` files in the `<previous-tag-or-base>..HEAD` range).
Close each with its own short summary — release-please omits `refactor:` commits from the changelog, so a stacked refactor issue leaves no reminder.

## 6. Merge release-please PR (if present)

This repo is a single package, so release-please opens a single repo-wide release PR (tagged `vX.Y.Z`).

1. Use `release_pr_find` to locate an open release-please PR.
2. If none is found (timeout), skip to step 7.
3. If one exists, read the **full** PR body to confirm the version bump it proposes and that it matches the work you just shipped.
4. Use `release_pr_merge` with the PR number.
   - Note: release-please PRs typically have **no CI runs** because PRs created by the default `GITHUB_TOKEN` do not trigger workflows.
     This is expected; do not block on it.
   - If `release_pr_merge` returns an error (not mergeable), stop and report — let the user decide.
   - Exception: if it fails with `merge_state: UNSTABLE`, check `gh pr view <N> --json statusCheckRollup`.
     An empty rollup means no checks ran — the `GITHUB_TOKEN` case above; merge with `gh pr merge <N> --rebase` so the release lands as a linear commit, then `git pull --ff-only`.
     Stop and report only when the PR is genuinely blocked (`CONFLICTING`/`DIRTY`/`BEHIND` or a failing check).
5. Use `release_watch` to wait for the release tag to land on HEAD.

## 7. Final report

Print:

- The new HEAD on `main` (`git log --oneline -1`).
- The released version, if a release commit just landed (`git tag --points-at HEAD` or read `package.json`).
- Issue close confirmation.
- Anything that was skipped and why.

## Constraints

- Never force-push.
- Never merge a release-please PR that is genuinely blocked (`CONFLICTING`/`DIRTY`/`BEHIND` or a failing check); an `UNSTABLE` state from no checks running is the expected `GITHUB_TOKEN` case (step 6.4).
- If CI fails, the issue stays open.
- If multiple release-please PRs exist, stop and ask — that's a configuration issue, not a normal merge.
