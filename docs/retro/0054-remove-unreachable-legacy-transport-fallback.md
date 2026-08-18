---
issue: 54
issue_title: "Remove the unreachable streamSimpleAnthropic fallback in pickAnthropicStreamSimple"
---

# Retro: #54 — Remove the unreachable `streamSimpleAnthropic` fallback in `pickAnthropicStreamSimple`

## Stage: Planning (2026-08-18T00:12:00Z)

### Session summary

Planned the removal of the dead `streamSimpleAnthropic` branch in `src/host-transport.ts` as `docs/plans/0054-remove-unreachable-legacy-transport-fallback.md`.
Verified the issue's reachability claim directly against the `~/development/pi/pi` clone — `compat.ts` re-exports `anthropicMessagesApi` at both `v0.80.8` and `v0.84.2` — rather than taking the issue body's word for it.
The plan is three commits (source + tests, identifier renames, prose) plus a live `pi -e` repro gate and a `fallow:dead-code` gate.

### Observations

- `ask_user` gate: the issue argues both sides itself (a "Counter-argument" section defending the branch as insurance against a compat reshuffle), so the direction was genuinely open despite the issue being the operator's own.
  Operator chose **remove the branch, keep the throw**, and chose to fold in **both** stale identifier renames (`src/index.ts` local and the `test/index-registration.test.ts` mock).
- The counter-argument is answered in the plan's Design Overview rather than ignored: both handles are re-exported from the same `compat.ts` line group, so a reshuffle that drops the factory drops the alias with it and the fallback would throw one line later than the factory path already does.
- Framed the branch and the throw as guarding opposite directions in time — the branch guards backwards against a host the peer floor excludes, the throw guards forwards against the Issue #35 compat cliff.
  That framing is what makes "remove one, keep the other" coherent rather than arbitrary.
- Measured, not estimated: baseline is 60 tests across 8 files, 6 in `test/host-transport.test.ts`; predicted 59 after the rewrite (three fallback cases out, one merged negative pin in).
- Deliberate TDD deviation carried forward from the Issue #47 retro: step 1 lands test and source in one commit, because the new "throws when only the deprecated alias is present" case is red by construction against current source and a test-only commit would poison `git bisect`.
- Scope held against two adjacent open issues.
  Issue #56 (CI never exercises the `>=0.80.8` floor) is the reason the reachability claim is hand-verified rather than build-verified, and it was explicitly kept out of scope rather than folded in — the third `ask_user` option offered that bundle and was not chosen.
  Issue #53 is untouched.
- Prose sweep found five live locations plus two that only *look* stale: the handle-comparison table rows in `docs/builtin-transport-seam-gap.md:79` and `docs/builtin-transport-seam-upstream-request.md:67` describe pi-ai's own exports, not this package's logic, and stay accurate.
  Listed them in Non-Goals so implementation does not "fix" them.
- No follow-up issues filed — nothing the plan names is unowned.

## Stage: Implementation — TDD (2026-08-18T01:30:00Z)

### Session summary

Executed all three planned steps plus both verification gates: the fallback branch and its tests, the two identifier renames, and the prose corrections across `AGENTS.md`, `docs/architecture.md`, and `docs/builtin-transport-seam-gap.md`.
Tests went 60 → 59, exactly the predicted delta (three fallback cases out, one merged negative pin in).
No deviations from the plan; `check`, `lint`, `fallow:dead-code`, and the live `pi -e` repro are all green.

### Observations

- Tidy-First assessor returned **no preparatory commits**, and its reasoning is worth keeping: the `pickAnthropicStreamSimple` / `resolveBuiltinAnthropicStreamSimple` split was itself the preparatory refactor, landed in an earlier issue, which is what made this branch deletion surgical.
  It also flagged that the plan's own step order (behavior → mechanical rename → prose) already applies Tidy-First discipline.
- The Red step produced **one** failure, not three.
  "Throws when the factory is absent" and "throws when the factory yields no `streamSimple`" passed immediately, because their fixtures never carried the deprecated alias, so the old code already threw for them.
  Per the `testing` skill's rule about tests that pass during Red, they were classified as invariant pins rather than broken probes and kept; the single red was the new negative pin, which is precisely the behavior change.
