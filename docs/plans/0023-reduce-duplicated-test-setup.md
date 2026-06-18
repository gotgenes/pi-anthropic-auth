---
issue: 23
issue_title: "Reduce duplicated test setup flagged by fallow"
---

# Reduce Duplicated Test Setup Flagged by Fallow

## Release Recommendation

**Release:** ship independently

This issue is a self-contained test-suite cleanup.
It is not part of any architecture roadmap batch (no `(#23)` / `[#23]` reference exists in `docs/architecture.md`), so it ships on its own.

## Problem Statement

`fallow`'s non-blocking full report flags 249 lines (10.7%) of duplication across 5 files, almost all of it repeated arrange/assert scaffolding in the test suite.
Two clone families carry the bulk: `test/system-prompt-shaping.test.ts` (4 groups, 82 lines) and `test/oauth-transport.test.ts` (2 groups, 23 lines).
The goal is to tidy this genuine duplication without weakening assertions or wrapping the system-under-test call, so the dupes signal drops and the suite stays a clear behavioral spec.

## Goals

- Reduce duplication reported by `pnpm fallow:dupes`, concentrated on the two named test clone families.
- Extract shared *arrange* (fixture construction, transport wiring) into describe-scoped `beforeEach` blocks or small inline fixture builders.
- Extract repeated *assertion* invariants into small named assertion helpers where the same invariant is checked across several tests.
- Keep every test's *act* (the call under test) explicit and inline.
- Keep `pnpm test` green and assertions strong (`toBe`/`assert.equal`/`assert.match` on specific markers — no act-under-test wrapping, no subset-matcher weakening).

This change is **not breaking**: it touches only test files (plus, at most, a shared test fixture constant). No production code, exported API, default, or output shape changes.

## Non-Goals

- Not promoting the `dupes` rule to a hard CI gate — duplication stays a non-blocking signal in the full report.
- Not touching production code beyond what is needed to share a genuine helper (the plan expects no production change).
- Not eliminating the `src/request-shaping.ts:78-92` ↔ `test/request-shaping.test.ts:15-29` clone (dup:bd6fc547) — that test fixture deliberately mirrors the production request shape and is expected.
- Not collapsing the two `pi-anthropic-ordering-experiment.test.ts` experiments (dup:8ba4938d) — they are pinned experiments that deliberately document two distinct serialization scenarios; merging their fixtures would obscure intent.
- Not creating a cross-file shared fixtures module — per the issue, prefer small inline (per-file) fixture builders over a central abstraction.

## Background

Relevant files and their current clone groups (from `pnpm fallow:dupes`):

1. `test/system-prompt-shaping.test.ts` — 4 overlapping groups (dup:8a2a8021, d7ec7736, ffeae435, 884881bc) spanning lines 133-256.
   Each affected test builds a `[PI_PREAMBLE, "", ...sections].join("\n")` prompt, calls `shapeAnthropicOAuthSystemPrompt(...)`, then repeats the same invariant assertions: minimal prompt prepended (`/^You are an expert coding assistant\./`) and Pi identity removed (`/operating inside pi, a coding agent harness/` absent).
2. `test/oauth-transport.test.ts` — 2 groups (dup:24464239, f590a8ab) spanning lines 103-177.
   Each affected test repeats the transport-wiring arrange (`createCapturingDelegate()` + `createAnthropicOAuthStreamSimple(delegate)`) and the captured-callback extraction (`const onPayload = calls[0]?.options?.onPayload; assert.ok(onPayload);`), then invokes the wrapped transport and the captured `onPayload` (the acts).
3. `test/request-shaping.test.ts` — 1 group (dup:eaae50df, lines 66-77 ↔ 219-239).
   The repeated fragment is the system-block literal carrying the Claude Code identity text, present both inside `createOAuthPayload()` and in a test that passes its own `system` override.
4. `test/pi-anthropic-ordering-experiment.test.ts` — 1 group (dup:8ba4938d) — out of scope (see Non-Goals).
5. `src/request-shaping.ts` ↔ `test/request-shaping.test.ts` — 1 group (dup:bd6fc547) — out of scope (see Non-Goals).

Constraints from `AGENTS.md` and the `testing` skill that apply:

1. Tests use `node:assert/strict` and vitest `test`; existing files are the reference style — keep new helpers consistent.
2. Group shared arrange in a describe-scoped `beforeEach`; keep the act explicit; do not wrap the system-under-test call in a helper just to clear a clone metric.
3. Prefer strong, whole-value assertions; when asserting shaped prompts, pin specific markers with regex rather than deep-equal on full strings.
4. `#test/*` and `#src/*` path aliases are available for imports.

## Design Overview

The dedup strategy differs per file because the duplicated slice differs (assertion scaffolding vs. wiring arrange vs. fixture literal). No production behavior changes, so the existing green suite is the safety net for every step.

