---
description: Read a GitHub issue, gather context, and write a numbered plan to docs/plans/
model: anthropic/claude-opus-4-8
---

# Plan a GitHub issue

Issue number: `$1`

Your job is to produce a numbered implementation plan for issue #$1, then commit it.
Plans go in `docs/plans/NNNN-<slug>.md`.
Stop after the commit.
Do **not** start implementation — the next step is `/tdd-plan` (for plans with test cycles) or `/build-plan` (for docs-only or non-code changes).

## Sync with remote (do this first)

Before reading anything, make sure the working tree is up to date with the remote so the plan is written against current `main`:

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure to the user.
   Do not attempt to stash, rebase, force, or otherwise resolve.
3. Only proceed once the pull reports a clean fast-forward (or `Already up to date.`).

## Load skills

Before investigating the issue, load skills relevant to the change:

- Load the `anthropic` skill for package-specific architecture, OAuth compatibility lessons, priorities, and testing context.
- Load the `colgrep` skill before code exploration — it contains the decision table for when to use semantic search vs. exact grep, which shapes how you approach unfamiliar modules.
- Load the `code-design` skill for design principles and structural heuristics.
- Load the `testing` skill if the plan involves test changes or TDD steps.
- Load the `markdown-conventions` skill — it contains project-specific rules (one-sentence-per-line, frontmatter schema) that differ from standard markdown conventions.
- Load the `design-review` skill and run its checklist before finalizing the design for any refactor, extraction, or change to shared interfaces or layer wiring — judge this from the issue, not from a plan that already shows wiring changes.

## Gather context

1. Run `gh issue view $1 --json number,title,author,body,labels` to read the issue body, labels, and author.
   After fetching the issue, call `set_session_name` with name `#N Planning — <issue title>` to identify this session in the session selector.
   Then check the issue author against the gh CLI user: run `gh api user --jq .login` to get the authenticated user's login and compare it to the issue's `author.login`.
   If they match, the issue reflects the operator's own intent — treat the "Proposed change" as the working hypothesis (subject to the `Decide` gate below) and proceed normally.
   If they differ, the issue was filed by a third party, so do not assume the proposed change is the direction the operator wants to take.
   A third-party issue is a request to evaluate, not a spec to implement — note this and surface the direction itself for the operator's confirmation in the `Decide` step before committing to a plan.
2. List the `docs/plans/` directory to see numbering and style conventions (create the directory if it does not exist yet).
   Pick the next free `NNNN` (prefer matching the issue number when reasonable).
   If `docs/plans/archive/` exists, those files use issue numbers from a previous repository — ignore them when resolving conflicts.
3. Read every issue the body references as a prerequisite or related (`gh issue view <n>`).
   Note whether each is implemented yet — your plan must say what it depends on vs. defers.
4. Open the source files most relevant to the change and skim them before writing.
5. When the plan introduces a public API pattern (package `exports`, `Symbol.for()` accessor, service interface) or agent-facing message formatting (attribution tags, error prefixes, log labels), use colgrep or grep to search the codebase for the established convention and follow it unless there is a documented reason to diverge.
6. Determine the issue's **release recommendation** from the architecture roadmap, if it is part of one.
   Grep `docs/architecture.md` for the step that references this issue (`(#$1)` / `[#$1]`) and read its `Release:` tag (defined by the `improvement-discovery` skill):
   - `Release: independent` (or no tag, or the issue is not in any roadmap) → **ship independently**.
   - `Release: batch "<name>"` → look up `<name>` in the roadmap's `Release batches` subsection; if this step is the batch tail (last listed member) → **ship now — batch tail**; otherwise → **mid-batch — defer**.
   You will write this into the plan's `Release Recommendation` section (see Write the plan).

## Check for prior session context

Before starting fresh, check whether prior sessions have already done work on this issue:

1. Search for an existing retro file: look for `docs/retro/NNNN-*.md` where NNNN matches the issue number (zero-padded to 4 digits).
2. If a retro file exists, read it in full.
   It contains stage-boundary notes from prior sessions — summaries, observations, friction points, and decisions already made.
