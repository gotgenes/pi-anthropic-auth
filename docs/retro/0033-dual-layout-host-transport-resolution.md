---
issue: 33
issue_title: "compat: adapt host-transport resolution to upstream pi-ai breaking changes"
---

# Retro: #33 — compat: adapt host-transport resolution to upstream pi-ai breaking changes

## Stage: Planning (2026-06-23T00:00:00Z)

### Session summary

Planned the host-transport adaptation for the unreleased pi-ai API-split breaking change.
Discovered the issue's prescribed hard-swap would break the currently-installed `0.79.1` (peer floor `>=0.79.1`), confirmed a dual-layout strategy with the operator via `ask_user`, and wrote `docs/plans/0033-dual-layout-host-transport-resolution.md`.

### Observations

- Key finding: the breaking changes are unreleased and the installed pi-ai is `0.79.1`, so a literal path/export swap (as the issue body proposed) regresses every current install and fails the live `host-transport.test.ts` immediately.
  This drove the divergence from the issue's "Resolution" section.
- Operator chose the dual-layout resilient resolver (new `dist/api/anthropic-messages.js` → `streamSimple` first, legacy `dist/providers/anthropic.js` → `streamSimpleAnthropic` fallback) over a hard swap + peer bump or a tracking-only defer.
- Design splits the resolver into an IO edge (`resolveBuiltinAnthropicStreamSimple`) and an injectable pure selector (`selectAnthropicStreamSimple`) so the new-layout branch is unit-testable via a fake `ModuleImporter` without installing the unreleased pi-ai.
- The Issue #28 invariant (resolve the delegate directly, never from the lazy registry stub) is preserved and stays pinned by `test/index-registration.test.ts`, which mocks `#src/host-transport`.
- Deferred (Non-Goals/Open Questions): Issue #31 (`import.meta.resolve` failing on `pi install`), the eventual devDependency bump that forces `test/index-registration.test.ts` registry imports onto `@earendil-works/pi-ai/compat`, and retiring the legacy candidate once the peer floor is raised.
- Verified upstream facts against `~/development/pi/pi/packages/ai`: `streamSimpleAnthropic`/`streamAnthropic` removed from source; `./anthropic` maps to `dist/api/anthropic-messages.js`; `StreamFunction` signature unchanged so the delegate type alias still fits both export names.
- Next step is `/tdd-plan` (the plan has red→green test cycles).

## Stage: Implementation — TDD (2026-06-23T11:36:00Z)

### Session summary

Completed both TDD steps: the dual-layout selector (`fix:` commit) and doc updates (`docs:` commits).
Test count went from 50 to 55 (+5 unit tests for `selectAnthropicStreamSimple`).
Pre-completion reviewer returned WARN (no FAILs); one finding fixed before ship.

### Observations

- Deviation from plan: the `new URL("../..", rootUrl)` URL-resolution shortcut for deriving `packageDir` was wrong for pnpm's virtual-store layout (`node_modules/@earendil-works/pi-ai` = two path segments, so URL `../..` lands at `@earendil-works/` not at `pi-ai/`).
  Restored `dirname(dirname(fileURLToPath(rootUrl)))` from the original code, which is proven correct.
  The original two-`dirname` comment (`<pkg>/dist/index.js` → `<pkg>/dist` → `<pkg>`) correctly describes both flat and scoped-package pnpm layouts.
- WARN finding: `AGENTS.md` was not listed in the plan's Module-Level Changes but also contains `streamSimpleAnthropic` references (lines 44, 79, 418).
  Fixed in a follow-up `docs:` commit before running `/ship-issue`.
  Future doc-update plans should grep `AGENTS.md` alongside `docs/` and `.pi/skills/` when softening version-specific symbol references.
- Pre-completion reviewer verdict: WARN (one finding — AGENTS.md omission, fixed before ship).
  All deterministic checks PASS.

## Stage: Final Retrospective (2026-06-23T12:00:00Z)

### Session summary

