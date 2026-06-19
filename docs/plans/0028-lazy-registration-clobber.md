---
issue: 28
issue_title: "Root cause: pi-ai 0.79.8 lazy provider registration clobbers our streamSimple wrapper (#26)"
---

# Fix pi-ai 0.79.8 Lazy Registration Clobbering Our `streamSimple` Wrapper

## Release Recommendation

**Release:** ship independently

This is a regression fix for pi-ai 0.79.8 ([#5348](https://github.com/earendil-works/pi/pull/5348)).
It is not part of any architecture roadmap batch (no `(#28)` / `[#28]` reference exists in `docs/architecture.md`), so it ships on its own.
It is the root-cause fix for the user-facing [#26], so it should not batch behind unrelated work.

## Problem Statement

Starting with `@earendil-works/pi-ai` 0.79.8, the first Anthropic OAuth request in a session succeeds and every subsequent request fails with the `400 - invalid_request_error` / "extra usage" response reported in [#26].
pi-ai 0.79.8 switched built-in provider registration from eager to lazy: the `anthropic-messages` registry entry starts as a lazy stub whose first call imports `anthropic.ts` and runs its new `register()`, which calls `registerApiProvider` — a `Map.set` overwrite.
Our extension captures that stub at load time and wraps it, so when our wrapper delegates to the captured stub on the first call, `register()` overwrites our wrapper with the bare built-in transport.
From the second call on, every code path resolves the bare built-in from the registry — no `onPayload`, no Claude Code billing header — and Anthropic classifies the request as third-party app usage.

## Goals

- Keep our `streamSimple` wrapper as the registered `anthropic-messages` transport for the lifetime of a session on pi-ai 0.79.8+, so every OAuth call path (main loop, compaction, background agents) is shaped with the billing header.
- Obtain the built-in `streamSimpleAnthropic` delegate by importing it directly from `@earendil-works/pi-ai/anthropic`, so delegating to it never triggers the lazy `register()` that clobbers us.
- Preserve the Issue [#18] coverage rationale: the wrapper stays in the registry and intercepts all call paths; only the delegate source changes.
- Stay backward-compatible across the full supported peer range (`@earendil-works/pi-ai` >=0.79.1), with no peer dependency bump and no breaking change.
- Add a regression test that simulates the 0.79.8 lazy-stub clobber and asserts our shaping survives multiple calls.

This change is **not breaking**: it changes how the delegate is obtained (direct import vs. registry capture), with no change to the observable shaping behavior, the registered transport, or any public/exported API.
API-key and non-OAuth Anthropic requests continue to pass through untouched.

## Non-Goals

- Not changing what we register — the `streamSimple` wrapper remains the registry entry; we are not moving shaping back to `before_provider_request` (that hook does not cover compaction or background agents, per Issue [#18]).
- Not changing the shaping logic itself (`src/request-shaping.ts`, `src/system-prompt-shaping.ts`) — the regression is in delegate wiring, not shaping.
- Not bumping the `@earendil-works/pi-ai` peer dependency — the `./anthropic` subpath exports the real `streamSimpleAnthropic` across the entire supported range.
- Not addressing PR [#27] (`usesCallbackServer`) — it is an unrelated `/login` TUI fix.
- Not composing with other extensions' custom `anthropic-messages` transports registered before us; that composition was undocumented and was already lost under 0.79.8 (the old capture grabbed pi-ai's lazy stub, not another extension's wrapper).

## Background

Relevant modules and how they relate:

1. `src/index.ts` — extension entrypoint.
   Captures `getApiProvider("anthropic-messages")` and calls `pi.registerProvider("anthropic", { oauth, api: "anthropic-messages", streamSimple: createAnthropicOAuthStreamSimple(builtinTransport.streamSimple) })`.
   The `builtinTransport ? { ... } : {}` guard exists for the case where the registry has no entry at load time.
2. `src/oauth-transport.ts` — `createAnthropicOAuthStreamSimple(delegate)` wraps a `streamSimple` function, composing the caller's `onPayload` with our `shapeAnthropicOAuthPayload`, gated on `options.apiKey` containing `sk-ant-oat`.
   Its JSDoc states the delegate is "captured via `getApiProvider("anthropic-messages")` before this wrapper is registered."
3. `@earendil-works/pi-ai` registry (`api-registry.ts`) — `registerApiProvider` is `Map.set` (overwrite); `getApiProvider` is a per-call read; `stream.ts` `streamSimple` resolves the provider fresh on every call.
4. `@earendil-works/pi-ai/anthropic` — subpath entrypoint exporting the real `streamSimpleAnthropic` (and `streamAnthropic`).
   Verified present and exporting the real transport in 0.79.1, 0.79.7, and 0.79.8; 0.79.8 added a `register()` export alongside it but does not call it at module top level, so importing the subpath has no registry side effects.
5. `docs/architecture.md` — documents the transport-wrapper seam and the line "The wrapper must capture the built-in transport via `getApiProvider("anthropic-messages")` **before** registering itself," which is the assumption 0.79.8 broke.

Constraints from `AGENTS.md` that apply:

- "Prefer wrapping or extending Pi's existing Anthropic behavior over replacing it wholesale" — direction #1 delegates to Pi's own `streamSimpleAnthropic`; it does not reimplement the transport.
- "If Pi already supports a behavior upstream, reuse it" — we import Pi's real transport rather than copying it.
- The transport wrapper exists specifically because `before_provider_request` does not cover compaction/background agents (Issue [#18]); the fix preserves the wrapper, it does not retire it.

## Design Overview

The single decision is the delegate source.

Today the delegate is read out of the registry at load time:

```ts
const builtinTransport = getApiProvider("anthropic-messages");
// ...
streamSimple: createAnthropicOAuthStreamSimple(builtinTransport.streamSimple),
```

Under 0.79.8, `builtinTransport.streamSimple` is the lazy stub.
The first call through our wrapper delegates to that stub, which loads `anthropic.ts` and calls `register()`, overwriting our registry entry with the bare built-in.

The fix imports the real transport directly, so the delegate is never the lazy stub and `register()` never fires through our delegation:

```ts
import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic";
// ...
streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic),
```

Why this preserves Issue [#18] coverage: `pi.registerProvider` still registers our wrapper as the `anthropic-messages` transport (both `stream` and `streamSimple` delegate to our wrapper, per `applyProviderConfig` in `model-registry.ts`).
Compaction (`completeSimple`) and background agents (`agentLoop` default `streamSimple`) still resolve our wrapper from the registry.
Only the leaf delegate changes — from "registry-captured stub" to "directly-imported real transport."
The architecture diagram in `docs/architecture.md` still holds; the `streamSimpleAnthropic delegate` node is now sourced from a direct import rather than a pre-registration capture.

Why this is robust across runtime resets: `resetApiProviders()` (called by `AgentSession.reload()` and `ModelRegistry.refresh()`) re-registers the lazy stub, then both paths re-apply our provider config — `refresh()` loops over `registeredProviders` and calls `applyProviderConfig` synchronously; `reload()` re-runs extensions via `_buildRuntime`.
Either way our wrapper is restored, still delegating to the directly-imported real transport.
The only overwrite path that did not restore us was the lazy stub's own first-call `register()`, which direction #1 eliminates by never delegating to the stub.

Recursion safety: the current JSDoc warns that delegating to the *registered* wrapper would recurse.
Direction #1 does not read the registry for the delegate at all, so the capture-before-register ordering dependency — and its recursion risk — disappears entirely.

Edge case — other extensions overriding `anthropic-messages` before us: under the old capture, we would have delegated to their wrapper (accidental composition).
Under direction #1 we delegate straight to Pi's built-in, bypassing them.
This composition was undocumented, extension load order is unspecified, and under 0.79.8 the old capture already grabbed pi-ai's lazy stub rather than another extension's wrapper, so the composition was already gone.
The repo's stated principle is to preserve Pi's built-in Anthropic behavior, which direction #1 does more faithfully.

No interface or type changes are involved.
`createAnthropicOAuthStreamSimple`'s parameter type (`AnthropicStreamSimple`) is unchanged; only the argument passed in `src/index.ts` changes.

Design-review checklist (run on this change): the old `getApiProvider("anthropic-messages").streamSimple` is a Law-of-Demeter reach-through plus a fragile capture-time ordering dependency; the direct import removes both.
No new fields, no output arguments, no scattered resets, no parameter relay.
The new integration test mocks the `@earendil-works/pi-ai/anthropic` subpath to avoid network I/O (see Test Impact Analysis).

## Module-Level Changes

1. `src/index.ts` — replace the registry capture with a direct import.
   - Remove `import { getApiProvider } from "@earendil-works/pi-ai";` and the `const builtinTransport = getApiProvider("anthropic-messages");` line.
   - Add `import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic";`.
   - Replace the `...(builtinTransport ? { api: "anthropic-messages", streamSimple: createAnthropicOAuthStreamSimple(builtinTransport.streamSimple) } : {})` spread with a direct `{ api: "anthropic-messages", streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic) }`.
   - Grep confirmed `getApiProvider` has no other call site in `src/` or `test/`, so removing the import breaks nothing else.
2. `src/oauth-transport.ts` — update the `createAnthropicOAuthStreamSimple` JSDoc `@param delegate` line.
   The current text says the delegate is "captured via `getApiProvider("anthropic-messages")` **before** this wrapper is registered."
   Reword to state the delegate is the real `streamSimpleAnthropic` imported directly from `@earendil-works/pi-ai/anthropic`, and that importing it directly (rather than reading the registry) avoids pi-ai 0.79.8's lazy re-register clobber.
   Also update the surrounding paragraph that explains why the wrapper captures the built-in before registering — that capture rationale no longer applies.
   No behavior change in this file.
3. `docs/architecture.md` — update the seam section.
   - Reword "The wrapper must capture the built-in transport via `getApiProvider("anthropic-messages")` **before** registering itself.
     Delegating to the registered wrapper instead of the captured built-in would recurse infinitely." to describe the direct import: the delegate is `streamSimpleAnthropic` imported from `@earendil-works/pi-ai/anthropic`, which avoids both the recursion risk and the pi-ai 0.79.8 lazy re-register clobber.
   - The mermaid diagram's `streamSimpleAnthropic delegate` node stays; only the prose sourcing it changes.
4. `.pi/skills/anthropic/SKILL.md` — grep found the mechanism described as "a thin `streamSimple` transport wrapper (delegating to Pi's `streamSimpleAnthropic`)" and "Shape in the `streamSimple` transport wrapper ... delegates to Pi's `streamSimpleAnthropic`."
   These statements remain accurate (we still delegate to `streamSimpleAnthropic`); no rewording required unless a line specifically claims registry capture.
   Re-check during implementation; update only if a sentence claims the delegate is captured from the registry.
5. `test/index-registration.test.ts` — new integration test pinning the regression (see Test Impact Analysis).

No exports are removed or renamed, so no consumer-test breakage from symbol changes.
`docs/architecture.md` is the only doc that references the registry-capture mechanism by description; a full `docs/` grep for `getApiProvider` and "capture the built-in" is included in the TDD order to catch any stale prose.

## Test Impact Analysis

1. New unit/integration test enabled by the fix: a regression test that simulates the 0.79.8 lazy-stub clobber and asserts our shaping survives multiple calls.
   This was impractical before because the bug is an integration property of the registry + delegate wiring; isolating it requires driving `src/index.ts`'s registration against a controlled registry.
2. Existing tests that stay as-is: `test/oauth-transport.test.ts` exercises `createAnthropicOAuthStreamSimple` with a capturing delegate and is independent of how the delegate is obtained — its assertions (delegation, OAuth shaping, API-key pass-through, `onPayload` composition) all remain valid and must stay green unchanged.
3. Existing tests that stay as-is: `test/request-shaping.test.ts` and `test/system-prompt-shaping.test.ts` test the shaping functions directly and do not touch delegate wiring.
4. No existing tests become redundant — the new test covers a layer (registration wiring against the registry) that no current test exercises.

The new test design (red under current code, green after the fix):

- Use `vi.mock("@earendil-works/pi-ai/anthropic")` to stub `streamSimpleAnthropic` as a capturing no-op transport (returns a dummy `AssistantMessageEventStream`, records calls) so no network I/O occurs.
- Use the real pi-ai registry (`registerApiProvider` / `getApiProvider` / `clearApiProviders` from `@earendil-works/pi-ai/base`) to simulate 0.79.8's registry state.
- Before loading the extension, register a lazy-stub `ApiProvider` for `anthropic-messages` whose `streamSimple`, on first call, calls `registerApiProvider` with the bare built-in (the mocked `streamSimpleAnthropic`) — mirroring `anthropic.ts`'s `register()`.
- Construct a minimal fake `pi` whose `registerProvider(name, config)` mirrors `applyProviderConfig`'s `streamSimple` branch: `registerApiProvider({ api: config.api, stream: (m,c,o) => config.streamSimple(m,c,o), streamSimple: config.streamSimple }, "provider:" + name)`.
- Import the extension default export from `#src/index` and invoke it with the fake `pi`.
- Resolve the registry's `streamSimple` and invoke it twice with an OAuth `apiKey`.
- Assert both invocations route through our shaping (the captured delegate receives an `onPayload` that, when run against a sample payload, produces the `x-anthropic-billing-header` system block), and that the lazy stub's re-register never displaced our wrapper.

Under the current code the second invocation resolves the bare built-in (the stub overwrote us) and is not shaped → red.
Under the fix the delegate is the imported real transport, the stub is never called, and both invocations are shaped → green.

`vi.mock` is hoisted, so the mocked `streamSimpleAnthropic` is in place before `#src/index` is imported.

## Invariants at risk

No prior architecture-roadmap step refactored this exact surface (the registry-capture wiring predates the roadmap and is documented in `docs/architecture.md` rather than a roadmap step with `Outcome:`/`Landed:` bullets).
The invariant at risk is the Issue [#18] coverage invariant — "every Anthropic OAuth call path is shaped" — which the new regression test pins directly.
The existing `test/oauth-transport.test.ts` invariants (OAuth gating, `onPayload` composition, API-key pass-through) must stay green, guarding that the wrapper's behavior is unchanged even though its delegate source changes.

## TDD Order

1. `test: add regression test for pi-ai 0.79.8 lazy-stub clobber` — write `test/index-registration.test.ts` per the Test Impact Analysis design.
   Assert both calls are shaped and the registry still holds our wrapper after the lazy stub would have re-registered.
   Red against current `src/index.ts`.
   Commit: `test: add regression test for lazy registration clobber (#28)`.
2. `fix: import streamSimpleAnthropic directly to avoid lazy re-register clobber` — change `src/index.ts` to import `streamSimpleAnthropic` from `@earendil-works/pi-ai/anthropic` and pass it to `createAnthropicOAuthStreamSimple`, removing the `getApiProvider` capture and the `builtinTransport ? ... : {}` guard.
   This is a single call-site update folded with the import change (the type checker requires them in the same commit).
   The regression test goes green; `test/oauth-transport.test.ts` and the shaping suites stay green.
   Commit: `fix: import streamSimpleAnthropic directly to avoid lazy re-register clobber (#28)`.
3. `docs: reword oauth-transport JSDoc for direct-import delegate` — update the `createAnthropicOAuthStreamSimple` JSDoc in `src/oauth-transport.ts` to describe the directly-imported delegate and remove the capture-before-register rationale.
   No behavior change.
   Commit: `docs: reword oauth-transport JSDoc for direct-import delegate (#28)`.
4. `docs: update architecture for direct-import transport delegate` — update `docs/architecture.md`'s seam section and run a full `docs/` grep for `getApiProvider`, "capture the built-in", and "before registering itself" to catch any stale prose; re-check `.pi/skills/anthropic/SKILL.md` for registry-capture claims and reword only if found.
   Commit: `docs: update architecture for direct-import transport delegate (#28)`.

Step 2 folds the import removal, the new import, and the single call-site update into one commit because TypeScript rejects the stale `getApiProvider` import and the removed `builtinTransport` reference separately.
No large test file is rewritten in a single step — the new test is additive, and existing tests are untouched.

## Risks and Mitigations

- **Risk: the `@earendil-works/pi-ai/anthropic` subpath is missing on some supported version.**
  Mitigation: verified the subpath exists and exports the real `streamSimpleAnthropic` in 0.79.1 (the installed devDependency floor), 0.79.7, and 0.79.8.
  No peer dependency bump is needed.
- **Risk: importing the subpath has registry side effects that re-clobber us.**
  Mitigation: verified `anthropic.ts` does not call `registerApiProvider` at module top level in any version; `register()` is only invoked by the lazy stub's `loadAndRegisterProvider`, which direction #1 never triggers.
- **Risk: bypassing other extensions' custom `anthropic-messages` transports regresses a real user setup.**
  Mitigation: that composition was undocumented, load-order-dependent, and already absent under 0.79.8 (the old capture grabbed pi-ai's lazy stub).
  Noted as a Non-Goal.
  The repo principle is to preserve Pi's built-in Anthropic behavior, which direction #1 does.
- **Risk: the regression test mocks the registry and drifts from real `applyProviderConfig` behavior.**
  Mitigation: the fake `pi.registerProvider` mirrors `applyProviderConfig`'s `streamSimple` branch exactly (same `registerApiProvider` shape and `sourceId`), and the test uses the real pi-ai registry functions.
  The lazy-stub simulation mirrors `anthropic.ts`'s `register()` overwrite.
- **Risk: runtime `resetApiProviders()` re-introduces the stub and leaks un-shaped calls.**
  Mitigation: both reset paths (`reload()`, `refresh()`) re-apply our provider config synchronously after the reset, restoring our wrapper; the only non-restoring overwrite was the lazy stub's first call, which direction #1 eliminates.
  Documented in Design Overview.

## Open Questions

- Whether to keep a defensive `getApiProvider` fallback for a hypothetical future where the `./anthropic` subpath is removed.
  Deferred: the subpath is part of pi-ai's public export map across the supported range; reintroducing a fallback would be premature dead code.
  Revisit if a future pi-ai major version drops the subpath.

[#26]: https://github.com/gotgenes/pi-anthropic-auth/issues/26
[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[#27]: https://github.com/gotgenes/pi-anthropic-auth/pull/27
