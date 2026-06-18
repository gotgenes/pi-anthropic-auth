---
description: Execute the TDD steps from a docs/plans/ plan as red→green→commit cycles
---

# Execute a plan with TDD

Argument: `$1` is either a plan path, an issue number, or empty (use the most recently modified plan).

## Sync with remote (do this first)

Before locating or reading the plan, make sure the working tree is up to date with the remote:

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure to the user.
   Do not attempt to stash, rebase, force, or otherwise resolve.
3. Only proceed once the pull reports a clean fast-forward (or `Already up to date.`).

## Locate the plan

- If `$1` looks like a path, use it.
- If `$1` is a number, find `docs/plans/NNNN-*.md` matching that integer (issue number or plan number).
- Otherwise, use the newest file in `docs/plans/` (by mtime).

Read the plan in full before doing anything else.
If "TDD Order" is missing or empty, stop and report — re-run `/plan-issue` first.

Extract the issue number from the plan filename (pattern `NNNN-`) or from the plan's frontmatter `issue:` field.
If the issue title is not in the frontmatter, fetch it via `gh issue view N --json title -q .title`.
Call `set_session_name` with name `#N TDD — <issue title>` to identify this session in the session selector.

## Load prior session context

Check whether prior sessions have already done work on this issue:

1. Extract the issue number from the plan filename (pattern `NNNN-`) or its frontmatter `issue:` field.
2. Search for an existing retro file: look for `docs/retro/NNNN-*.md` matching the issue number.
3. If a retro file exists, read it.
   Prior stage entries contain summaries and observations from earlier sessions (e.g., planning decisions, risks identified, alternatives rejected).
4. Use this context to inform your work — it may contain warnings about edge cases, decisions that were already debated, or friction points to avoid repeating.

## Load skills

Before executing the TDD cycle, load skills relevant to the change:

- Load the `anthropic` skill for package-specific architecture, OAuth compatibility lessons, priorities, and testing context.
- Load the `code-design` skill for design principles, TypeScript conventions, and structural heuristics.
- Load the `testing` skill for Vitest mock patterns and TDD planning rules.
- Load the `pre-completion` skill — you will use it after the final TDD step to dispatch the quality reviewer.

## Verify green baseline

Before writing any code, confirm the starting state is clean:

1. `pnpm run check` — must pass.
2. `pnpm run lint` **from the repo root** — must pass.
3. `pnpm test` — must pass.

If a check fails on an issue your change will not touch (e.g. a pre-existing lint warning in an unrelated doc), fix it as a separate cleanup commit (`docs:`, `style:`, or `fix:` as appropriate) to establish a green baseline, then proceed.
If the failure is non-trivial, or you cannot quickly establish why it is failing, stop and report to the user.
Do not start TDD cycles from a broken baseline.

## Execute the TDD cycle

For **each** step in the plan's "TDD Order", in order:

1. **Red.**
   Write the failing tests the step describes.
   Run only the affected test file: `pnpm test <test-path>` and confirm failures.
2. **Green.**
   Implement the minimum code to make those tests pass.
   Re-run the same file and confirm green.
   When the step adds or changes a shared type/interface (or a loop/consumer over one), run `pnpm run check` before committing — Vitest does not typecheck, and a type error caught only at end-of-cycle forces a commit reorder.
3. **Commit.**
   Use the commit message the plan suggests, or a Conventional Commits message that matches:
   - `test:` for test-only commits (rare; usually folded into the feat).
   - `feat:` for new behavior.
   - `feat!:` for breaking changes the plan calls out (include a `BREAKING CHANGE:` footer).
   - `fix:` for bug fixes.

One logical change per commit.
Do not bundle multiple TDD steps into one commit.

When a step replaces a type or function that many tests depend on, use lift-and-shift: add the new alongside the old, migrate test fixtures incrementally, then remove the old.
Do not rewrite an entire large test file in one shot.