3. If prior stage entries exist (e.g., a "Stage: Planning" entry from an earlier attempt), factor them into your approach.
   Do not repeat work that was already completed unless explicitly asked.
4. If no retro file exists, this is the first session on this issue — proceed normally.

## Decide

Treat the issue's "Proposed change" as a hypothesis, not a spec.
An extraction that only relocates statements to lower a complexity metric — introducing no new collaborator and moving no behavior onto data — is procedure-splitting, not design improvement.
When the issue prescribes a specific decomposition, verify (against the `code-design` heuristics) that each extracted piece returns a value, owns state, or gives behavior to data before planning around it.

Classify whether the change is breaking — independently of whether it is ambiguous.
A change is breaking if it alters the observable behavior, output shape, or default of existing code or config on upgrade without a user edit.
A bug fix that changes a default value is breaking, even when the old behavior was wrong.
If breaking, state it in Goals and use `feat!:`/`fix!:` with a `BREAKING CHANGE:` footer.

Before writing the plan, identify any genuinely ambiguous design choices.
If there are 1–2 such choices (breaking-vs-non-breaking, result-shape change, fallback semantics, etc.), use the `ask-user` skill once to surface them with a short context summary and concrete options.
Skip this step if the issue's "Proposed change" section is unambiguous.

If the issue is third-party (its author is not the gh CLI user, as determined in Gather context), do **not** skip the `ask-user` gate even when the proposed change is unambiguous.
The ambiguity for a third-party issue is not *how* to build it but *whether* the operator wants it built, and in what form.
Use `ask-user` to confirm the direction before planning: at minimum ask whether to (a) implement the proposal as described, (b) implement a different approach to the same underlying problem, or (c) decline/defer.
When the proposal also has design ambiguities, fold those into the same `ask-user` call.
Let the operator's answers — not the issue body — drive the plan's Goals and Design Overview.

## Write the plan

File: `docs/plans/NNNN-<short-slug>.md`.

Start with YAML frontmatter:

```yaml
---
issue: $1
issue_title: "<exact title from `gh issue view`>"
---
```

Then an H1 title (e.g., `# <short descriptive title>`) — required by markdownlint MD041 — followed by the body sections:

- **Release Recommendation** — the first `##` section after the H1, so it is prominent.
  Write the canonical grep-able marker line (`/ship-issue` reads it) as exactly one of:
  - `**Release:** ship independently`
  - `**Release:** ship now — batch "<name>" tail (this issue completes the batch)`
  - `**Release:** mid-batch — defer (batch "<name>"); confirm at ship time`

  Use the value derived in Gather context step 6, then add a sentence of rationale (which batch, why independent).
- **Problem Statement** — quote the issue's framing in your own words.
- **Goals** — bullet list, scoped to this change.
- **Non-Goals** — explicitly defer anything tangential (sibling issues, follow-ups).
- **Background** — relevant existing modules/functions and how they relate.
  Flag any constraint from AGENTS.md that applies.
- **Design Overview** — decision model, data shapes, separation of concerns, edge cases.
  Include code-fenced TS types when shape changes.
  When the design introduces a new collaborator that multiple consumers will use, sketch the consumer's call site (3–5 lines of pseudocode) to verify the interaction pattern follows Tell-Don't-Ask and Law of Demeter.
  When the design extracts code into a new module, sketch the extracted module's interaction with its upstream dependencies (3–5 lines) to verify it doesn't carry Tell-Don't-Ask violations, output-argument mutations, or reverse-search patterns from the original code.
  Fix upstream API gaps in the plan before planning the extraction.
  When a new exported function accepts domain objects, verify the parameter type follows ISP — list which fields the function reads and confirm the type doesn't carry unused fields.
  When the plan consolidates code from multiple methods into a shared helper, verify the methods have the same lifecycle semantics — different guards, cleanup scopes, or shutdown-vs-normal-operation contexts indicate structural duplication that should not be extracted.
  When the issue proposes moving or relocating a class to a new owner, list every method's callers and what fields/state each method touches.
  If most methods operate on the target owner's fields, the class may be an intermediary that should be dissolved into the owner rather than relocated intact.
