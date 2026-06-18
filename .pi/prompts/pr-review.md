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
  Reproduce or locate the gap in the code.
- **Approach soundness** — run the `code-design` heuristics.
  Look specifically for:
  - Speculative generality / maintenance traps: types or fields that are declared but never read at runtime (single-inhabitant enums, envelopes whose only consumed field is one value).
  - Over-wide threading: a value plumbed through layers that don't use it.
  - Convention fit: does it mirror established sibling patterns (registries, service APIs, `Symbol.for()` accessors), or invent a divergent shape?
- **Behavior/breaking** — does it change observable behavior, output shape, or a default on upgrade without a user edit?
  If so it is breaking (`feat!:` / `fix!:`).
- **Surface** — this package handles Anthropic OAuth tokens and request shaping, so treat auth/token handling as security-sensitive: what does the change expose or gate?
  Is it least-privilege?

Write a short, concrete evaluation (cite files and symbols), naming what is valuable (often: the capability + the API shape) and what you would change (often: collapse an over-built abstraction to what is actually consumed).

## Decide (third-party gate — required)

Use the `ask-user` skill once to confirm direction.
Do **not** skip this for a third-party PR even when the diff looks clean — the question is *whether* and *in what form* to take it, which is the operator's call.
Offer at least:

1. **Adopt the capability, plan a simplified design** — keep what is valuable, drop the over-built parts; use the PR as reference, not the merge target. (Usually the right answer.)
2. **Adopt the PR mostly as-is** — the approach is already idiomatic and right-sized.
3. **Decline / defer** — the gap is real but not a priority, or you want to design it yourself later.

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
Path: `docs/retro/NNNN-<slug>.md`, where `NNNN` matches the PR number and `<slug>` is derived from the title.
If the file does not exist, create it with frontmatter:

```yaml
---
issue: $1
issue_title: "<exact PR title>"
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

1. **Simplified design** — commit the triage note (`docs(pr-review): triage PR #$1 → adopt-with-simplified-design`), then tell the operator to run `/plan-issue #$1`.
   `/plan-issue` reads this retro note as prior context: the direction is already decided here, so its Decide gate is satisfied — it should plan around the recorded decision rather than re-litigate it.
2. **Adopt as-is** — produce a focused review checklist (correctness, convention fit, test coverage, behavior-change/breaking call-out, attribution) and either request changes on the PR or proceed to merge per the operator's call.
3. **Decline / defer** — commit the triage note, then close the PR with a comment that credits `@<login>`, explains the reasoning, and (if the problem is real) points at a tracked follow-up.

Commit the triage note before stopping: `git add <retro-file> && git commit -m "docs(pr-review): triage PR #$1 → <decision>"` (e.g. `adopt-as-is`, `decline`), matching the form in direction 1.

Then print a 5-line summary of the evaluation, the chosen direction, and the next step, and stop.
