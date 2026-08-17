---
name: tidy-first
description: |
  Tidy-First protocol for implementation agents — dispatch the tidy-first-assessor
  subagent over the files an upcoming change will touch, then triage its preparatory-refactor
  suggestions before implementing.
  Load at the start of /tdd-plan and /build-plan, after the green baseline is verified.
---

# Skill: tidy-first

Load this skill at the start of implementation — after the green baseline passes and before the first change.
It encodes Kent Beck's *Tidy First*: make the change easy (with small preparatory refactors landed first), then make the easy change.
The assessment runs in a **subagent** so the many-files read does not consume the implementation agent's context.

## Applicability gate

Dispatch the assessor when the plan will **create or modify `src/` or `test/` files**.
Skip for a docs-only or config-only plan (a `/build-plan` that touches no code) — there is nothing to prepare.
Note the skip and proceed.

## Step 1: Gather the target files

From the plan's "Module-Level Changes" table (or "TDD Order"), list the `src/`/`test/` files the change will modify or create.
This list plus the plan path is the assessor's input.

## Step 2: Dispatch the assessor

Dispatch the `tidy-first-assessor` subagent via the `subagent` tool:

- `subagent_type`: `"tidy-first-assessor"`
- `description`: `"Tidy-First assessment for issue #N"`
- `prompt`: include the issue number, the plan file path, and the target-files list from Step 1.

The assessor is read-only and returns an advisory report: **Recommended** preparatory commits (each tied to a specific friction the change will hit), **Optional** ones, and **Rejected-as-scope-creep** items it deliberately declined.

## Step 3: Triage the report

The report is advisory — you decide what lands.

- **Recommended** tidyings: land each as its own `refactor:` or `test:` commit **before** the feature work, in the order given, each leaving the tree green.
  This is the point — the behavior-change commit that follows is small and reviewable.
- **Optional** tidyings: take them only if they genuinely shrink the change; skip otherwise.
- **Rejected** items: do not act on them.
  If one looks worth doing, it is separate-concern cleanup — note it for a future improvement round or file it as its own issue, do not fold it into this change.
  Read a rejection's reasoning, not just its verdict — one that contradicts the plan is a signal to re-examine the plan.

Do not tidy code the change will not touch — that is scope creep, not Tidy First.
An extraction is a copy, so it carries the source's rule violations into a file that is now shared — re-read moved code against the governing skill before committing it.
If the assessor reports "no preparatory tidying warranted," proceed directly to the change.

## Step 4: Proceed

After landing the recommended preparatory commits (if any), continue to the normal TDD or build cycle.
The preparatory commits are separate from the behavior change and precede it in history.
