---
name: pre-completion
description: |
  Pre-completion protocol for implementation agents — gather context, dispatch the
  pre-completion-reviewer subagent, and handle its report before writing stage notes
  and recommending /ship-issue.
  Load at the end of /tdd-plan and /build-plan after all implementation steps are complete.
---

# Skill: pre-completion

Load this skill when all implementation steps are complete and the final deterministic checks have passed.
Follow these steps in order before moving to "Summarize" and "Write stage notes."

## Step 1: Gather context

Run from the repo root:

```bash
BASE=$(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)
git diff --name-only $BASE..HEAD
```

When the last tag predates unrelated already-landed work (this repo batches releases — `refactor:`/`test:`/`build:` commits don't tag), `$BASE..HEAD` over-scopes to sibling issues' shipped files.
Scope to the issue's own commits instead — anchor on the plan commit (`docs: plan … (#N)`): `git diff --name-only <plan-commit>^..HEAD`.

Note:

- The list of modified files.
- The issue number (from the plan frontmatter `issue:` field or the plan filename pattern `NNNN-`).
- The plan file path (`docs/plans/NNNN-*.md` matching the issue number; may be absent for unplanned work).

## Step 2: Dispatch the reviewer

Dispatch the `pre-completion-reviewer` subagent via the `subagent` tool:

- `subagent_type`: `"pre-completion-reviewer"`
- `description`: `"Pre-completion review for issue #N"`
- `prompt`: include the issue number, the modified-files list from Step 1, and the plan file path.

Example prompt to pass:

```text
Review issue #46.
Plan file: docs/plans/0046-background-agent-coverage-gap.md
Modified files since last tag:
  .pi/agents/pre-completion-reviewer.md
  .pi/skills/pre-completion/SKILL.md
  .pi/prompts/tdd-plan.md
  src/oauth-transport.ts
  AGENTS.md
```

Wait for the reviewer to complete and return its report before continuing.

## Step 3: Handle the report

If you cannot read an explicit `Overall: PASS|WARN|FAIL` line, treat it as "report not captured" and re-dispatch per Step 2.
Do not proceed to "Summarize" on an uncaptured or banner-only result.

### Overall: PASS

Proceed to the "Summarize" step in the template.
Include the one-line verdict in the stage notes ("Pre-completion reviewer: PASS").

### Overall: WARN

Proceed to "Summarize."
Include the verdict and WARN findings in the stage notes under a "Reviewer warnings" line.
The user can decide whether to address warnings before running `/ship-issue`.

When a WARN names stale references to a deleted symbol or module, grep the flagged file (and its sibling docs) exhaustively for every instance of that symbol before fixing — fixing only the named instances invites a second WARN round.

### Overall: FAIL

Stop — do not proceed to "Summarize" or "Write stage notes."
Report the reviewer's "Fix required" block to the user and ask how to proceed:

- **Fix and re-dispatch:** address the listed findings, commit, then repeat from Step 1 of this skill.
- **Skip and proceed:** note in the stage notes that the reviewer returned FAIL and the user chose to proceed anyway, then continue to "Summarize."

Do not proceed automatically — let the user decide.