### `test/system-prompt-shaping.test.ts` — assertion helper + prompt builder

The dominant clone is a repeated *assertion* invariant, not the act. Extract a single named assertion helper that pins the preamble-replacement invariant:

```typescript
function assertPreambleReplaced(shaped: string): void {
  assert.match(shaped, /^You are an expert coding assistant\./);
  assert.doesNotMatch(shaped, /operating inside pi, a coding agent harness/);
}
```

Each test keeps its explicit act (`const shaped = shapeAnthropicOAuthSystemPrompt(systemPrompt);`) and its case-specific assertions (preserved markers like `/# Project Context/`, `/## Custom Note/`), but the repeated two-line invariant collapses to one call.

For the repeated prompt construction, add a tiny inline builder so the `PI_PREAMBLE`-prefixed shape is expressed once:

```typescript
function piPrompt(...sections: string[]): string {
  return [PI_PREAMBLE, "", ...sections].join("\n");
}
```

Tests then read `piPrompt("# Project Context", "", "Project guidance.")` instead of re-spelling the array head. This is fixture construction, not act-wrapping. Cases that do not start from `PI_PREAMBLE` (e.g. the "leaves unrelated content unchanged" test) keep their own inline arrays.

### `test/oauth-transport.test.ts` — describe-scoped `beforeEach` + callback resolver

The repeated slice is wiring arrange plus captured-callback extraction. Wrap the OAuth-shaping tests in a `describe` block and move the transport construction into `beforeEach`, assigning to block-scoped `let` bindings:

```typescript
describe("createAnthropicOAuthStreamSimple onPayload", () => {
  let calls: CapturingDelegate["calls"];
  let wrapped: ReturnType<typeof createAnthropicOAuthStreamSimple>;

  beforeEach(() => {
    const capturing = createCapturingDelegate();
    calls = capturing.calls;
    wrapped = createAnthropicOAuthStreamSimple(capturing.delegate);
  });
  // each test keeps wrapped(...) and onPayload(...) explicit
});
```

The repeated callback extraction (`calls[0]?.options?.onPayload` + `assert.ok`) is plumbing, not the act, so resolve it through a small helper that returns the captured callback:

```typescript
function resolveOnPayload(calls: CapturingDelegate["calls"]): NonNullable<SimpleStreamOptions["onPayload"]> {
  const onPayload = calls[0]?.options?.onPayload;
  assert.ok(onPayload);
  return onPayload;
}
```

The acts stay explicit: `wrapped(MODEL, CONTEXT, { apiKey: ... })` (varying options per test) and `await resolveOnPayload(calls)(samplePayload(), MODEL)`. The `isAnthropicOAuthToken` test and the API-key pass-through test stay outside the `describe` if their arrange diverges, or join it if `beforeEach` cleanly covers them.

### `test/request-shaping.test.ts` — shared identity-block constant

The clone is the Claude Code identity system-block literal repeated between `createOAuthPayload()` and a standalone test payload. Introduce one inline constant for the identity text and reuse it:

```typescript
const CLAUDE_CODE_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude.";
```

Reference it from `createOAuthPayload()`'s default `system` and from the test that constructs its own `system` override (or route that test through `createOAuthPayload({ system: [...] })`). This is a small, secondary win; if review shows the remaining fragment is genuinely the test subject, leave it and note it.

### Edge cases and judgment

1. Some flagged groups may be legitimate — review each before changing it. If collapsing a clone would hide the test subject or weaken an assertion, leave it and record why.
2. New helpers live in the file that uses them (inline, per-file) — do not introduce a cross-file fixtures module.
3. Assertion helpers may group *assertions*; they must never invoke the system under test on the test's behalf.

## Module-Level Changes

Test files only — no production source, no docs, no architecture-layout updates (the affected files are tests, not modules tracked in `docs/architecture.md` complexity/layout tables; a grep of `docs/architecture.md` for these test paths confirms no listing references them).

1. `test/system-prompt-shaping.test.ts` — add `assertPreambleReplaced(shaped)` and `piPrompt(...sections)` helpers; route the affected tests (lines ~133-256) through them; keep each act and case-specific assertions explicit.
2. `test/oauth-transport.test.ts` — add `import { describe, beforeEach } from "vitest"` (extend the existing `test` import); wrap the onPayload-shaping tests in a `describe` with a `beforeEach`; add `resolveOnPayload(calls)`; keep `wrapped(...)` and `onPayload(...)` acts explicit.
3. `test/request-shaping.test.ts` — add a `CLAUDE_CODE_IDENTITY` constant and reuse it across `createOAuthPayload()` and the standalone payload test.

