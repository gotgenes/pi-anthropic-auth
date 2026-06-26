---
description: Execute a docs/plans/ plan that has no TDD cycle (docs-only, config-only, or prose changes)
---

# Execute a plan (non-TDD)

Argument: `$1` is either a plan path, an issue number, or empty (use the most recently modified plan).

Use this template for plans whose "TDD Order" section says there are no tests to write (docs-only, config-only, or other non-code changes).
For plans with red→green test cycles, use `/tdd-plan` instead.

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
If the plan has a "TDD Order" section with red→green test cycles, stop and tell the user to run `/tdd-plan` instead.

Extract the issue number from the plan filename pattern `NNNN-` or from the plan's frontmatter `issue:` field.
Fetch the issue title via `gh issue view N --json title -q .title` if it is not in the frontmatter.
Call `set_session_name` with name `#N Build — <issue title>` to identify this session in the session selector.

## Load prior session context

Check whether prior sessions have already done work on this issue:

1. Extract the issue number from the plan filename (pattern `NNNN-`) or its frontmatter `issue:` field.
2. Search for an existing retro file: look for `docs/retro/NNNN-*.md` matching the issue number.
3. If a retro file exists, read it.
   Prior stage entries contain summaries and observations from earlier sessions (e.g., planning decisions, risks identified, alternatives rejected).
4. Use this context to inform your work — it may contain warnings about edge cases, decisions that were already debated, or friction points to avoid repeating.

## Load skills

Before executing the plan, load skills relevant to the change:

- Load the `anthropic` skill for package-specific architecture, OAuth compatibility lessons, priorities, and testing context.
- Load the `code-design` skill if the plan touches code.
- Load the `markdown-conventions` skill if the plan touches markdown or docs.
- Load the `pre-completion` skill — you will use it after the final step to dispatch the quality reviewer.

## Verify green baseline

Before making any changes, confirm the starting state is clean:

1. `pnpm run check` — must pass (if the package has TypeScript sources).
2. `pnpm run lint` — must pass.

If any check fails, stop and report to the user.
Do not start from a broken baseline.

## Execute the plan steps

When a step's deliverable is the reasoning itself — a decision record, design analysis, or upstream-request brief, not mechanical edits (path fix, cross-reference, table update) — investigate first, then present the findings and proposed framing for the user's alignment **before** writing and committing.
A committed framing the user then redirects forces a full rewrite (Refs #35).

For **each** numbered step in the plan's "TDD Order" (or equivalent execution section), in order:

1. **Implement** the change the step describes.
2. **Verify.**
   Run the linters to confirm the change is clean:
   - `pnpm run lint`.
     If it fails, run `pnpm exec biome check --write .` to auto-fix, then re-check.
     Fix all failures — including pre-existing ones unrelated to the current change.
3. **Commit.**
   Use the commit message the plan suggests, or a Conventional Commits message that matches:
   - `docs:` for documentation changes.
   - `feat:` for new behavior.
   - `feat!:` for breaking changes the plan calls out (include a `BREAKING CHANGE:` footer).
   - `fix:` for bug fixes.
   - `style:` for lint/format fixups.

One logical change per commit.
Do not bundle unrelated steps into one commit.

If a step uncovers a problem the plan didn't anticipate, fix it as part of the same commit and note the deviation in the commit body.
If the deviation is large, stop and ask.

## After the last step

1. If any `src/` or `test/` files were touched (even tangentially), run the full suite: `pnpm test`.
   Must be all green.
2. If any `.ts` files were touched, run the type check: `pnpm run check` (`tsc --noEmit`).
   Must succeed.
3. Run the linter one final time: `pnpm run lint`.
   Commit any fixup as `style:` if you haven't pushed yet.
4. If `docs/architecture.md` exists and the issue completes a numbered roadmap step, prefix `✅` on both the step heading and its Mermaid diagram node — a `Landed:` detail line is not a substitute for the `✅`; flip the phase status row only when every step in the phase is done; commit as `docs:`.
5. **Do not edit `CHANGELOG.md`** — release-please owns it and will generate entries from your Conventional Commit messages on the next release.

## Pre-completion review

Load the `pre-completion` skill and follow the dispatch protocol.
Proceed to "Summarize" only after the reviewer returns PASS or WARN.

## Summarize

Print:

- `git log --oneline <N>` for the commits you just made (N = number of steps).
- One-line summary of what changed.
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
   ## Stage: Implementation — Build (<ISO 8601 timestamp>)

   ### Session summary

   2–3 sentences: what was implemented, how many steps completed, what changed.

   ### Observations

   Note deviations from the plan, unexpected issues, and any decisions made during implementation.
   Include the pre-completion reviewer's verdict (PASS / WARN / FAIL) and any WARN findings.
   If the session was cut short (not all steps completed), note which steps remain.
   ```

4. Commit: `git add <retro-file> && git commit -m "docs(retro): add build stage notes for issue #N"`.

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
Append with the `Edit` tool (or `Write` for a new file), not a shell heredoc.
When appending a new stage to an existing retro, anchor the `Edit` on the file's last line or use `Write` with the full content — the repeated `### Observations` / `### Session summary` headers make header-anchored edits ambiguous.

Stop.
The next step is `/ship-issue`.
