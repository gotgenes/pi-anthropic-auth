---
description: Push, close a GitHub issue with a summary, and dispatch the release
---

# Ship the implementation

Argument: `$1` is the issue number that was just implemented.

Fetch the issue title via `gh issue view $1 --json title -q .title`, then call `set_session_name` with name `#$1 Ship — <issue title>` to identify this session in the session selector.

## Release coordination (decide before step 1)

Gather the release decision up front, from a deterministic source, **before** any irreversible work (`git pull`/push/CI).
A decision presented early from the plan is far less likely to be reversed than one inferred from prose at the cancel point.

1. Locate the plan for this issue: `grep -rl "^issue: $1$" docs/plans`.
2. If a plan is found, read its `**Release:**` marker (written by `/plan-issue`) with `grep -F '**Release:**' <plan-file>` (fixed-string — a leading `*` is an invalid regex/BRE operator):
   - A marker containing `mid-batch — defer` → ask the operator **now**: defer the release (batch until the sequence completes), or release anyway?
     Record the decision.
   - Any other `**Release:**` value (`ship independently` or `ship now — batch "<name>" tail`) → record "release now"; note the recommendation in the final report; do **not** ask.
   - No `**Release:**` marker → record "release now" (default); do **not** ask.
3. If no plan file is found → record "release now" (default); do **not** ask.

This section only reads the plan and (conditionally) asks — it performs no git, push, or CI action.
Step 4b applies the recorded decision.

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
   If it times out, re-check the SHA you passed against `git rev-parse HEAD` before assuming a timing miss — a truncated or retyped SHA produces the same timeout.
3. Use `ci_watch` with the returned `run_id` and workflow `ci` to wait for it to complete.
4. If the run conclusion is `failure`, stop and report.
   Do not close the issue or merge anything.
5. If it lands `success`, continue.

## 4b. Check for a stacked release

Do not predict whether anything will release: `./scripts/release/next-version.sh` applies the real rules offline and prints the tag that would be cut, or nothing.
Most commit types cut a release here — `cliff.toml` maps `docs` and `chore` to visible changelog sections, so a docs-only range still produces a patch bump (`v2.0.2`, `v2.0.3`) — but plan- and retro-only commits do not, because `docs/plans/**` and `docs/retro/**` are excluded from the release scope.

