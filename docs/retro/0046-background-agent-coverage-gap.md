---
issue: 46
issue_title: "pi >=0.80.8 no longer routes `registerProvider` into the pi-ai api registry, so background agents bypass the wrapper and hit the \"extra usage\" 400 again"
---

# Retro: #46 — pi >=0.80.8 no longer routes `registerProvider` into the pi-ai api registry

## Stage: Planning (2026-08-08T00:00:00Z)

### Session summary

Planned the third-party report from [@pandysp](https://github.com/pandysp) that this repository's docs describe a `registerApiProvider` bridge upstream removed in pi 0.80.8.
Verified every technical claim in the issue against the upstream clone and the installed `0.84.0` `dist/`, then surfaced a blast-radius risk the issue did not mention, which drove the operator to decline the proposed fix.
Wrote `docs/plans/0046-background-agent-coverage-gap.md`: a documentation correction across seven files plus one test-harness fix, scoped to correcting the record rather than closing the gap.

### Observations

#### Verification findings

1. Confirmed zero `registerApiProvider` call sites in `@earendil-works/pi-coding-agent@0.84.0` `dist/`, matching the reporter's tarball bisect.
2. Confirmed the covered lane: `sdk.ts`'s `createAgentSession` supplies a `streamFn` routing through `modelRuntime.streamSimple`, `provider-composer.streamWith` applies our `streamSimple`, and `agent-session.ts` reuses `agent.streamFunction` at both compaction call sites.
3. Confirmed the uncovered lane: `sdk.ts` calls `setDefaultStreamFn(compat.streamSimple)`, which dispatches from the pi-ai api registry that still holds the built-in Anthropic transport.
4. Confirmed [pi#6089], the upstream ask, is closed `NOT_PLANNED` — auto-closed by the new-contributor bot and never reopened. No upstream relief is pending.

#### The decisive finding the issue did not surface

The pi-ai api registry is keyed by **api**, not by provider, and `anthropic-messages` is shared by ten built-in providers.
Nine of them use the bare `anthropicMessagesApi()`, so an override would be byte-identical for them.
`cloudflare-ai-gateway` wraps it in `cloudflareStreams(...)`, which substitutes `{CLOUDFLARE_ACCOUNT_ID}` / `{CLOUDFLARE_GATEWAY_ID}` into `model.baseUrl` — provider-layer behavior an api-registry entry structurally cannot see.
Checked whether it could be reconstructed and found it cannot: `builtinModels` is not exported from `@earendil-works/pi-ai/compat`, and `getProviders()` returns id strings rather than `Provider` objects.

#### Decisions

1. Declined the reporter's `registerApiProvider` fix.
   The operator's constraint — "Anthropic API-based interface or any other providers should not be using, nor affected by, this extension, at all" — cannot be satisfied by a global, api-scoped registry write.
   Presented the per-provider delta table before asking; the operator chose docs-only over an opt-in flag or an always-on bridge.
2. Rejected an env-gated opt-in bridge as an alternative.
   It would have kept the blast radius opt-in, but still ships a code path we know is wrong for one provider, and adds a second supported configuration to reason about.
3. Included one test change in an otherwise docs-only plan.
   `test/index-registration.test.ts`'s `createFakePi` reimplements the removed `ModelRegistry.applyProviderConfig` bridge, so the Issue #28 regression guard currently validates a mechanism that no longer exists.
   Flagged in Open Questions as droppable if the operator wants strictly documentation.
4. Added a new pinning test to the plan: the `anthropic-messages` api-registry entry must be unchanged after registration.
   This moves the documented coverage boundary out of prose and into the suite.
   Noted it cannot be driven red-first and specified mutation verification instead.

#### Scope and continuity

1. Issue #49's retrospective explicitly deferred `docs/architecture.md` and its Mermaid diagram here; that deferral is honored as steps 2 of the plan.
2. Ran `gh issue view 49` before planning, following the `AGENTS.md` gotcha that Issue #49's own retro added — the same gotcha that exists because that session missed this connection.
3. Scoped out re-filing the upstream ask; recorded it as an Open Question instead.

## Stage: Implementation — Build (2026-08-08T22:40:00Z)

### Session summary

Executed all six plan steps: one test-harness rework and five documentation passes correcting the removed `registerApiProvider` bridge across `docs/architecture.md`, `src/index.ts`, `src/oauth-transport.ts`, `AGENTS.md`, `.pi/skills/anthropic/SKILL.md`, `README.md`, and both seam decision records.
Added a pinning test that registering the extension must leave the built-in `anthropic-messages` api-registry entry untouched, and verified both it and the rescoped Issue #28 guard by mutation.
A seventh commit cleared the pre-completion reviewer's WARN findings; the re-review returned PASS.

### Observations

#### Deviations from the plan

1. One extra commit beyond the planned six.
   The pre-completion reviewer found four additional stale passages the plan's file list had missed, and a broad grep during that fix surfaced a fifth in `src/host-transport.ts` that the reviewer had also missed.
   All five were the same class of falsehood this issue exists to remove, so they were fixed rather than deferred.
2. The plan's Module-Level Changes section under-enumerated `AGENTS.md`.
   It listed four passages; the file actually carried six, because the stale "the registry entry for `anthropic-messages` is our own wrapper, so reading the delegate from it would loop" rationale appears in both § Extension Surface and the § Registering `streamSimple` gotcha.
   The plan's own guidance to grep for reworded mechanisms rather than removed symbols was the right instinct but was applied to the coverage claim only, not to the recursion rationale.

#### Verification

1. Both new assertions were mutation-verified rather than assumed.
   Adding a `registerApiProvider` call to `src/index.ts` failed the registry-untouched pin; switching the delegate to `getApiProvider("anthropic-messages").streamSimple` failed the Issue #28 guard's `registryStubCalls === 0` assertion.
   Neither could be driven red-first, since the current source already satisfies both.
2. The Mermaid rewrite was checked with `mmdc` and the rendered SVG was grepped to confirm the `stroke-dasharray` class actually applied to the uncovered lane, rather than assuming the `classDef` took effect.

#### Decisions made during implementation

1. Kept `docs/architecture.md` on its existing inline-link convention rather than introducing reference-style definitions for a subset of issues.
   The file has no link definitions today, and mixing the two styles would be worse than either.
2. Modelled the fake host's `dispatch` on `provider-composer.streamWith`'s extension branch only, omitting the `base` and api-registry fallbacks.
   Including branches no test exercises would have been dead code in the harness; the uncovered lane is expressed instead by the separate registry-untouched pin.
3. Left `docs/builtin-transport-seam-gap.md`'s description of `registerApiProvider`'s internals (`Map.set`, no decorator form, `wrapStreamSimple` validates only `model.api`) intact — it is a statement about pi-ai, which has not changed.

#### Pre-completion review

First dispatch: WARN — five stale passages, all non-blocking, all pre-dating the plan's file list.
After the fix commit, re-review returned PASS with all six passages (including the one it originally missed) confirmed corrected, all deterministic gates green, and all three pinned invariants holding.

## Stage: Final Retrospective (2026-08-09T22:50:06Z)

### Session summary

Took a third-party bug report from planning through release across three stages in one session: verified every technical claim against the upstream clone, declined the reporter's proposed fix on evidence the report itself did not surface, corrected the disproven mechanism across nine files, and shipped `v2.0.3`.
Seven commits landed plus the release; issues #46 and #49 both closed.
The dominant theme across all three stages was the same one the issue is about — a claim that was true once, went stale, and survived in more places than anyone enumerated.

### Observations

#### What went well

1. **The two-round `ask_user` gate produced a materially better decision than either round alone would have.**
   Round one offered four directions; the operator declined all of them and asked a free-form question instead — "Explain to me what we would be registering, and how that would impact built-in providers."
   That redirect forced the per-provider delta table (turns 27–31), which converted `cloudflare-ai-gateway` from a footnote in the round-one summary into the decisive disqualifier.
   Round two then got a one-word answer.
   This is the `ask-user` skill's "attempt 2 must be narrower" pattern working as designed, with the narrowing supplied by the operator rather than the agent.

2. **Mutation verification recurred, and scaled to two assertions.**
   Neither new assertion could be driven red-first, since the current source already satisfied both.
   Turn 56 added a `registerApiProvider` call to `src/index.ts` and confirmed the registry-untouched pin failed; turn 57 repointed the delegate at the registry and confirmed the Issue #28 guard's `registryStubCalls === 0` assertion failed.
   Issue #49's retro recorded this technique appearing for the first time; it is now the default for assertions that cannot go red first.

3. **The Mermaid check went past "it renders."**
   Turn 65 grepped the generated SVG for `stroke-dasharray` to confirm the `classDef gap` actually applied to the uncovered lane.
   `mmdc` exits zero on a diagram whose `classDef` silently does nothing, so rendering success alone would not have caught a styling no-op that carried real meaning here.

4. **A mechanical grep sweep caught what both the plan and the reviewer missed.**
   After fixing the reviewer's five findings, `grep -rn "would loop"` (turn 89) surfaced a sixth occurrence in `src/host-transport.ts:42` that the plan's file list had not enumerated and the pre-completion reviewer's file-by-file read had not seen.

#### What caused friction (agent side)

1. `missing-context` — **The plan grepped for one stale claim's vocabulary and inherited the blind spot for the other.**
   Two distinct stale claims needed correcting: the *routing* claim ("routes through pi-ai's singleton API registry") and the *recursion rationale* ("the registry entry for `anthropic-messages` is our own wrapper, so reading the delegate from it would loop").
   The plan's Design Overview explicitly named both — it has a subsection headed "Correcting the stale recursion rationale."
   But every grep run during planning used routing vocabulary: turn 7 searched `registerApiProvider|api registry|API registry|singleton`, and turn 32 searched `contested|background agent|agentLoop|every OAuth call path`.
   Neither pattern matches "would loop" or the bare phrase "the registry entry," so `AGENTS.md` lines 78 and 421 never appeared, and Module-Level Changes listed four `AGENTS.md` passages where the file had six.
   Impact: a WARN verdict from the pre-completion reviewer, one unplanned commit (`e5d7d5c`), and a second reviewer dispatch — two subagent runs instead of one.
   The `plan-issue` prompt already carries the right rule ("reworded prose carries no removed symbol to match"); the failure was applying it to one mechanism and not the second one the plan had already identified.

2. `other` — **The pre-completion reviewer's file-by-file read missed an occurrence a one-line grep found.**
   The reviewer reported five stale passages and declared the sweep complete; `src/host-transport.ts:42` carried a sixth.
   Impact: none — caught before commit by the broad grep at turn 89.
   Worth recording because it shows the reviewer is not a substitute for a mechanical sweep on "correct every occurrence of X" work, and the agent should not treat a reviewer's enumeration as exhaustive.

3. `instruction-violation` (self-identified, no impact) — **The `colgrep` and `testing` skills were never loaded despite the `plan-issue` prompt naming both.**
   The prompt says to load `colgrep` before code exploration and `testing` when the plan involves test changes; the plan involved a test change.
   Impact: no observable cost — most exploration was in the upstream clone against known symbol names, where exact grep is the correct tool, and the `testing` conventions were already in context from `AGENTS.md`.
   But the connection to friction point 1 is worth noting: "routes through the API registry" and "the registry entry is our own wrapper, so reading it would loop" are the *same claim* semantically while sharing no keywords, which is precisely the gap `colgrep` exists to close.
   This is the first concrete case in this repo where semantic search would have caught something exact grep structurally could not.

4. `other` — **A wrong instruction in `.pi/prompts/ship-issue.md` produced a false intermediate report.**
   Step 4b asserts that a range of only `refactor`/`docs`/`style`/`chore`/`test` commits means "release-please will cut nothing now; the work auto-batches until a `feat`/`fix` lands."
   Turn 114 followed that instruction and reported exactly this.
   It is false for this repo: `release-please-config.json` declares `changelog-sections` for `docs`, `chore`, `test`, `refactor`, `style`, `build`, and `ci`, which makes every Conventional Commit type releasable.
   Both `v2.0.2` and `v2.0.3` were cut from ranges containing no `feat` and no `fix`.
   Impact: no rework — `release_pr_find` at turn 121 contradicted it and turn 123 self-corrected — but the final report needed a visible retraction, and the prompt will reproduce the error on every future docs-only ship.

5. `other` (trivial) — `git log --oneline 8` at turn 95, missing the `-`.
   Impact: one wasted tool call.

#### What caused friction (user side)

1. **"Please also keep in mind Issue 49" (turn 5) was the highest-leverage message of the session, and it arrived at the right time.**
   It landed before any investigation, and it is what connected #46 to #49's explicitly deferred follow-up — which in turn is why #49 could be closed at ship time rather than lingering.
   No change suggested; this is the pattern working.

2. **Declining all four `ask_user` options in favor of a free-form question was more effective than picking one would have been.**
   "I don't want to introduce *worse* behaviors" named the actual decision criterion, which none of the four options had made explicit.
   Opportunity, framed as such: the same criterion stated in the original issue-triage context would have let round one present the per-provider impact table directly, saving one round trip — though the round trip was cheap and the outcome was better for it.

### Diagnostic details

#### Model-performance correlation

Three models ran, attributed by interleaving `model_change` with the assistant turns beneath it:

1. `anthropic/claude-opus-5` — turns 2–47 (planning: upstream archaeology, the third-party decision gate, the per-provider impact analysis) and turns 49–100 (build: test rework, doc authoring, Mermaid design).
   Judgment-heavy throughout; appropriate.
2. `anthropic/claude-sonnet-5` — turns 102–129 (`/ship-issue`).
   Mechanical execution against a fully specified prompt; a sensible downshift.
   Its one factual error traces to a wrong prompt instruction rather than model capability, and it self-corrected as soon as `release_pr_find` returned evidence.
3. Two `pre-completion-reviewer` subagent dispatches (turns 85 and 94), model not recorded in the session transcript.

No mismatch found: no reasoning-weak model on judgment-heavy work, no high-cost model on purely mechanical work.

#### Escalation-delay tracking

No `rabbit-hole` friction points this session, so no sequence qualifies.
The longest single-topic run was the upstream archaeology at turns 10–25 (roughly sixteen consecutive `grep`/`sed` calls into `~/development/pi/pi`), but each call returned new information and narrowed the question; it was productive investigation, not repeated failure against one error.
Not flagged.

#### Unused-tool detection

1. `colgrep` — available, named by the prompt, never used.
   See friction point 3: this is the first case in this repo with a concrete cost model, since the two stale claims are semantically identical and lexically disjoint.
2. No `Explore` subagent — not a miss; the exploration was symbol-directed against a known upstream tree.
3. `pre-completion-reviewer` — dispatched twice, correctly, and the second dispatch confirmed the fixes rather than being assumed.

#### Feedback-loop gap analysis

No gap.
Verification ran incrementally throughout rather than only at the end: baseline `check` and `lint` at turn 51, `check` plus `test` at 55, the two mutation runs at 56–57, a full gate at 58, `lint` after each doc commit at 63, 70, 76, and 80, the full gate plus `fallow:dead-code` at 82, a stale-claim sweep at 83, and full gates again at 89 and 92 after the WARN fixes.
This is a continued improvement over the pattern flagged in earlier retros.

### Changes made

1. `.pi/prompts/ship-issue.md` § 4b — removed the false claim that a range of only `refactor`/`docs`/`style`/`chore`/`test` commits produces no release.
   Replaced with the repo fact (`changelog-sections` makes every Conventional Commit type releasable, evidenced by `v2.0.2` and `v2.0.3`) and an instruction to let `release_pr_find` answer the question rather than predicting it.
2. `.pi/prompts/plan-issue.md` § Module-Level Changes — tightened the existing reworded-prose grep rule: when Design Overview names more than one stale claim, grep once per claim using that claim's own vocabulary.
3. `.pi/prompts/build-plan.md` § After the last step — added item 4 prescribing a final mechanical grep for the *old* phrasing when the change corrects a recurring claim, and renumbered the two items after it.
4. `docs/retro/0046-background-agent-coverage-gap.md` — added this Final Retrospective stage entry.

### Follow-ups not implemented here

1. No `colgrep` rule was added.
   The `plan-issue` prompt already instructs loading the skill; this session violated an existing instruction rather than lacking one, and a second rule would duplicate it.
   If the semantic-vs-lexical gap recurs, the lever is making the existing instruction more prominent, not adding a new one.

[pi#6089]: https://github.com/earendil-works/pi/issues/6089