- Proved the negative pin non-vacuous by mutation, one probe per assertion clause: reverting the branch produced `Missing expected exception` (clause 1), and re-widening the throw message to mention `streamSimpleAnthropic` produced `expected message not to offer the deprecated alias` (clause 2).
  Both clauses are live.
- The rename in step 2 tripped biome formatting — `builtinAnthropicStreamSimple` is long enough to push two lines past the width limit.
  Auto-fixed with `biome check --write` before committing, so the rename commit stayed rename-only.
- Neither behavior commit is `feat:`/`fix:`, so the changelog preview is empty by design.
  Removing unreachable code has no user-observable outcome; `refactor:` is the honest type, and the changelog-preview check in the template is what confirmed it rather than assumed it.
- Live `pi -e` repro round-tripped a real Anthropic OAuth request with tool use.
  This is the only check that covers the Issue #31 loader invariant — vitest and `jiti` resolve specifiers differently — and it remains prose-pinned rather than test-pinned, which the reviewer flagged as a standing (already-documented) gap.
- Pre-completion reviewer: **PASS**.
  One WARN-level note inside Cross-step invariants: invariant 3 (the `/compat` import surviving all three loader modes) is verified only by the live repro and cannot be asserted by a unit test — the same gap the plan and `AGENTS.md` already acknowledge, not a new finding.

## Stage: Final Retrospective (2026-08-18T04:05:01Z)

### Session summary

One session carried issue #54 from plan through TDD to a shipped `v2.0.6`: the unreachable `streamSimpleAnthropic` fallback is gone, tests went 60 → 59 exactly as predicted, and every gate (`check`, `lint`, `test`, `fallow:dead-code`, live `pi -e` repro, CI on both the push and the release) came back green.
No rework, no plan deviations, and no user corrections across all four stages.
The only friction was two self-caught command-construction slips costing one tool call each.

### Observations

#### What went well

- **Measurement replaced inference at all three decision points, and each prediction held.**
  Planning measured the test baseline (60 across 8 files, 6 in `test/host-transport.test.ts`) and predicted 59; TDD landed exactly 59.
  Planning verified the issue's reachability claim with `git show v0.80.8:packages/ai/src/compat.ts` and the same at `v0.84.2` rather than trusting the issue body.
  TDD proved the new negative pin non-vacuous by mutating each assertion clause separately.
  This is the pattern the #47 and #52 retros pushed for, now running unprompted.
- **The `testing` skill's "passes during Red" rule did real work.**
  The Red step produced one failure where the plan implied three.
  The rule — a test that passes during Red is either an invariant pin or a broken probe — forced the classification instead of letting the thin red slide by as "good enough" or trigger a pointless hunt for a bug.
- **A counter-argument written into the issue body produced a better `ask_user`.**
  Issue #54 argued its own opposing case (keep the branch as insurance against a compat reshuffle), which made the direction genuinely open despite being the operator's own issue.
  The plan answered that argument on the merits — both handles ship from the same `compat.ts` export group — rather than ignoring it.
- **Novel: the Tidy-First assessor's value was in its rejection reasoning, not a recommendation.**
  It returned zero preparatory commits and explained that the `pickAnthropicStreamSimple` / `resolveBuiltinAnthropicStreamSimple` split — landed by an earlier issue — *was* the preparatory refactor that made this deletion surgical.
  A "nothing to do" result that names why the groundwork already exists is more useful than a manufactured tidying.

#### What caused friction (agent side)

- `other` (command construction) — ran `git -C ~/development/pi/pi git show ...` with a duplicated `git` verb during the upstream verification, which failed with `git: 'git' is not a git command`.
  Impact: one wasted tool call, self-caught and retried immediately as `cd ~/development/pi/pi && git show`. No rework.
- `other` (diagnostic truncation) — batched `pnpm test`, `pnpm run check`, and `pnpm run lint` into a single `bash` call with each piped through `tail -N`, so the lint failure surfaced as a bare `× Some errors were emitted while running checks` with no indication of which tool or file failed.
  Impact: one extra tool call to re-run `pnpm run lint 2>&1 | head -40` and read the actual biome formatting diff. No rework; the gate still caught the issue before commit.