Apply the decision recorded in the early "Release coordination" section.
The issue **always** closes in step 5, regardless of this decision (subject to step 5's hypothesis-pending exception) — closing records that the work is on `main`; releasing is a separate, batched concern.
If the decision was to defer/batch: continue to step 5, then skip step 6 (the release lands later with the batch tail).
Note the deferral in the final report.
Otherwise continue to step 5 and step 6.

## 4c. Create planned follow-up issues

If the plan or its retro defers work to a follow-up issue ("created at ship time", "deferred to a follow-up"), create it now with `gh issue create` before closing — the shipped issue's close comment should reference its number.
Skip if the plan names no deferred follow-up.

## 5. Close the issue (or comment and leave open)

If the issue's resolution is a hypothesis pending the reporter's confirmation — a third-party report you answered diagnostically rather than with a confirmed fix — do not close it.
Post your findings as a comment and leave it open; the reporter confirms the fix.
Otherwise, close it as below.

Build the close comment from the commits since the previous release:

```bash
git log --oneline <previous-tag-or-base>..HEAD
```

The comment should include:

- The commit hash that lands the change ("Implemented in <sha> …").
  Get the full 40-char SHA from `git rev-parse <commit>` and paste it exactly — never hand-type or extend a short SHA from memory; a fabricated SHA does not auto-link.
  Write it as plain text — no backticks — so GitHub auto-links it to the commit.
  Resolve every SHA the comment will cite with `git rev-parse` before drafting any of it.
  If a tool argument is wrong while you are writing it, abort the call; never revise inside it.
- A short bullet list of feature/breaking commits.
- One sentence on user-visible behavior change.
- A note flagging any breaking change (matches `feat!:` commits).
- If the change unblocks or partially addresses other issues, mention them.
- If the comment cites the released version, post it after the release tag lands (step 6), or derive the bump from commit types (`feat` → minor, `fix`/`chore` → patch).
  Do not guess a patch bump.
- If the release was deferred (mid-batch), note that the fix is on `main` and releases with the batch — do not cite a released version.

Then use `issue_close` with issue number `$1` and the summary as the comment.

When `$1` is a third-party **PR** adopted via `/pr-review` (we re-implemented rather than merged), the close target is a PR, not an issue.
Verify with `gh api repos/gotgenes/pi-anthropic-auth/issues/$1 --jq '.pull_request != null'`.
Close it with `gh pr comment` then `gh pr close` — never merge — crediting the contributor by `@login`.
An adopted PR and the issue it addresses are both close targets: shipping either one closes the other too — read the retro's PR Review stage for the counterpart number.
Apply the `git rev-parse` rule above to every SHA in either comment; a multi-SHA credit list is where hand-extended short hashes slip in.

A shipped issue can also supersede open third-party PRs without either being the close target — this repo reimplements rather than merges.
Close each PR the plan names with `gh pr comment` then `gh pr close`, never merge, crediting the author by `@login`.

Then check whether this push shipped work for **other** issues (a stacked refactor/enabler, other `(#M)` commit refs, or sibling `docs/plans/`/`docs/retro/` files in the `<previous-tag-or-base>..HEAD` range).
A mid-batch sibling that shipped on its own `/ship-issue` is already closed by that ship — this scan is for stacked work that never had a ship of its own.
Close each with its own short summary — `cliff.toml` skips `refactor:` commits, so a stacked refactor issue leaves no changelog entry to remind you.

## 6. Dispatch the release

Skip this step entirely if step 4b recorded a defer/batch decision — the release lands later with the batch tail.

1. Ask what would release:

   ```bash
   ./scripts/release/next-version.sh
   ```

   It prints the tag it would cut (`vX.Y.Z`), or nothing.
   Read-only and offline; it never mutates anything.
2. If it prints nothing, there is nothing to release — skip to step 7 and say so in the report.
3. Dispatch the release, pinning the commit:

   ```bash
   gh workflow run release.yml -f sha="$(git rev-parse HEAD)"
   ```

   The `sha` is a guard — the run aborts if `main` moved after you derived it.

## 6b. Verify the release run

Skip this step if step 6 was skipped (deferred/batch release, or nothing to release) — there is nothing to verify.

1. Use `ci_find` with workflow `release` and the SHA you passed as `-f sha`, then `ci_watch` the returned `run_id` with `timeout: 600`.
   A dispatched run's `head_sha` is `main`'s tip at dispatch time, so it matches the SHA you pinned.
   If `ci_find` times out, the dispatch's SHA guard most likely failed because `main` moved — check the run list before re-dispatching.
2. If the `prepare`, `publish`, or `github-release` job failed, stop — do not proceed to step 7.
   `prepare` failing means nothing was tagged and the release can simply be re-dispatched.
   `publish` or `github-release` failing means the tag is already pushed: fix the cause and re-run that job rather than re-dispatching, which would refuse on the existing tag.
3. After the run succeeds, `git pull --ff-only` to bring the release commit and tag down.

## 7. Final report

Print:

- The new HEAD on `main` (`git log --oneline -1`); confirm `git status -sb` shows no unpushed commits before naming it.
- The released version, if a release commit just landed (`git tag --points-at HEAD` or read `package.json`).
- Issue close confirmation.
- Anything that was skipped and why.
- The next step: `/retro <N>` to capture this session's retrospective.

Name `/retro <N>` as the single next step.
Do **not** recommend the next issue to plan here — `/retro` surfaces the next roadmap issue at its end, after the retrospective is written.

## Constraints

- Never force-push.
- Never dispatch a release when `next-version.sh` prints nothing — `prepare-release.sh` refuses the run and nothing is tagged (step 6.2).
- Never re-dispatch a release after `prepare` succeeded; the tag exists, and the run would refuse on it (step 6b.2).
- If CI fails, the issue stays open.
- If the release run (step 6b) fails, do not proceed to step 7 until resolved.
