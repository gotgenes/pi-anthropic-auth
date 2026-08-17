---
description: Read a GitHub issue, gather context, and write a numbered plan to docs/plans/
model: anthropic/claude-opus-5
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
- Load the `testing` skill if the plan involves test changes or TDD steps, or if investigation will run a disposable spike test.
- Load the `markdown-conventions` skill — it contains project-specific rules (one-sentence-per-line, frontmatter schema) that differ from standard markdown conventions.
- Load the `design-review` skill and run its checklist before finalizing the design for any refactor, extraction, or change to shared interfaces or layer wiring — judge this from the issue, not from a plan that already shows wiring changes.

## Gather context

1. Run `gh issue view $1 --json number,title,author,body,labels,state,comments` to read the issue body, labels, author, state, and discussion.
   `comments` must be a `--json` field — a separate `--comments` flag is silently ignored when `--json` is present.
   A closed issue, or one whose latest comment reports the fix is incomplete, changes the job: plan the residual as a new issue rather than re-planning the closed one.
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
   Then search for open issues the body does **not** reference but that touch the same module or symbol (`gh issue list --state open --search "<symbol>"`) — a sibling issue on the same file changes the framing, and the operator should not have to supply it.
   Sweep open PRs the same way (`gh pr list --state open`) — a third-party PR on the same module often carries a diagnosis the issue omits, and it becomes a close target at ship time.
4. Open the source files most relevant to the change and skim them before writing.
5. When a bug report does not reproduce locally, dispatch `Explore` (`model: "sonnet-5"`) for the root-cause hunt instead of running it inline — a hunt that ends in "not determinable from the code" still costs this session's context, and the plan is written right after.
   Verifying a diagnosis the report already supplies (named files, a numbered source trace) is not that hunt — keep it inline, since what it establishes is the design's input.
6. When the plan introduces a public API pattern (package `exports`, `Symbol.for()` accessor, service interface) or agent-facing message formatting (attribution tags, error prefixes, log labels), use colgrep or grep to search the codebase for the established convention and follow it unless there is a documented reason to diverge.
   When a config key or public field names an SDK/domain concept (a tool-call part, event, or content type), use the SDK's own term for it — verify against the SDK types — rather than adopting a term from the issue body verbatim.
   When the change introduces a mechanism a mature ecosystem already standardizes (log redaction, retry/backoff, caching, rate limiting), check what established libraries in that space actually do before building the `ask_user` option set — a set built only from first principles can omit the standard, lowest-maintenance choice.
7. Determine the issue's **release recommendation** from the architecture roadmap, if it is part of one.
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
5. If this issue is a release-batch **tail** (its roadmap step is the last member of a `Release: batch "<name>"`), also read the retros of the earlier batch members for work they explicitly deferred to the tail (e.g. a doc refresh deferred from a predecessor).
   Fold any such deferred work into this plan's `Module-Level Changes`.

## Decide

Treat the issue's "Proposed change" as a hypothesis, not a spec.
An extraction that only relocates statements to lower a complexity metric — introducing no new collaborator and moving no behavior onto data — is procedure-splitting, not design improvement.
When the issue prescribes a specific decomposition, verify (against the `code-design` heuristics) that each extracted piece returns a value, owns state, or gives behavior to data before planning around it.
When the issue proposes a new aggregate, report, or roll-up for human/agent consumption (not a refactor), grep the concrete downstream reader (a retro lens, a README section, a prompt) before designing its shape — a proposal can satisfy every code-design heuristic and still have no consumer.

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
When the issue is in an unfamiliar domain (a platform, protocol, or tool you have not verified), research the domain facts first — the direction options themselves depend on them, and an ungrounded ask gets bounced.
When an option's differentiator is a behavior change, name the scenarios where behavior differs and where it does not.
Label every number in an `ask_user` option or the plan's predicted-effect table as measured or estimated.
Measure when the command runs in under a minute; an inferred number with false precision ("18.0 s → ~18.5 s") sells an option on a benefit the real measurement may refute.
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

  Use the value derived in Gather context step 7, then add a sentence of rationale (which batch, why independent).
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
  When the design has N sibling call sites each supply the same derived fact, check whether a shared downstream point already stamps per-call fields (a runner, a writer, a factory) — a fact every sibling merely relays belongs there, not in N places.
  When the issue proposes moving or relocating a class to a new owner, list every method's callers and what fields/state each method touches.
  If most methods operate on the target owner's fields, the class may be an intermediary that should be dissolved into the owner rather than relocated intact.
