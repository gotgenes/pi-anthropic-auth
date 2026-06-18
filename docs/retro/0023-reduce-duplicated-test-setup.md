---
issue: 23
issue_title: "Reduce duplicated test setup flagged by fallow"
---

# Retro: #23 — Reduce duplicated test setup flagged by fallow

## Stage: Planning (2026-06-18T00:00:00Z)

### Session summary

Planned a behavior-preserving test-suite refactor to reduce the duplication `fallow` flags, concentrated on the two named clone families (`test/system-prompt-shaping.test.ts`, 82 lines; `test/oauth-transport.test.ts`, 23 lines).
The plan extracts per-file fixture builders and assertion-invariant helpers while keeping every act explicit, and explicitly scopes out the `src↔test` fixture clone and the pinned ordering experiments.
Wrote and committed `docs/plans/0023-reduce-duplicated-test-setup.md`.

### Observations

- Issue is operator-authored (`gotgenes`) and the proposed approach is unambiguous and backed by the `testing` skill, so the `ask_user` gate was skipped.
- No `(#23)` / `[#23]` reference exists in `docs/architecture.md`, so the release recommendation is **ship independently**.
- This is a refactor with no red phase — recommended `/build-plan` over `/tdd-plan`; the safety net per step is the green suite plus a shrinking `pnpm fallow:dupes` report.
- Per-file dedup strategy differs by clone shape: assertion-invariant helper (`assertPreambleReplaced`) + `piPrompt` builder for system-prompt-shaping; `describe`-scoped `beforeEach` + `resolveOnPayload` for oauth-transport; a shared `CLAUDE_CODE_IDENTITY` constant for request-shaping.
- Deliberately preserved as legitimate clones: `src/request-shaping.ts:78-92` ↔ test fixture (dup:bd6fc547) and the two ordering experiments (dup:8ba4938d).
- Expected no production-code change — only test files, with at most a shared test fixture constant.

## Stage: Implementation — Build (2026-06-18T16:30:00Z)

### Session summary

Executed the two primary plan steps: consolidated `test/system-prompt-shaping.test.ts` via `piPrompt` and `assertPreambleReplaced` helpers, and shared `test/oauth-transport.test.ts` wiring via a `describe`-scoped `beforeEach` plus a `resolveOnPayload` resolver.
Duplication dropped from 9 groups / 249 lines (10.7%) to 4 groups / 146 lines (6.3%), eliminating both named clone families.
No production code changed; full suite (46 tests), `pnpm run check`, and `pnpm run lint` all green.

### Observations

- Deviation from the plan: step 3 (request-shaping `CLAUDE_CODE_IDENTITY` constant) produced no commit.
  Inspecting the flagged clone `dup:eaae50df` (lines 66-77 vs 219-239) showed it is the act + billing-header assertion sequence (the genuine test subject), not the Claude Code identity literal the plan assumed — line 70 is `"Generic system prompt."`, not the identity block.
  Collapsing it would require wrapping `shapeAnthropicOAuthPayload`, which the issue forbids, so it is left as-is. This resolves the plan's Open Question #1.
- Remaining 4 clone groups are all legitimate: `dup:8ba4938d` (pinned ordering experiments, Non-Goal), `dup:eaae50df` (request-shaping act+assert), `dup:a06c0a0a` (system-prompt-shaping act+invariant residual — not collapsible without wrapping the act), and `dup:bd6fc547` (`src↔test` fixture, Non-Goal).
- `assertPreambleReplaced` is assertion-only, `resolveOnPayload` returns the captured callback (not the shaped result), and `piPrompt` is a fixture builder — every act stays explicit and inline, satisfying the issue's no-act-wrapping constraint.
- Pre-completion reviewer: PASS (deterministic checks all pass; both acceptance criteria code-verified).

## Stage: Final Retrospective (2026-06-18T23:39:30Z)

### Session summary

