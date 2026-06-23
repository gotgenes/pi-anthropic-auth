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