- **Module-Level Changes** — file-by-file list of what's added, changed, or removed.
  When a step removes or renames an export, grep all `src/` and `test/` files — plus `AGENTS.md` and `.pi/skills/anthropic/SKILL.md`, which document package internals — for every removed symbol before finalizing the file list.
  When a step reworks the documented behavior of a mechanism rather than removing a symbol (e.g. a patch description, an architecture note, or wording like "prepends" → "includes"), also grep `AGENTS.md` and `.pi/skills/anthropic/SKILL.md` for the mechanism name — reworded prose carries no removed symbol to match.
  When a step removes a call to a private (non-exported) function, grep the file for other callers — if the removed call was the sole call site, list the function for removal in the same step.
  When the change adds, removes, or moves a module, check `docs/architecture.md` for layout listings, complexity tables, health metrics, or domain diagrams that reference the affected files and list them as doc updates.
  When a step corrects a literal value that appears in prose (a path, default, or identifier in sample output, log snippets, or ADR code comments), grep the whole `docs/` tree for the old value — not a hand-picked file subset; stale sample logs and decision-record comments do not surface in a `src/`/`test/` grep.
  When a file appears in Module-Level Changes, verify it is not also claimed as unchanged in Non-Goals — contradictions between these sections cause confusion during implementation.
- **Test Impact Analysis** — for extraction and refactoring issues: (1) what new unit tests does the extraction enable that were previously impossible or impractical?
  (2) what existing tests become redundant with the new lower-level tests, and can they be simplified or removed?
  (3) which existing tests must stay as-is because they genuinely exercise the layer being extracted?
- **Invariants at risk** — when the change touches a surface a prior phase step already refactored, list that step's documented invariants (the architecture roadmap's `Outcome:`/`Landed:` bullets) and name the test that pins each — add a test if the invariant lives only in prose.
  A later step must not regress an earlier step's outcome with a green suite.
- **TDD Order** — numbered red→green→commit cycles.
  Each item names the test surface, what's covered, and the suggested commit message (`test:`, `feat:`, `feat!:`, `fix:`, `docs:`).
  When a refactor replaces a type, interface, or function that a large test file depends on, use lift-and-shift: introduce the new thing alongside the old, migrate callers and fixtures incrementally across steps, then remove the old in a final step.
  Never plan a single step that requires rewriting an entire large test file at once.
  When a step removes a factory or export that has a single call site (e.g., `index.ts`), include the call-site update in the same step — the type checker will not allow them in separate commits.
  When a step removes an export (not just renames it), every importing module and its tests break at the type level in that commit — fold the extraction, all consumer updates, and all consumer-test updates into one step regardless of call-site count.
  When a step removes fields from an interface and a downstream file constructs an object literal satisfying that interface, include the call-site update in the same step — TypeScript's excess property checking rejects the stale fields immediately.
- **Risks and Mitigations** — concrete risks and how the plan addresses each.
- **Open Questions** — defer-until-needed items.

If the change is breaking, say so explicitly in Goals and use `feat!:` in the suggested commit messages.

## Commit

```bash
git add <plan-file>
git commit -m "docs: plan <short summary> (#$1)"
```

## Write stage notes

Before stopping, persist planning observations for cross-session continuity:

1. Determine the retro file path: `docs/retro/NNNN-<slug>.md`.
   Use the same slug as the plan file.
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
   ## Stage: Planning (<ISO 8601 timestamp>)

   ### Session summary

   2–3 sentences on what was accomplished in this planning session.

   ### Observations

   Note any significant decisions made, alternatives considered and rejected, risks identified, or scope adjustments.
   Keep it concise — this is a breadcrumb trail for future sessions, not a full retrospective.
   ```

4. Commit: `git add <retro-file> && git commit -m "docs(retro): add planning stage notes for issue #N"`.

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
Append with the `Edit` tool (or `Write` for a new file), not a shell heredoc.
When appending a new stage to an existing retro, anchor the `Edit` on the file's last line or use `Write` with the full content — the repeated `### Observations` / `### Session summary` headers make header-anchored edits ambiguous.

Then print a 5-line summary of the plan's key decisions and stop.
