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

[pi#6089]: https://github.com/earendil-works/pi/issues/6089