- `other` (plan precision) — the plan's TDD Order described all three rewritten throw-path cases as replacements without distinguishing which would actually be red.
  Two of them ("throws when the factory is absent", "throws when the factory yields no `streamSimple`") passed immediately, because their fixtures never carried the deprecated alias and the old code already threw for them.
  Impact: no rework — resolved by classification during the Red step — but a correct Red step briefly looked under-powered, which is the moment where an agent with less discipline reaches for a phantom bug.

#### What caused friction (user side)

- None.
  Both `ask_user` answers were decisive, and the second (fold in both identifier renames) pre-authorized the only scope expansion in the change, so no mid-implementation scope question arose.
- Opportunity, framed positively: the operator's involvement was strategic at exactly one point — the remove-vs-keep decision — and absent everywhere else, which is the right shape.
  The issue body doing the work of laying out its own counter-argument is what made that single touchpoint sufficient.

### Diagnostic details

#### Model-performance correlation

Attributed from the unfiltered session transcript (`.message.model` per assistant turn), not the `model_change`-filtered view, which renders phantom switches:

1. Planning — 17 turns on `anthropic/claude-opus-5`.
2. Implementation (TDD) — 34 turns on `anthropic/claude-opus-5`.
3. Ship — 24 turns on `anthropic/claude-sonnet-5`.
4. Retrospective — `anthropic/claude-opus-5`.

No mismatch: the judgment-heavy stages (design decisions, test classification, mutation probing) ran on the stronger model, and the procedural ship runbook (push, watch CI, close, merge, verify) ran on Sonnet, which handled the `GITHUB_TOKEN` empty-rollup fallback correctly without escalation.

Both subagents pin `anthropic/claude-sonnet-4-6` in `.pi/agents/`, a generation behind the models the session itself ran.
Neither underperformed — the pre-completion reviewer ran 35 tool uses, rendered the Mermaid block through `mmdc`, and returned a correctly-scoped PASS with one legitimate WARN nuance — so this is recorded as drift to watch, not a demonstrated problem.

#### Feedback-loop gap analysis

No gap.
Verification ran incrementally throughout rather than only at the end: full baseline (`check`, `lint`, `test`, `fallow:dead-code`) before Tidy First; `pnpm test test/host-transport.test.ts` at both Red and Green; `pnpm run check` immediately after the source edit; full suite before each commit; and the live `pi -e` repro plus `fallow:dead-code` before declaring done.
The biome formatting failure was caught by the gate at step 2, not at the end.

#### Lenses skipped

Escalation-delay and unused-tool detection both found nothing to report — there were no `rabbit-hole` or `missing-context` friction points, and no error consumed more than one retry.
`colgrep` went unused, correctly: every search this session targeted a known exact symbol (`streamSimpleAnthropic`, `anthropicMessagesApi`), which is the grep column of the `colgrep` skill's decision table.

### Changes made

1. `.pi/skills/testing/SKILL.md` — added a planning-side rule under § TDD planning rules § Step sequencing and breakage: a plan that rewrites existing tests must label each rewritten case **red** or **invariant pin**.
   It sits directly after the existing "plan's own measurement" rule, whose `feat:`-mistyping framing did not cover a `refactor:` step that rewrites tests, and complements the implementation-side rule already in § Test assertions.
2. `.pi/agents/pre-completion-reviewer.md` and `.pi/agents/tidy-first-assessor.md` — bumped the `model:` pin from `anthropic/claude-sonnet-4-6` to `anthropic/claude-sonnet-5`.
   Landed on the operator's call for cross-project consistency, overriding this retro's initial "no evidence, do not change" recommendation.
   Checking the parity source `~/development/pi/pi-packages/.pi/agents/` showed both agents pinned at `anthropic/claude-sonnet-5` there, so this restores workflow parity rather than inventing a pin — which is the stronger justification, and the one the recommendation missed by weighing only this session's performance evidence.