If a step uncovers a problem the plan didn't anticipate (e.g. a downstream test breaks), fix it as part of the same commit and note the deviation in the commit body.
If the deviation is large, stop and ask.
If a plan's quantitative target (LOC, clone count, complexity) does not fall out as the plan predicted, treat that as a deviation: re-decide via `ask_user` rather than escalating the abstraction to force the number.

## After the last TDD step

1. Run the full suite: `pnpm test`.
   Must be all green.
2. Run the type check: `pnpm run check` (`tsc --noEmit`).
   Must succeed — Vitest does not typecheck.
3. Run the linter **from the repo root**: `pnpm run lint`.
   If it fails, run `pnpm exec biome check --write .` to auto-fix, then re-check.
   Fix all failures — including pre-existing ones unrelated to the current change.
   Commit any fixup as part of the most recent feat commit (amend) only if you haven't pushed; otherwise as a `style:` commit.
   The fixup must NOT land in a `docs:` commit.
4. Run the fallow dead-code gate **from the repo root**: `pnpm fallow:dead-code`.
   If it exits non-zero, load the `fallow` skill and fix the findings — prefer declaring a real contract (`implements`) or removing dead exports over suppressing; suppress only verified false positives.
   Commit fixes as part of the most recent feat commit (amend) if not yet pushed; otherwise as a `fix:` commit.
5. Check for unstaged lockfile changes: `git diff --name-only pnpm-lock.yaml`.
   If modified, stage and commit it as part of the most recent feat commit (amend if not yet pushed) or as a separate `fix:` commit.
6. Cross-check the plan's "Module-Level Changes" table against actually-changed files.
   If a listed file was not touched, update it now or note the deviation.
7. If `docs/architecture.md` exists, check whether the changes affect the module structure or data-flow descriptions and update them.
   If the issue completes a numbered roadmap step, prefix `✅` on both the step heading and its Mermaid diagram node — a `Landed:` detail line is not a substitute for the `✅`.
   Flip the phase status row only when every step in the phase is done.
8. Commit doc updates as `docs: <summary>`.
9. **Do not edit `CHANGELOG.md`** — release-please owns it and will generate entries from your Conventional Commit messages on the next release.

## Pre-completion review

Load the `pre-completion` skill and follow the dispatch protocol.
Proceed to "Summarize" only after the reviewer returns PASS or WARN.

## Summarize

Print:

- `git log --oneline <N>` for the commits you just made (N = number of TDD steps + docs).
- One-line summary of behavioral change.
- Any test-count delta.
- Any deviations from the plan.
- Pre-completion reviewer verdict (PASS / WARN / FAIL with one-line summary).

## Write stage notes

Before stopping, persist implementation observations for cross-session continuity:

1. Determine the retro file path: `docs/retro/NNNN-<slug>.md`.
   Use the same `NNNN-<slug>` as the plan file.
   Create the directory if needed.
2. If the retro file does not exist, create it with YAML frontmatter:

   ```yaml
   ---
   issue: N
   issue_title: "<exact title from issue>"
   ---
   ```

   Followed by `# Retro: #N — <issue title>`.
3. Append a stage entry:

   ```markdown
   ## Stage: Implementation — TDD (<ISO 8601 timestamp>)

   ### Session summary

   2–3 sentences: what was implemented, how many TDD cycles completed, test count delta.

   ### Observations

   Note deviations from the plan, unexpected edge cases, tests that were harder than expected, and any decisions made during implementation.
   Include the pre-completion reviewer's verdict (PASS / WARN / FAIL) and any WARN findings.
   If the session was cut short (not all TDD steps completed), note which steps remain.
   ```

4. Commit: `git add <retro-file> && git commit -m "docs(retro): add TDD stage notes for issue #N"`.

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
Append with the `Edit` tool (or `Write` for a new file), not a shell heredoc.
When appending a new stage to an existing retro, anchor the `Edit` on the file's last line or use `Write` with the full content — the repeated `### Observations` / `### Session summary` headers make header-anchored edits ambiguous.

Stop.
The next step is `/ship-issue`.
