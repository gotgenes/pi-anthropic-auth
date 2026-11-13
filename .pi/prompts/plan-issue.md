---
description: Read a GitHub issue, gather context, and write a numbered plan to docs/plans/
model: anthropic/claude-opus-5-5
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
- Load the `testing` skill for any plan with TDD steps — its TDD planning rules govern the plan's step sequencing, not just its test content — or if investigation will run a disposable spike test.
- Load the `markdown-conventions` skill — it contains project-specific rules (one-sentence-per-line, frontmatter schema) that differ from standard markdown conventions.
- Load the `design-review` skill and run its checklist before finalizing the design for any refactor, extraction, or change to shared interfaces or layer wiring — judge this from the issue, not from a plan that already shows wiring changes.
- Load the `tidy-first` skill if the change will create or modify `src/`/`test/` files — you will use it after the design is settled to dispatch the Tidy-First assessor, whose recommendations become preparatory steps in the plan's TDD Order (a docs-only or config-only change skips it).
- Load the `upstream-watch` skill when the issue revisits a decision resting on upstream Pi behavior: sweep both changelogs from the version the decision was made on through the latest release and unreleased `main` before building options (Refs #53).

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
   When the diagnosis attributes the defect to an upstream dependency, search that tracker before treating the mechanism as settled (`gh issue list --repo <owner/repo> --state all --search "<mechanism>"`; `earendil-works/pi` for Pi, `anthropics/claude-code` for Anthropic server behavior such as metering, rejections, and version gates).
   Verifying the source and verifying the maintainer's posture are different claims.
   Searching the tracker is not reading the code: when the report blames a named project, read that project's source and the published tarball of the version the reporter ran (`pnpm view <pkg> dist.tarball`).
   When the design rests on the dependency's internal behavior rather than its API, also read that mechanism in the tracking checkout (`~/development/pi/pi` for Pi) and confirm it is unchanged from the pinned version.
   The tracker answers the maintainer's posture; the checkout answers whether the code already moved.
4. Open the source files most relevant to the change and skim them before writing.
5. When a bug report does not reproduce locally, dispatch `Explore` (`model: "sonnet-5-5"`) for the root-cause hunt instead of running it inline — a hunt that ends in "not determinable from the code" still costs this session's context, and the plan is written right after.
   Verifying a diagnosis the report already supplies (named files, a numbered source trace) is not that hunt — keep it inline, since what it establishes is the design's input.
   A hunt that needs live execution — an authenticated API spike, a CLI repro, a variant table you iterate on — also stays inline; `Explore` is read-only and cannot run it.
   For any bug report, trace what **triggers** the defect, not only what the defect does: name and cite the code path that changes the input (a cache key, an event, a config re-read).
   A fix whose trigger is unreachable is dead code, and the trigger is gate substance.
   When the change edits a shared mutable artifact several parties write — the system prompt string, a global registry, a config file — enumerate the other writers first, including the `@gotgenes/*` extensions in `~/development/pi/pi-packages`.
   The issue names the collision it noticed, not the ones it did not.
6. When the plan introduces a public API pattern (package `exports`, `Symbol.for()` accessor, service interface) or agent-facing message formatting (attribution tags, error prefixes, log labels), use colgrep or grep to search the codebase for the established convention and follow it unless there is a documented reason to diverge.
   When a config key or public field names an SDK/domain concept (a tool-call part, event, or content type), use the SDK's own term for it — verify against the SDK types — rather than adopting a term from the issue body verbatim.
   When the change introduces a mechanism a mature ecosystem already standardizes (log redaction, retry/backoff, caching, rate limiting), check what established libraries in that space actually do before building the `ask_user` option set — a set built only from first principles can omit the standard, lowest-maintenance choice.
   When the plan **removes** an existing repo-wide convention rather than introducing one, find why it was introduced before planning its removal: `git log -S'<literal>'` to the first commit, then read that commit's plan and retro.
   A rationale that turns out to govern a *different* mechanism belongs in the plan's Non-Goals, or the convention gets restored later on the strength of the same memory.
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
When the change alters a documented contract (an event's timing guarantee, a default, an output shape), state the classification in the gate's substance message even when an ADR already settled it.
A settled call and an unasked one look identical to the operator.

Classify whether the change contradicts this package's published scope.
Grep `README.md` and `docs/architecture.md` for Non-Goals and scope-table rows that name the mechanism you are about to change, and read the close comments of any issue or PR they cite.
A collision found after the design settles can only be argued around; found before the first gate it is one of the gate's options.

Before writing the plan, identify any genuinely ambiguous design choices.
If there are 1–2 such choices (breaking-vs-non-breaking, result-shape change, fallback semantics, etc.), use the `ask-user` skill once to surface them with a short context summary and concrete options.
Skip this step if the issue's "Proposed change" section is unambiguous.

For a bug report, the gate's substance leads with the **observed scenario in the affected party's terms** — what the user or parent agent saw, in order — before the code trace that explains it.
A mechanism-first gate gets bounced for it.

If the issue is third-party (its author is not the gh CLI user, as determined in Gather context), do **not** skip the `ask-user` gate even when the proposed change is unambiguous.
The ambiguity for a third-party issue is not *how* to build it but *whether* the operator wants it built, and in what form.
Use `ask-user` to confirm the direction before planning: at minimum ask whether to (a) implement the proposal as described, (b) implement a different approach to the same underlying problem, or (c) decline/defer.
When the issue is in an unfamiliar domain (a platform, protocol, or tool you have not verified), research the domain facts first — the direction options themselves depend on them, and an ungrounded ask gets bounced.
When an option's differentiator is a behavior change, name the scenarios where behavior differs and where it does not.
When the plan's design rests on a reproduction, state in Design Overview how the repro was produced.
A fixture you constructed from your own model of the bug is not a reproduction — it can only confirm the model.
Reproduce through the real code path (real session data, the upstream function itself) before treating a diagnosis as design input, or label the evidence as synthetic and unconfirmed (Refs #65).
Before an `ask_user` option rests on an upstream symbol, confirm it is exported from the installed package's `dist/index.d.ts`, not just defined in the clone.
Before it rests on how third-party extensions call pi, read one real caller (`npm pack <pkg>`) (Refs #53).
Label every number in an `ask_user` option or the plan's predicted-effect table as measured or estimated.
Measure when the command runs in under a minute; an inferred number with false precision ("18.0 s → ~18.5 s") sells an option on a benefit the real measurement may refute.
A qualitative cost claim ("only reformats", "nothing is lost") is measurable too — produce the output and diff it before offering the option.
When the proposal also has design ambiguities, fold those into the same `ask-user` call.
Let the operator's answers — not the issue body — drive the plan's Goals and Design Overview.

When the design adopts a mechanism from a third party — an issue body, a comment, or a PR, on any issue whoever filed it — record the `Co-authored-by:` trailer in the plan's TDD Order, resolved to a real line, not an instruction to resolve one.
A patch set aside for one gap still credits the mechanism the plan keeps, and the implementing session commits without re-reading the issue.

If the issue is a decision-record or ADR issue (its deliverable is a decision, not code), do **not** skip the `ask-user` gate even when a design is already written down.
The deliberation is the deliverable: existing architecture-doc prose is an input to put to the operator, not a settled spec to transcribe.
Surface the open parameters (and any the prose treats as closed but the issue's own motivation reopens) for the operator's confirmation before planning.

## Tidy First assessment

With the design settled and the target files known — but before writing the plan — follow the `tidy-first` skill: dispatch the `tidy-first-assessor` subagent over the `src/`/`test/` files the change will touch, then fold its **Recommended** preparatory refactorings into the plan's TDD Order as `refactor:`/`test:` steps ahead of the work each prepares.

The assessor reads the real files against your design summary, so treat a structural contradiction it reports — a function that does not exist, an interface with a different shape — as a correction to the design before the plan records it.
A **count** it reports is a lead, not a finding: re-run the grep before the plan records the number.

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
  A Non-Goal resting on a path being unreachable is a claim about the *current* bound — when the change moves that bound (a budget, a limit, a threshold), re-derive the reachability before writing it.
- **Background** — relevant existing modules/functions and how they relate.
  Flag any constraint from AGENTS.md that applies.
- **Design Overview** — decision model, data shapes, separation of concerns, edge cases.
  Include code-fenced TS types when shape changes.
  When the design introduces a new collaborator that multiple consumers will use, sketch the consumer's call site (3–5 lines of pseudocode) to verify the interaction pattern follows Tell-Don't-Ask and Law of Demeter.
  When the design extracts code into a new module, sketch the extracted module's interaction with its upstream dependencies (3–5 lines) to verify it doesn't carry Tell-Don't-Ask violations, output-argument mutations, or reverse-search patterns from the original code.
  Fix upstream API gaps in the plan before planning the extraction.
  When a step adds an import edge A → B within one directory, confirm B does not already reach A through its own imports — the cycle surfaces only as a `fallow dead-code` `circular-dependencies` failure mid-TDD.
  When a new exported function accepts domain objects, verify the parameter type follows ISP — list which fields the function reads and confirm the type doesn't carry unused fields.
  When the plan consolidates code from multiple methods into a shared helper, verify the methods have the same lifecycle semantics — different guards, cleanup scopes, or shutdown-vs-normal-operation contexts indicate structural duplication that should not be extracted.
  When the design has N sibling call sites each supply the same derived fact, check whether a shared downstream point already stamps per-call fields (a runner, a writer, a factory) — a fact every sibling merely relays belongs there, not in N places.
  When the issue proposes moving or relocating a class to a new owner, list every method's callers and what fields/state each method touches.
  If most methods operate on the target owner's fields, the class may be an intermediary that should be dissolved into the owner rather than relocated intact.
  When the design replaces the evidence a guard reads (a scan swapped for a subscription, polling for an event), enumerate both directions: what the new source sees that the old missed, **and** what the old source saw that the new one misses.
  A universal claim about the new source ("every path emits X") is the one to verify before it justifies dropping a fallback.
- **Module-Level Changes** — file-by-file list of what's added, changed, or removed.
  When a step removes or renames an export, grep all `src/` and `test/` files — plus `AGENTS.md` and `.pi/skills/anthropic/SKILL.md`, which document package internals — for every removed symbol before finalizing the file list.
  When the removed export is a public or cross-extension API surface (a `package.json` `exports` re-export, an event channel, a `Symbol.for()` accessor), also grep the whole `docs/` tree and `README.md` — user-facing docs reference a public mechanism by name, not just `docs/architecture.md`.
  When a step reworks the documented behavior of a mechanism rather than removing a symbol (e.g. a patch description, an architecture note, or wording like "prepends" → "includes"), also grep `AGENTS.md` and `.pi/skills/anthropic/SKILL.md` for the mechanism name — reworded prose carries no removed symbol to match.
  A diagram is prose too: when a step changes a control flow or call order, read `docs/architecture.md`'s Mermaid blocks — a node label models the mechanism without naming the symbol, so the symbol grep cannot see it.
  When a step renames a heading, anchor, or named concept another doc may cite as an example (not just a source symbol), widen the skill grep to the whole `.pi/skills/` tree — a shared skill (`improvement-discovery`, `code-design`) can name a doc's section by heading, and `anthropic` alone misses it.
  When a step resequences, reworks, or drops a documented workflow, step-order, or command block, grep the edited file itself (not only sibling docs) for other copies of it — a prompt or skill often states the same thing twice (a narrative list plus an Output-format section, or one command block in two sections), and editing one leaves the other stale.
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
  When a step adds an **optional** field to an object a `src/` function *produces*, grep `test/` for exact-equality assertions on it (`toEqual`, `toHaveBeenCalledWith`) — optionality satisfies `tsc` and does not satisfy an exact assertion, so a "no construction site breaks" prediction misses them.
  When the design predicts a file will **not** change despite being in the blast radius, list it with that prediction and the claim it rests on.
  A predicted-unchanged file is a falsifiable claim; an omitted one is invisible.
- **Test Impact Analysis** — for extraction and refactoring issues: (1) what new unit tests does the extraction enable that were previously impossible or impractical?
  (2) what existing tests become redundant with the new lower-level tests, and can they be simplified or removed?
  (3) which existing tests must stay as-is because they genuinely exercise the layer being extracted?
  For a prompt or skill change, the shell commands the new text prescribes are its testable surface: dry-run each at planning time and record the expected output, so `/build-plan` can re-run them as verification.
  When the plan introduces a parser or matcher, its testable surface is the input domain rather than the inputs you can picture.
  Run the candidate over every real sample available, and include this repo's own authoring conventions among the shapes it must survive, such as `markdown-conventions`' four-backtick fence.
  When a prototype exists, run each case and killing mutation the TDD Order names through it, and record the outcome it produced rather than the one you expect.
  When the change's goal is a token's **absence** from output, apply that predicate to every literal the plan specifies, and assert it across the whole variant set rather than one example.
- **Invariants at risk** — when the change touches a surface a prior phase step already refactored, list that step's documented invariants (the architecture roadmap's `Outcome:`/`Landed:` bullets) and name the test that pins each — add a test if the invariant lives only in prose.
  Open each test you name — a file that mocks the layer under test pins nothing about it.
  A later step must not regress an earlier step's outcome with a green suite.
  When an invariant is quantitative (a byte-identical prefix, a token budget, a cache or latency characteristic), measure the baseline and predict the post-change value at planning time.
  A prose argument that the change is "at the tail" or "negligible" is not evidence, and a test pinning adjacent content does not pin the number.
  An invariant discharged by "no input of this shape exists" is unproven — a corpus bounds observed frequency, not reachability, so enumerate the mechanism's inputs instead.
  For a timing baseline take the median of three runs; a single sub-second sample is noise.
  Counts (tests, call sites, clones) need one run.
  When the plan removes the mechanism an existing test's comment credits, spike the removal and run that test at planning time — that the test stays green is a measurement, not an argument.
  Name the constituency each invariant serves and confirm it still holds for them — an invariant can be dead for one consumer and load-bearing for another, and a design that improves the loudest one regresses the original.
- **TDD Order** — numbered red→green→verify→commit cycles.
  Each item names the test surface, what's covered, and the suggested commit message (`test:`, `feat:`, `feat!:`, `fix:`, `docs:`).
  A suggested `feat:`/`fix:` subject names the observable outcome, not the seam it edits — it ships to the changelog verbatim.
  Type each step by what a user can observe once it lands: a step that adds a module no consumer references yet is `refactor:`, not `feat:`, so `cliff.toml` skips it and the change reaches the changelog once, on the step that wires it up.
  Each item that adds tests also names its **killing mutation**: the one-line change to the code under test that must turn the step's new tests red.
  Write it as an edit a reader could apply ("make `isAnthropicOAuthToken` return `true` unconditionally"), not as a description of intent.
  This is where a test's discriminating power is cheapest to specify — stating it forces you to name the signal that distinguishes the step's two outcomes, which is the check that catches an assertion passing under both.
  When a step's tests span several equivalence classes, name one mutation per class and say which tests each should kill; a mutation that leaves a test green is a finding only when the plan predicted otherwise.
  When a step **moves** an existing registration or call site rather than adding one, name a mutation that deletes it at the new site — a relocated line is as unpinned there as at its old one.
  When a change has a mechanism half and a data half — a walker plus its lookup table, a parser plus its keyword list — sequence them as separate steps.
  They have different failure rates and different verification instruments, and fusing them makes every data defect re-review the mechanism.
  When the data is a table of external facts, write the check that verifies one row before writing the rows.
  When the plan introduces a new mutable field, specify its whole lifecycle — set, cleared, read — in one step's description rather than one transition per step.
  Two steps that each name a different transition read correctly alone and can still contradict each other, which only execution reveals.
  When a refactor replaces a type, interface, or function that a large test file depends on, use lift-and-shift: introduce the new thing alongside the old, migrate callers and fixtures incrementally across steps, then remove the old in a final step.
  Never plan a single step that requires rewriting an entire large test file at once.
  When a step removes an export (not just renames it), every importing module and its tests break at the type level in that commit — fold the extraction, all consumer updates, and all consumer-test updates into one step regardless of call-site count.
  When a step removes fields from an interface and a downstream file constructs an object literal satisfying that interface, include the call-site update in the same step — TypeScript's excess property checking rejects the stale fields immediately.
- **Risks and Mitigations** — concrete risks and how the plan addresses each.
  When a risk asserts what happens if a mechanism is **absent**, spike its removal — a spike that exercises the mechanism present verifies the happy path, not the risk.
- **Open Questions** — defer-until-needed items.

## File follow-up issues

If planning identified work to defer to a separate issue (a follow-up named in Design Overview, Non-Goals, or Open Questions), create it now with `gh issue create` — before the plan commit, while this session holds full context.
Record each new issue number in the plan's Non-Goals / Open Questions.
Take that number from `gh issue create`'s output, and resolve any SHA the issue body cites with `git rev-parse` — a number or hash authored into the draft is wrong by whatever landed since.
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

   When the Tidy-First assessor rejected candidates as scope creep, add a `#### Deferred tidyings` subsection under `### Observations`, one line per item naming the file and the friction — the `improvement-discovery` skill sweeps this exact heading across retro files to triage them in a later improvement round.
4. Commit: `git add <retro-file> && git commit -m "docs(retro): add planning stage notes for issue #N"`.

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
When appending a new stage to an existing retro, anchor the `Edit` on the file's last line or use `Write` with the full content — the repeated `### Observations` / `### Session summary` headers make header-anchored edits ambiguous.

Then print a 5-line summary of the plan's key decisions, end with the next command (`/tdd-plan` or `/build-plan`) on its own line, and stop.