A single conversation carried issue #33 end-to-end: impact analysis of the upstream pi-ai CHANGELOG, authoring issue #33, `/plan-issue`, `/tdd-plan`, and `/ship-issue` (released `v0.6.3`).
The shipped change makes `src/host-transport.ts` resolve Pi's built-in Anthropic transport through an ordered candidate list (new `dist/api/anthropic-messages.js` → `streamSimple` first, legacy `dist/providers/anthropic.js` → `streamSimpleAnthropic` fallback), surviving the unreleased pi-ai API-split without dropping any current 0.79.x install.
Test count rose 50 → 55; four `(#33)` commits plus the release landed cleanly.

### Observations

#### What went well

- The planning-stage catch that the issue's own prescribed "Resolution" (hard swap) would break every installed 0.79.x was the highest-leverage moment of the session.
  It came from checking the *installed* version in `node_modules` (`0.79.1`) and the peer floor (`>=0.79.1`), not from trusting the issue body — and was surfaced via a single decisive `ask_user` before any code was written.
- The DIP split (`selectAnthropicStreamSimple` + injected `ModuleImporter`) let the new-layout branch be unit-tested deterministically against a layout that does not yet exist on disk — a genuinely useful pattern for forward-compat code.
- The feedback loop worked as designed: the deliberately-retained real-install integration test in `test/host-transport.test.ts` caught a self-introduced regression (below) on the first `pnpm test` run, before commit.
  Verification ran incrementally (per-file after red and green, full suite + `check` after the step, `lint` + `fallow:dead-code` before ship), not just at the end.

#### What caused friction (agent side)

- `instruction-violation` (self-identified) — during the green step I wrote the package-dir derivation as `fileURLToPath(new URL("../..", rootUrl))` instead of the `dirname(dirname(fileURLToPath(rootUrl)))` the plan's own Design Overview specified.
  `new URL("../..")` strips the filename first, so two `..` segments overshoot to `@earendil-works/` under pnpm's scoped-package layout, and both candidate imports failed.
  Impact: ~4 extra tool calls (failing integration test, two `node` debug one-liners, the edit) and no rework beyond the fix — the integration test caught it immediately.
- `missing-context` — the plan's Module-Level Changes grepped `docs/architecture.md` and `.pi/skills/anthropic/SKILL.md` for `streamSimpleAnthropic` but not `AGENTS.md`, which carried three stale references (lines 44, 79, 418).
  The pre-completion reviewer caught it (automated, not the operator), forcing a follow-up `docs:` commit (`3bb330f`).
  Impact: one extra commit; caught before ship.
- `premature-convergence` — at issue-creation time I wrote a confident "Resolution" (hard path/export swap) into issue #33 based on the upstream *source repo* state (pi-mono at `0.79.10`, already new-layout) without checking what was *installed*.
  Impact: zero rework — `/plan-issue` is designed to treat the issue as a hypothesis and re-evaluated it — but the issue body shipped a flawed prescription that planning had to walk back.

#### What caused friction (user side)

- None material.
  The operator's involvement was strategic: answered the impact question, requested the issue, ran the standard workflow prompts, and resolved the one planning `ask_user` decisively.

### Diagnostic details

- Model-performance correlation: the only subagent dispatch was the `pre-completion-reviewer`, which did judgment-heavy doc/design review and produced the actionable AGENTS.md WARN — no model/task mismatch.
  Session `model_change` entries showed a cluster of `opencode-go/*` selections with no turns under them (transient picker cycling); substantive work ran on the Claude models.
- Escalation-delay tracking: the `new URL` regression resolved in ~4 consecutive tool calls (under the 5-call threshold); no subagent or user escalation warranted.
- Feedback-loop gap analysis: no gap — verification was incremental throughout, and the real-install integration test is what flagged the regression.

### Changes made

1. `.pi/prompts/plan-issue.md` — added `AGENTS.md` alongside `.pi/skills/anthropic/SKILL.md` in both Module-Level Changes grep instructions (symbol rename/removal and mechanism rewording), so renamed-symbol audits at plan time cover `AGENTS.md` too.