No exported symbols are removed or renamed, so no `src/`, `test/`, or `.pi/skills/anthropic/SKILL.md` symbol grep is required.
No documented mechanism wording changes, so no `SKILL.md` prose grep is required.

## Test Impact Analysis

This is a test-suite refactor, so the analysis is inverted from a production extraction:

1. **New tests enabled** — none; this change adds no new behavior and no new production seam to unit-test.
2. **Tests that become redundant** — none are removed. The repeated *assertion invariant* in `system-prompt-shaping.test.ts` is consolidated into `assertPreambleReplaced` but still runs once per test (same coverage, expressed once). No test is deleted.
3. **Tests that must stay as-is** — every act stays explicit and every case-specific assertion is preserved. The `src↔test` fixture clone (dup:bd6fc547) and the two ordering experiments (dup:8ba4938d) stay byte-for-byte unchanged because they genuinely exercise / document their respective shapes.

## Invariants at Risk

The system-prompt-shaping suite pins behavior landed under issue #9 (preserving content appended between the preamble and Project Context) and the degraded-mode fallbacks. These invariants must remain pinned after consolidation:

1. Preamble replaced + Pi identity removed — now asserted via `assertPreambleReplaced` (same regexes, same strength).
2. Appended-content preservation (`## Custom Note`, trailing footer, end-of-prompt content) — case-specific assertions stay inline per test.
3. Warn-once fallback paths (`_resetShapingWarnings`, `console.warn` capture) — untouched; not part of any clone group.

After each step, run the full suite (`pnpm test`) to confirm no invariant regressed, since esbuild does not typecheck and a green suite is the only behavioral backstop.

## TDD Order

This is a behavior-preserving refactor with no red phase: there are no new failing tests to write.
The safety net for each cycle is the existing suite staying green plus `pnpm fallow:dupes` showing reduced duplication.
Execute via `/build-plan` (non-TDD code change), not `/tdd-plan`.

Each cycle: refactor → `pnpm test` green → `pnpm fallow:dupes` reduced → commit.

1. **`system-prompt-shaping` consolidation** — add `assertPreambleReplaced` and `piPrompt`, route affected tests through them.
   Verify: `pnpm test test/system-prompt-shaping.test.ts` green; the 4 sps clone groups shrink in `pnpm fallow:dupes`.
   Commit: `test: consolidate system-prompt-shaping arrange/assert duplication (#23)`.
2. **`oauth-transport` consolidation** — extend vitest imports; add the `describe` + `beforeEach` and `resolveOnPayload`; keep acts explicit.
   Verify: `pnpm test test/oauth-transport.test.ts` green; the 2 oauth-transport clone groups shrink.
   Commit: `test: share oauth-transport wiring via beforeEach (#23)`.
3. **`request-shaping` identity constant** — add `CLAUDE_CODE_IDENTITY` and reuse it; if the remaining fragment proves to be the genuine test subject, leave it and note the decision in the commit body.
   Verify: `pnpm test test/request-shaping.test.ts` green; dup:eaae50df shrinks or is documented as legitimate.
   Commit: `test: dedupe Claude Code identity block in request-shaping fixtures (#23)`.
4. **Final verification** — run `pnpm test` (full suite) and `pnpm run check`; capture the before/after `pnpm fallow:dupes` summary to confirm the two named families dropped meaningfully.
   No separate commit unless step 1-3 left lint/typecheck drift to fix.

## Risks and Mitigations

1. **Over-abstraction weakening tests** — risk that a helper hides the test subject.
   Mitigation: helpers consolidate only arrange (fixtures, wiring) and repeated assertion *invariants*; every act stays inline; assertions stay strong.
2. **`beforeEach` shared-state leakage in `oauth-transport`** — mutable block-scoped `let` could carry state between tests.
   Mitigation: `beforeEach` rebuilds `calls`/`wrapped` from a fresh `createCapturingDelegate()` every test; no state survives across tests.
3. **Touching a legitimate clone** — some flagged groups are expected (src↔test fixture, pinned experiments).
   Mitigation: those are explicit Non-Goals and stay unchanged; per-group review precedes each edit.
4. **Silent coverage loss** — esbuild does not typecheck, so a refactor could drop an assertion unnoticed.
   Mitigation: run the full `pnpm test` after each step and `pnpm run check` at the end; confirm assertion count/strength is preserved per test.

## Open Questions

1. Whether `request-shaping`'s dup:eaae50df is worth collapsing or is genuinely the test subject — resolve during step 3 by inspecting the exact fragment; default to leaving it if collapsing would obscure intent.
2. Whether the `isAnthropicOAuthToken` and API-key pass-through tests in `oauth-transport.test.ts` should join the new `describe` block — resolve during step 2 based on whether the shared `beforeEach` cleanly covers their arrange without forcing unused wiring.
