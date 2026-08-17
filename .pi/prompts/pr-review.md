---
description: Evaluate a third-party PR, decide adopt/adapt/decline, and (usually) hand off to /plan-issue with attribution
---

# Review a third-party PR

PR number: `$1`

Your job is to **evaluate** PR #$1 — not to merge it reflexively.
Most third-party PRs arriving in this repo are best treated as a *signal of a real problem* plus *one possible implementation*.
The common, preferred outcome is **adopt the capability with our own simplified design**, planned via `/plan-issue` — not a straight merge.
Stop after recording the decision and handing off; do not start implementation here.

## Sync with remote (do this first)

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure.
   Do not stash, rebase, force, or otherwise resolve.
3. Only proceed on a clean fast-forward (or `Already up to date.`).

## Gather context

1. Run `gh pr view $1 --json number,title,author,body,headRefName,additions,deletions,changedFiles,mergeable,mergeStateStatus` to read the PR.
   Call `set_session_name` with name `#$1 PR Review — <PR title>` to identify this session in the session selector.
2. Determine whether the author is a third party: compare `author.login` to `gh api user --jq .login`.
   A third-party PR is a request to evaluate, not a spec to implement.
3. Capture attribution now: `gh pr view $1 --json commits --jq '.commits[].authors[] | {name, login, email}'`.
   Record the author's name + email for the `Co-authored-by:` trailer (see Attribution).
4. Review the changed files (`gh pr diff $1 --name-only`) to understand the scope of the change.
5. Note the PR's base commit (`gh pr view $1 --json baseRefOid`) — every "does this defect exist" question below is asked against **current `main`**, not against the PR's narrative.

A fork PR's workflow runs sit at `action_required` until a maintainer approves them, so `statusCheckRollup` is usually **empty** — absent checks mean *not run*, never *passed*.
Do not read `mergeable`/`mergeStateStatus` as evidence of a green build.
Approve the run (`gh api -X POST repos/gotgenes/pi-anthropic-auth/actions/runs/<id>/approve`) or run the checks yourself per the Verify gate below.

## Verify the defect (required gate — do this before evaluating the diff)

A PR body is a claim, not evidence.
Most of the cost of a bad review is spent evaluating the implementation of a problem that does not exist.
Establish the problem is real **on current `main`** before you read the diff for design.

1. **Reproduce it.**
   Write a throwaway test (or run an existing one) that exercises the claimed defect against current `main` and watch it fail.
   Delete the scratch file afterward; it is evidence, not a deliverable.
   If you cannot make it fail, you have not confirmed the bug — say so plainly and stop before the design evaluation.
2. **Check whether it is already fixed.**
   Search for the guard the PR is re-adding: `git log --oneline -S "<symbol>" -- <path>`, then `git tag --contains <sha>` to find the first release containing it, and `git merge-base --is-ancestor <sha> <tag>` to test a specific version.
   A defect fixed in an earlier release means the reporter is on an old version — the answer is an upgrade and a version request, not a patch.
3. **Locate the real boundary.**
   Confirm which code path actually produces the failure, and whether the PR touches that path.
   A patch that hardens a path the failure never reaches is not a fix.
4. **Check the regression risk in the other direction.**
   Ask what the touched path does correctly *today* and whether the patch degrades it.
   Narrowing, truncating, or short-circuiting a path that is already correct is a regression wearing a fix's clothing — weigh that against the claimed benefit.
5. **Verify any alternative you propose.**
   An evaluation that names a better seam is a claim about code you have not run.
   Hold it to the same standard as the defect: confirm the alternative's call order and available data in the compiled source before recommending it.

Record the outcome of this gate in the evaluation, with the commands and results that back it.
If the defect is unconfirmed, the `ask-user` decision gate below should offer "ask the reporter for version + fresh repro" as a direction.

## Run the checks yourself

Never trust a PR's "all tests pass" claim; it is routinely made without running the repo's full gate.

1. Check the branch out in a scratch worktree so your own tree stays clean:

   ```bash
   git fetch origin pull/$1/head:pr-$1
   git worktree add /tmp/pr-$1 pr-$1
   ```

2. From that worktree, run `pnpm run check`, `pnpm run lint`, and `pnpm test`.
   `pnpm run lint` catches what a contributor's local run usually misses — Biome's `organizeImports` assist fails on an import appended out of order, which is a CI failure even when every test passes.
3. Tear the worktree down when finished: `git worktree remove /tmp/pr-$1 --force && git branch -D pr-$1`.
4. Report each result concretely (the failing rule, the failing test) rather than "checks fail".

## Load skills

- Load the `anthropic` skill for package-specific architecture, OAuth compatibility lessons, and priorities.
- Load the `colgrep` skill before exploring the touched modules.
- Load the `code-design` skill for the design heuristics you will judge the PR against.
- Load the `design-review` skill when the PR touches shared interfaces or layer wiring.
- Load the `testing` skill if the PR changes tests.

## Evaluate

Read the diff (`gh pr diff $1`) and the modules it touches.
Separate the **underlying problem** from **this implementation** and judge both:

