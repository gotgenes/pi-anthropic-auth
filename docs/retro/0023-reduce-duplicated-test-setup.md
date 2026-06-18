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
