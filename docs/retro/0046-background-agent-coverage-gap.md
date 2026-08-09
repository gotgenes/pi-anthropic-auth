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

[pi#6089]: https://github.com/earendil-works/pi/issues/6089