- **Problem** — is it real and worth solving in this package?
  This is settled by the Verify gate above, not by the PR body's account of it.
- **Approach soundness** — run the `code-design` heuristics.
  Look specifically for:
  - Speculative generality / maintenance traps: types or fields that are declared but never read at runtime (single-inhabitant enums, envelopes whose only consumed field is one value).
  - Over-wide threading: a value plumbed through layers that don't use it.
  - Convention fit: does it mirror established sibling patterns (registries, service APIs, `Symbol.for()` accessors), or invent a divergent shape?
- **Behavior/breaking** — does it change observable behavior, output shape, or a default on upgrade without a user edit?
  If so it is breaking (`feat!:` / `fix!:`).
- **Surface** — this package handles Anthropic OAuth tokens and request shaping, so treat auth/token handling as security-sensitive: what does the change expose or gate?
  Is it least-privilege?
- **Test coverage** — a bug-fix PR must ship a test that fails without the fix and passes with it.
  Confirm the diff actually contains one (`gh pr diff $1 --name-only`); a source-only bug fix is not eligible for "adopt as-is" and the missing test is a required change.

Write a short, concrete evaluation (cite files and symbols), naming what is valuable (often: the capability + the API shape) and what you would change (often: collapse an over-built abstraction to what is actually consumed).

## Decide (third-party gate — required)

Use the `ask-user` skill once to confirm direction.
Do **not** skip this for a third-party PR even when the diff looks clean — the question is *whether* and *in what form* to take it, which is the operator's call.
Offer at least:

1. **Adopt the capability, plan a simplified design** — keep what is valuable, drop the over-built parts; use the PR as reference, not the merge target. (Usually the right answer.)
2. **Adopt the PR mostly as-is** — the approach is already idiomatic and right-sized.
3. **Decline / defer** — the gap is real but not a priority, or you want to design it yourself later.
4. **Ask the reporter for version + fresh repro** — offer this whenever the Verify gate could not confirm the defect on current `main`, and lead with it when the archaeology shows it was fixed in an earlier release.
   The PR stays open pending the reply; credit the contributor and show the evidence that it does not reproduce.

Fold any genuine design ambiguities (breaking-vs-non-breaking, default behavior, scope boundaries) into the same `ask-user` call.
Let the operator's answers drive the recorded decision.

## Attribution

Whichever direction is chosen, the contributor gets explicit, durable credit:

- If we re-implement (direction 1) or merge (direction 2), every implementation/docs commit carries this trailer (blank line before it, at the end of the body):

  ```text
  Co-authored-by: <name> <email>
  ```

- The PR close comment (ship stage) thanks `@<login>` by name and links the implementing SHA(s).
- Never use `Closes #$1` in a commit (it pre-empts the curated close comment, per AGENTS.md); reference the PR as `Refs #$1` / `(#$1)`.

## Record the decision and hand off

Write a triage note so the next stage has the full context.
Path: `docs/retro/NNNN-<slug>.md`, with `<slug>` derived from the title.
`NNNN` is the **issue** the PR addresses (read the PR body for `Refs #N` / `Closes #N`), not the PR number — the directory is issue-keyed and `/plan-issue` looks the retro up by issue number.
Fall back to the PR number only when the PR references no issue.
If the file does not exist, create it with frontmatter:

```yaml
---
issue: <the issue the PR addresses; $1 only if it references none>
issue_title: "<exact issue title>"
pr: $1
---
```

Append a stage entry:

```markdown
## Stage: PR Review (<ISO 8601 timestamp>)

### Session summary

2–3 sentences: the PR, the underlying problem, and the operator's chosen direction.

### Evaluation

The concrete assessment — what is valuable, what you would change, and why (cite files/symbols).

### Decision and attribution

The chosen direction, the agreed scope/non-goals, and the required `Co-authored-by: <name> <email>` trailer + `@<login>` close-comment credit.
```

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
Append with the `Edit` tool (or `Write` for a new file), not a shell heredoc.

Then hand off based on the decision:

1. **Simplified design** — commit the triage note (`docs(pr-review): triage PR #$1 → adopt-with-simplified-design`), then tell the operator to run `/plan-issue #<issue>` — the issue number the note is keyed to, not `#$1`.
   `/plan-issue` reads this retro note as prior context: the direction is already decided here, so its Decide gate is satisfied — it should plan around the recorded decision rather than re-litigate it.
2. **Adopt as-is** — produce a focused review checklist (correctness, convention fit, test coverage, behavior-change/breaking call-out, attribution) and either request changes on the PR or proceed to merge per the operator's call.
3. **Decline / defer** — commit the triage note, then close the PR with a comment that credits `@<login>`, explains the reasoning, and (if the problem is real) points at a tracked follow-up.

Commit the triage note before stopping: `git add <retro-file> && git commit -m "docs(pr-review): triage PR #$1 → <decision>"` (e.g. `adopt-as-is`, `decline`), matching the form in direction 1.

Then print a 5-line summary of the evaluation, the chosen direction, and the next step, and stop.