- **Module-Level Changes** — file-by-file list of what's added, changed, or removed.
  When a step removes or renames an export, grep all `src/` and `test/` files — plus `AGENTS.md` and `.pi/skills/anthropic/SKILL.md`, which document package internals — for every removed symbol before finalizing the file list.
  When the removed export is a public or cross-extension API surface (a `package.json` `exports` re-export, an event channel, a `Symbol.for()` accessor), also grep the whole `docs/` tree and `README.md` — user-facing docs reference a public mechanism by name, not just `docs/architecture.md`.
  When a step reworks the documented behavior of a mechanism rather than removing a symbol (e.g. a patch description, an architecture note, or wording like "prepends" → "includes"), also grep `AGENTS.md` and `.pi/skills/anthropic/SKILL.md` for the mechanism name — reworded prose carries no removed symbol to match.
  When a step renames a heading, anchor, or named concept another doc may cite as an example (not just a source symbol), widen the skill grep to the whole `.pi/skills/` tree — a shared skill (`improvement-discovery`, `code-design`) can name a doc's section by heading, and `anthropic` alone misses it.
  When a step resequences or reworks a documented workflow or step-order, grep the edited file itself (not only sibling docs) for other passages describing the same sequence — a prompt or skill often states its workflow twice (a narrative list plus an Output-format section), and editing one leaves the other stale.
  When Design Overview names more than one stale claim, grep once per claim using that claim's own vocabulary — distinct claims rarely share keywords.
  A "routes through the API registry" grep does not match "the registry entry is our own wrapper, so reading it would loop."
  When a step removes a call to a private (non-exported) function, grep the file for other callers — if the removed call was the sole call site, list the function for removal in the same step.
  When the change adds, removes, or moves a module, check `docs/architecture.md` for layout listings, complexity tables, health metrics, or domain diagrams that reference the affected files and list them as doc updates.
  When the issue is a numbered roadmap step, list the architecture-doc `✅` step-mark (heading + Mermaid node) and its `Landed:` note as an expected doc update — `/tdd-plan` lands it at implementation completion; do not defer it or declare it out of scope.
  When a step moves a module to a different directory, grep same-directory `./<module>` importers too — not only `#src/<module>` alias imports; a `./`-relative import to a module leaving the directory carries no `#src/` marker to match, so an alias-only grep silently drops it.
  When the change adds, removes, or renames a slash command or user-facing feature, grep `README.md` for the command/feature name and list the stale sections as doc updates — a README documents commands, not module filenames, so the `src/`-symbol grep misses it.
  When a step corrects a literal value that appears in prose (a path, default, or identifier in sample output, log snippets, or ADR code comments), grep the whole `docs/` tree for the old value — not a hand-picked file subset; stale sample logs and decision-record comments do not surface in a `src/`/`test/` grep.
  When a step changes a character or codepoint, grep the `\uXXXX` escaped form as well as the literal — or scan non-ASCII wholesale (`rg -n '[^\x00-\x7f]'`); a codebase often spells the same glyph both ways, sometimes in one file.
  When a file appears in Module-Level Changes, verify it is not also claimed as unchanged in Non-Goals — contradictions between these sections cause confusion during implementation.
  When a plan step's verify criterion names a specific static-analysis finding as resolved (a clone fingerprint, a dead-code symbol, a complexity target), the step's design or Module-Level Changes must show which change clears it — do not list a finding as expected-gone without a change mapped to it.
  When the roadmap supplies a metric's recompute command (a `grep`/`fallow` invocation in the health-metrics table), run it at planning time to establish the real baseline and predict the post-change value — do not infer the target number from prose.
  A coarse grep also counts sites the plan's Non-Goals deliberately keep (presentation dispatch, single-status guards), so reconcile the predicted number against those exclusions rather than claiming a lower one.
  When a step adds a field to a serialized contract (a request/response persisted to disk or sent over the wire) whose reader reconstructs only an allowlist of known fields (a tolerant `asX`-style parser), list that reader as a touch point — an added field is silently dropped on read otherwise, and the gap surfaces only in a cross-consumer round-trip test, not `tsc`.
  When a step tightens a shared helper's parameter type (e.g. `unknown` → a concrete type with required fields), grep `test/` fixtures as well as `src/` callers and list them as touch points — a partial literal that satisfied the loose type fails the tightened type at compile time, and a `src/`-only call-site grep misses the test fixtures.
  When a step tightens an **optional** interface field to required (drops `| undefined`), grep the exact `<field>: undefined` literal across all `test/` files — an incidental fixture sets the field to `undefined` without ever reading it, so a grep for the field's *use* sites under-catches.
  When a step adds a **new required** field to a shared interface, grep for constructors of that type — inline object literals and shared test factories — not its use sites.
  The field never existed, so the grep above has no `<field>: undefined` literal to match; a shared test fixture is the common miss.
- **Test Impact Analysis** — for extraction and refactoring issues: (1) what new unit tests does the extraction enable that were previously impossible or impractical?
  (2) what existing tests become redundant with the new lower-level tests, and can they be simplified or removed?
  (3) which existing tests must stay as-is because they genuinely exercise the layer being extracted?
- **Invariants at risk** — when the change touches a surface a prior phase step already refactored, list that step's documented invariants (the architecture roadmap's `Outcome:`/`Landed:` bullets) and name the test that pins each — add a test if the invariant lives only in prose.
  A later step must not regress an earlier step's outcome with a green suite.
  When an invariant is quantitative (a byte-identical prefix, a token budget, a cache or latency characteristic), measure the baseline and predict the post-change value at planning time.
  A prose argument that the change is "at the tail" or "negligible" is not evidence, and a test pinning adjacent content does not pin the number.
  When the plan removes the mechanism an existing test's comment credits, spike the removal and run that test at planning time — that the test stays green is a measurement, not an argument.
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

## File follow-up issues

If planning identified work to defer to a separate issue (a follow-up named in Design Overview, Non-Goals, or Open Questions), create it now with `gh issue create` — before the plan commit, while this session holds full context.
Record each new issue number in the plan's Non-Goals / Open Questions.
File nothing speculative — only follow-ups the plan concretely names.

## Commit

Lint the plan file first so a markdown slip is caught here, not at the next stage's baseline (a `[#N]` mention inside backticks is a code span, not a reference, so its `[#N]:` definition trips `MD053`):

```bash
pnpm exec rumdl check <plan-file>
```

Fix any findings, then commit:

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