Shipped issue #23 end-to-end across three sessions (Planning → Build → Ship): a behavior-preserving test-dedup that dropped `fallow` duplication from 9 groups / 249 lines (10.7%) to 4 groups / 146 lines (6.3%).
The ship session also absorbed a user-requested `CLAUDE_CODE_VERSION` bump (`2.1.150` → `2.1.169`, commit `c0b7617`), which became the releasing `fix:` that cut `v0.6.0` and batched the previously-unreleased workflow-skill work.

### Observations

#### What went well

1. The plan's `Open Question #1` mechanism paid off exactly as designed.
   Planning flagged the request-shaping clone (`dup:eaae50df`) as its lowest-confidence call and pre-wrote a conditional ("if the remaining fragment proves to be the genuine test subject, leave it and note the decision").
   At build time that uncertainty resolved against the plan's assumption with **zero rework** — the hedge absorbed a planning miss instead of cascading into a bad commit.
   This is a reusable pattern: when a plan step rests on an unverified assumption, encode the checkpoint as an Open Question rather than committing to the prescription.
2. The `release-please` `UNSTABLE` / empty-`statusCheckRollup` case was handled cleanly per the `/ship-issue` playbook exception — verified the rollup was empty (the `GITHUB_TOKEN`-no-checks case), then merged with `gh pr merge --rebase` and fast-forwarded, landing `v0.6.0` linearly.

#### What caused friction (agent side)

1. `missing-context` — the Planning stage described `dup:eaae50df` as "the system-block literal carrying the Claude Code identity text" and prescribed a `CLAUDE_CODE_IDENTITY` constant, but never read the exact fallow-reported line ranges (`66-77`, `219-239`).
   Line 70 is `"Generic system prompt."`, not the identity block — the clone was the act + billing-header assertion sequence (the genuine test subject), not a fixture literal.
   `fallow` reports coordinates, not contents; the secondary clone got an assumption while the two primary families were correctly pinned.
   Impact: no rework (the plan's own Open Question #1 caught it), but step 3 produced no commit and the plan's request-shaping Design/Module-Level sections were partly wrong.
2. `missing-context` — the ship-time `CLAUDE_CODE_VERSION` bump embedded a user-provided value (`2.1.169`) without verifying it against the source the `constants.ts` comment names (`claude --version` or the upstream repo); `web_search` was available and unused.
   Self-identifiable (the constant's own doc comment prescribes verification).
   Impact: no observed harm, but a wrong Claude Code version silently degrades OAuth billing acceptance — exactly the failure mode that comment warns about — so the unverified commit carried latent risk for a one-call confirmation cost.

#### What caused friction (user side)

1. The `2.1.169` version bump arrived mid-ship, after release coordination had already been decided from the plan.
   It landed cleanly as a `fix:` (and usefully became the releasing commit), so no rework resulted — but folding a production-behavior change into the ship step means it skipped the plan/build review path the test work went through.
   Opportunity, not criticism: version bumps that affect OAuth billing could ride their own tiny commit/PR before `/ship-issue` so they get the same green-baseline scrutiny.

### Diagnostic details

1. Unused-tool detection: friction #2 had `web_search` available to confirm the latest Claude Code version in one call; it was not dispatched.
2. Feedback-loop gap analysis: clean — verification (`pnpm run check`, `pnpm run lint`, `pnpm test`) ran incrementally after every build step and again before the ship push, including after the `constants.ts` edit.
   No end-only verification.
3. Model-performance and escalation-delay lenses: not actionable — the only subagent dispatch (`pre-completion-reviewer`, a judgment-appropriate task) ran in the prior Build session and is not introspectable here; this Ship + Retro session dispatched no subagents and hit no rabbit-holes (no >5-call error loops).

### Changes made

1. `.pi/skills/fallow/SKILL.md` — added `Key gotchas` item 7: duplication reports coordinates, not contents, so read each clone group's exact line ranges before prescribing a fix (act+assert subject vs extractable fixture).
2. `src/constants.ts` — appended "confirm even when a value is handed to you" to the `CLAUDE_CODE_VERSION` verification comment.
