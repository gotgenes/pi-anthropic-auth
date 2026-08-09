---
issue: 46
issue_title: "pi >=0.80.8 no longer routes `registerProvider` into the pi-ai api registry, so background agents bypass the wrapper and hit the \"extra usage\" 400 again"
---

# Correct the api-registry routing claim and document the background-agent coverage gap

## Release Recommendation

**Release:** ship independently

`docs/architecture.md` contains no improvement roadmap and carries no `Release:` annotations, so this issue belongs to no batch.
It is a self-contained documentation correction plus one test-harness fix, with no production behavior change and no dependency on other in-flight work.

## Problem Statement

A third-party reporter ([@pandysp](https://github.com/pandysp)) spent hours chasing a billing error that was actually a coverage gap.
Their extension makes its own Anthropic calls through pi-ai's `compat.streamSimple`; with `pi-anthropic-auth` loaded, the pi session's own turns returned 200 and every one of their extension's calls returned the misleading `You're out of extra usage.` HTTP 400 on the same token, account, and model.

The cause is that this repository's documentation describes a mechanism that upstream removed.
`docs/architecture.md` and comments in `src/index.ts` and `src/oauth-transport.ts` all assert that `registerProvider({ api, streamSimple })` routes through pi-ai's singleton API registry, so every Anthropic request — main loop, compaction, and background agents alike — resolves our wrapper.
That was true up to pi 0.80.7.
pi 0.80.8 replaced `ModelRegistry` with `ModelRuntime` and dropped the `registerApiProvider` bridge, and 0.80.8 is this package's own peer floor.

The reporter proposed closing the gap by calling `registerApiProvider` ourselves.
The operator declined that direction (see Design Overview), so this issue is scoped to correcting the record: making every document and code comment describe what pi >=0.80.8 actually does, stating the background-agent gap plainly, explaining why this extension cannot close it, and giving affected extension authors the workaround.

This work was also explicitly deferred here by Issue [#49]'s retrospective, which corrected `AGENTS.md` and the `anthropic` skill but left `docs/architecture.md` and its Mermaid diagram for this issue.

## Goals

1. Correct every statement in this repository that claims `registerProvider` writes into pi-ai's api registry.
2. State the real coverage boundary: the wrapper covers requests dispatched through `modelRuntime`, and nothing else.
3. Explain in the architecture record why the gap cannot be closed from this extension, with the concrete evidence, so the question does not have to be re-litigated.
4. Give background-agent and extension authors an actionable workaround.
5. Pin the corrected boundary with a test so the claim is enforced by the suite rather than by prose alone.
6. Rework `test/index-registration.test.ts`'s fake host, which currently reimplements the removed pre-0.80.8 bridge and therefore validates a mechanism that no longer exists.

This change is **not breaking**.
No production code path, default, output shape, or configuration changes.
The only source edits are comments.

## Non-Goals

1. Calling `registerApiProvider` from this extension, in any form — unconditional, opt-in, or flagged.
   The operator's decision is recorded in Design Overview with the supporting evidence.
2. Any change to `src/oauth-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, or `src/host-transport.ts` beyond doc comments.
3. Re-filing or escalating [pi#6089] upstream.
4. Changes to the `/anthropic-auth:status` diagnostics output.
5. Revisiting the `compat`-removal watch tracked by Issue [#35].

## Background

### What the wrapper actually reaches on pi >=0.80.8

Verified against the upstream clone at `~/development/pi/pi` and the installed `@earendil-works/pi-coding-agent@0.84.0` `dist/`.

1. `pi.registerProvider("anthropic", { api, streamSimple })` stores the config in pi's own `extensionProviders` map.
   Nothing in `dist/` calls `registerApiProvider` — zero files, versus one file at 0.80.7.
2. `provider-composer.ts`'s `streamWith` applies the stored config: `if (extension?.streamSimple && model.api === extension.api) return extension.streamSimple(...)`.
   `streamWith` backs the composed `Provider`'s `stream`/`streamSimple`, which are reached only via `modelRuntime`.
3. `sdk.ts`'s `createAgentSession` supplies `streamFn: async (model, context, options) => modelRuntime.streamSimple(...)`, so the interactive loop reaches the wrapper.
4. `agent.ts` sets `this.streamFunction = runtimeOptions.streamFn ?? getDefaultStreamFn()`, and `agent-session.ts` passes `this.agent.streamFunction` at both compaction call sites, so compaction reaches the wrapper too.
5. `sdk.ts` also calls `setDefaultStreamFn(streamSimple)` with pi-ai's `compat.streamSimple`, explicitly preserving "the pre-0.81 fallback for extensions that construct `Agent` instances or invoke low-level agent loops without supplying `streamFn`."
   That default dispatches from the pi-ai api registry, which still holds the built-in Anthropic transport, so those calls never reach the wrapper.

### Relevant local modules

1. `src/index.ts` — the registration site; its comment block asserts the removed registry routing and gives a now-false recursion rationale.
2. `src/oauth-transport.ts` — the wrapper; three doc-comment passages describe it as "the shape Pi's API registry uses", "the same singleton API-registry transport", and "the registry entry for `anthropic-messages` is this wrapper".
3. `src/host-transport.ts` — unaffected in substance; its `anthropicMessagesApi()` resolution is still correct and still what pi's own `custom-provider-gitlab-duo` example does.
4. `test/index-registration.test.ts` — its `createFakePi` helper's comment says it "Mirrors `ModelRegistry.applyProviderConfig`'s `streamSimple` branch", a class that no longer exists, and it performs the removed `registerApiProvider` bridge itself.

### Constraints from `AGENTS.md`

1. Prefer the smallest integration point that works; preserve built-in behavior by default.
   Both cut against a global api-registry write.
2. "Diagnose Version Regressions From The Tag Source" — followed here; the diff and the `dist/` counts are the evidence base, not eyeball greps.
3. Markdown is one-sentence-per-line, ordered lists restart at `1.` under each heading, tables are compact, and long-lived docs use reference-style issue links.
4. `AGENTS.md` and `.pi/skills/anthropic/SKILL.md` document package internals and must be swept whenever documented behavior is reworded.

## Design Overview

### Decision: do not register into the pi-ai api registry

The reporter's fix works mechanically.
`compat.streamSimple` guards its built-in fast path with an identity check —

```ts
function getBuiltinProviderForModel(model: Model<Api>) {
	if (getApiProvider(model.api) !== builtinApiProviderInstances.get(model.api)) return undefined;
	// ...
}
```

— so registering any override makes the check fail and dispatch falls through to the registry, reaching us.

It was declined because the registry is keyed by **api**, not by provider, and `registerApiProvider` is a `Map.set`.
There is exactly one `anthropic-messages` slot, shared by ten built-in providers: `anthropic`, `cloudflare-ai-gateway`, `fireworks`, `github-copilot`, `kimi-coding`, `minimax`, `minimax-cn`, `opencode`, `opencode-go`, and `vercel-ai-gateway`.
Registering flips `getBuiltinProviderForModel` to `undefined` for all ten, unconditionally.

The per-provider consequence on the compat-dispatch path:

| Case | Built-in branch calls | Our entry would call | Delta |
| --- | --- | --- | --- |
| `anthropic` + `sk-ant-oat` | `anthropicMessagesApi()` | shaped, then `anthropicMessagesApi()` | the intended fix |
| `anthropic` + API key | `anthropicMessagesApi()` | gate fails, then `anthropicMessagesApi()` | none |
| the eight bare-api providers | `anthropicMessagesApi()` | gate fails, then `anthropicMessagesApi()` | none |
| `cloudflare-ai-gateway` | `cloudflareStreams(anthropicMessagesApi())` | `anthropicMessagesApi()` | broken |

Rows two and three are exact, not approximate: `createProvider`'s `dispatch` resolves `apiFor(model)` to the same bare `anthropicMessagesApi()` streams, and compat applies `withEnvApiKey` identically in both branches.

Row four is a genuine regression inflicted on an unrelated provider.
`cloudflareStreams` substitutes `{CLOUDFLARE_ACCOUNT_ID}` and `{CLOUDFLARE_GATEWAY_ID}` into `model.baseUrl`; skipping it sends requests to a literal-placeholder URL.
That wrapping lives at the **provider** layer, which an api-registry entry structurally cannot see, and it cannot be reconstructed from the public surface: `builtinModels` is not exported from `@earendil-works/pi-ai/compat`, and `getProviders()` returns provider id strings rather than `Provider` objects.
Compat's own cloudflare fallback (`model.provider.startsWith("cloudflare-") && !hasResolvedCloudflareAuth(options)`) would be skipped for the same reason.

The operator's constraint is that this extension exists specifically to interface with an Anthropic subscription, and that Anthropic API-key traffic and every other provider must be unaffected.
A global api-registry write cannot satisfy that constraint: it is exact for nine of ten providers and unfixably wrong for the tenth.
Therefore the gap is documented, not closed.

Upstream relief is not pending either.
[pi#6089], the ask for a provider-bound payload transform applied at pi-ai's dispatch layer, was auto-closed `NOT_PLANNED` by the new-contributor bot and never reopened.

### The corrected coverage model

Two distinct dispatch lanes exist, and only one passes through the wrapper.

```text
modelRuntime.streamSimple -> provider-composer.streamWith -> extension.streamSimple (us) -> anthropicMessagesApi()
compat.streamSimple       -> pi-ai api registry           -> anthropicMessagesApi()
```

The corrected coverage table:

| Call path | Issued by | Reaches `before_provider_request` | Reaches the wrapper |
| --- | --- | --- | --- |
| Interactive turn | agent loop `streamFn`, into `modelRuntime` | yes | yes |
| Compaction / summarization | `agent.streamFunction`, into `modelRuntime` | no | yes |
| Background agents | `agentLoop` default `streamFn`, into `compat.streamSimple` | no | no |
| Direct `compat.streamSimple` callers | a third-party extension | no | no |
| Fork children | a separate `pi` process | per-process | for that process's own `modelRuntime` traffic |

### The workaround to publish

Background-agent authors are not stuck.
`Agent` exposes a public `streamFunction`, and `agentLoop` accepts a stream function.
An extension that already has access to a session's agent should pass that agent's `streamFunction` rather than relying on `getDefaultStreamFn()`:

```ts
// Covered: routes through modelRuntime -> provider-composer -> the wrapper.
await agentLoop(context, config, signal, emit, hostAgent.streamFunction);

// Uncovered: falls back to getDefaultStreamFn() === compat.streamSimple.
await agentLoop(context, config, signal, emit);
```

This is the same distinction upstream itself draws — `agent-session.ts` branches on `this.agent.streamFunction === streamSimple` to detect the uncovered default when resolving summarization auth.

### The corrected Mermaid diagram

`docs/architecture.md`'s current diagram is built around a central `pi-ai API registry` node with all three call paths feeding into it.
It is replaced by a two-lane diagram that shows the covered lane passing through the wrapper and the uncovered lane bypassing it, so the gap is visible rather than implied.
Load the `mermaid` skill before authoring it, and verify the rendered output.

### Correcting the stale recursion rationale

`src/index.ts` and `src/oauth-transport.ts` both justify resolving the delegate directly as avoiding infinite recursion, "because the registry entry for `anthropic-messages` is this wrapper".
On pi >=0.80.8 that premise is false — we never write to the registry, so reading from it would return pi's built-in entry and would not loop.

The design decision is still correct, for different reasons that must be stated accurately:

1. `anthropicMessagesApi()` is the direct, non-deprecated handle pi's own `custom-provider-gitlab-duo` example delegates through (Issue [#31], Issue [#35]).
2. Reading from a registry this extension does not participate in would couple the delegate to whatever any other extension last registered.
3. The recursion hazard was real on pi <=0.80.7, when `registerProvider` did write our wrapper into the registry, and the related Issue [#28] clobber is precluded by the `>=0.80.8` peer floor.

Rewrite the comments to say this rather than deleting the history.

## Module-Level Changes

### `docs/architecture.md`

1. Rewrite the section "The seam: a `streamSimple` transport wrapper" — replace the `registerApiProvider` / `getApiProvider("anthropic-messages")` routing claim with the `extensionProviders` map plus `provider-composer.streamWith` description, and drop "Registering a `streamSimple` wrapper therefore intercepts all of them in-process".
2. Replace the Mermaid diagram with the two-lane version.
3. Correct the "Call paths covered" table: `Background agents` becomes `no`, a `Direct compat.streamSimple callers` row is added, and the `Fork children` row is narrowed to that process's own `modelRuntime` traffic.
4. Add a new section — "The remaining gap: pi-ai compat dispatch" — carrying the evidence, the ten-provider blast-radius table, the `cloudflare-ai-gateway` casualty, the unavailability of `builtinModels` from `/compat`, the [pi#6089] `NOT_PLANNED` status, and the `agent.streamFunction` workaround.
5. Correct the sentence at line 47 that says the delegate is resolved "rather than read out of the API registry ... would loop" to the accurate rationale.
6. Add reference-style link definitions for any newly referenced issues.

### `src/index.ts`

1. Rewrite the comment block asserting "Registering `streamSimple` routes through Pi's singleton API registry, so the same shaping now covers the main loop, `completeSimple` compaction, and `agentLoop` background work."
2. Rewrite the delegate-resolution comment's recursion rationale.
3. No executable change.

### `src/oauth-transport.ts`

1. `AnthropicStreamSimple`'s doc comment: "The transport-level `streamSimple` handler shape Pi's API registry uses" becomes the `provider-composer` / `ProviderConfig.streamSimple` shape.
2. `createAnthropicOAuthStreamSimple`'s doc comment: "issue requests through the same singleton API-registry transport but without that hook" becomes the corrected split — compaction reaches us via `modelRuntime`; `agentLoop` background agents do not reach us at all.
3. The `@param delegate` recursion rationale, same correction as `src/index.ts`.
4. No executable change.

### `AGENTS.md`

1. § Current Status item 2: "on every call path (main loop, compaction, and background agents)" becomes main loop and compaction only.
2. § Extension Surface item 3: "background-agent coverage is unverified (Issue #46)" becomes confirmed uncovered, with the reason.
3. § Gap Identified So Far: "whether `agentLoop` background agents still bypass it on pi >=0.80.8 is contested (Issue #46)" becomes the confirmed finding.
4. § Gotchas, "`before_provider_request` Only Covers the Interactive Loop": "may not reach our wrapper at all on pi >=0.80.8 (Issue #46)" becomes definite, and the heading's framing is checked for accuracy.
5. Leave line 455 (the `gh issue list` gotcha, which cites Issue #46 as an example) as-is — it is still correct.

### `.pi/skills/anthropic/SKILL.md`

1. § Repo-Specific Findings: "whether `agentLoop` background agents reach it on pi >=0.80.8 is contested" becomes confirmed uncovered.
2. § Implementation Guidance: "background-agent coverage is contested" becomes the same, with a pointer to `docs/architecture.md` for the workaround.

### `README.md`

1. The "Shaping runs in a thin transport wrapper ... so it applies to every OAuth call path — the interactive loop, compaction, and any background-agent work" sentence becomes accurate, naming the interactive loop and compaction, and linking to the architecture doc's gap section for background agents.

### `docs/builtin-transport-seam-gap.md`

1. § "Why our design has to reach for the transport at all": "To reach those paths we drop down to the one layer they all share — the pi-ai api-registry transport — and register a `streamSimple`" describes pi <=0.80.7.
   Add a dated note that pi 0.80.8 removed the bridge, so the registration now lands on `provider-composer` and the foreign-`agentLoop` half of Issue [#18] reopened.
2. § "The layering constraint that rules out the easy fix": the claim that the api-registry transport is the only common chokepoint is still true of pi-ai's dispatch, but is no longer where our registration lands — qualify it.
3. § "Near-term decision", "Status: implemented": scope the claim to transport *acquisition*.
   Coverage of foreign `agentLoop` callers is not implemented and is not achievable from the public surface, for the api-scoping reason.
4. Add an Issue #46 cross-reference entry and its link definition.

### `docs/builtin-transport-seam-upstream-request.md`

1. § "Status: filed as [pi#6089]": "awaits the maintainers' daily review of auto-closed issues" becomes the confirmed terminal state — closed `NOT_PLANNED`, never reopened.
2. Add a note that pi 0.80.8's removal of the `registerApiProvider` bridge strengthens the original ask rather than obviating it, since the brief's premise (that our registration reaches pi-ai dispatch) no longer holds.

### `test/index-registration.test.ts`

1. Replace `createFakePi`'s `registerProvider` body: instead of mirroring the removed `ModelRegistry.applyProviderConfig` bridge via `registerApiProvider`, store the config and expose a `dispatch(model, context, options)` helper mirroring `provider-composer.streamWith`.
2. Update the helper's doc comment, which names a class that no longer exists.
3. Rescope the Issue [#28] regression guard: the invariant it protects is that the delegate is resolved from `#src/host-transport` and never read from the api registry, which is still worth pinning; the lazy-stub seeding stays as the hostile registry state the wrapper must ignore.
4. Add a pinning test: after `registerExtension(pi)`, the `anthropic-messages` api-registry entry must be **unchanged** — this extension must not write to the registry.
   This encodes the documented coverage boundary in the suite.

### Files deliberately untouched

`src/host-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, `src/debug.ts`, `src/diagnostics.ts`, `src/constants.ts`, and every test file other than `test/index-registration.test.ts`.

## Test Impact Analysis

1. **New coverage enabled.**
   The registry-untouched assertion is new and previously would have been meaningless, because the test harness itself performed the registry write.
   Once `createFakePi` stops bridging, the assertion becomes a real guard against a future change silently reintroducing a global api-registry override.
2. **Tests that become redundant.**
   None are removed.
   The Issue [#28] guard's *scenario* (a lazy stub clobbering the registry) is unreachable on the supported floor, but the *invariant* (our delegate never comes from the registry) is the one this issue's investigation depends on, so it is retained and its framing corrected.
3. **Tests that must stay as-is.**
   The `unregisterProvider` ordering test (Issue [#43] hardening) and both diagnostics-command tests exercise behavior unrelated to dispatch routing.
   They only need whatever mechanical adjustment the `createFakePi` signature change forces.
   `test/oauth-transport.test.ts`, `test/host-transport.test.ts`, `test/request-shaping.test.ts`, and `test/system-prompt-shaping.test.ts` are untouched.

## Invariants at risk

1. **Issue [#28] — the wrapper's delegate is never read from the api registry.**
   Pinned today by "every OAuth call resolves our wrapper and is shaped across multiple calls" in `test/index-registration.test.ts`.
   Reworking `createFakePi` risks weakening it; the rework must keep the hostile lazy-stub registry entry seeded and keep asserting that both calls reach the mocked `#src/host-transport` delegate.
2. **Issue [#43] — `unregisterProvider` runs before `registerProvider`.**
   Pinned by the ordering test asserting `["unregister:anthropic", "register:anthropic"]`.
   The `createFakePi` rework must preserve the `calls` log.
3. **Issue [#49] — the `onResponse` pass-through to the built-in delegate.**
   Pinned in `test/oauth-transport.test.ts`, which this plan does not touch.
4. **New — this extension does not write to the pi-ai api registry.**
   Currently pinned only by the prose this issue is writing.
   Step 1 adds the test.

## TDD Order

Steps 2 through 6 are documentation and comment corrections with no red phase; they are validated by `pnpm run lint` (including `lint:md`), `pnpm run check`, and review.
Step 1 is the only step touching executable test code.

1. **Correct the test harness's model of the host, and pin the registry boundary.**
   Surface: `test/index-registration.test.ts`.
   Replace the `registerApiProvider` bridge in `createFakePi` with a `provider-composer`-shaped dispatch helper, correct the stale doc comments, rescope the Issue [#28] guard, and add the assertion that the `anthropic-messages` registry entry is identical before and after `registerExtension(pi)`.
   The new assertion cannot be driven red-first, since the current source already satisfies it — verify it by mutation instead: temporarily add a `registerApiProvider` call to `src/index.ts`, confirm the test fails, then revert.
   Commit: `test: model pi >=0.80.8 provider dispatch and pin the api-registry boundary`.
2. **Rewrite the architecture record.**
   Surface: `docs/architecture.md`.
   Sections "The seam", the Mermaid diagram, the "Call paths covered" table, the delegate-resolution rationale, and the new "The remaining gap: pi-ai compat dispatch" section.
   Load the `mermaid` and `markdown-conventions` skills first; verify the diagram renders.
   Commit: `docs: correct the provider dispatch model and record the background-agent gap`.
3. **Correct the source comments.**
   Surface: `src/index.ts`, `src/oauth-transport.ts`.
   Registry routing claims and the stale recursion rationale.
   Run `pnpm run check` and `pnpm test` to confirm the comment-only edits changed nothing.
   Commit: `docs: correct api-registry routing claims in source comments`.
4. **Sweep the agent-facing docs.**
   Surface: `AGENTS.md`, `.pi/skills/anthropic/SKILL.md`, `README.md`.
   Replace "contested" / "unverified" with the confirmed finding, and correct the README's "every OAuth call path" claim.
   Commit: `docs: replace contested background-agent coverage with the confirmed finding`.
5. **Update the decision records.**
   Surface: `docs/builtin-transport-seam-gap.md`, `docs/builtin-transport-seam-upstream-request.md`.
   Scope "Status: implemented" to transport acquisition, record [pi#6089]'s terminal `NOT_PLANNED` state, and note that pi 0.80.8 reopened the foreign-`agentLoop` half of Issue [#18].
   Commit: `docs: scope the seam decision records to transport acquisition`.
6. **Final gate.**
   Run `pnpm run check`, `pnpm test`, `pnpm run lint`, and `pnpm fallow:dead-code`.
   Then the `pre-completion` protocol, then `/ship-issue`.
   The closing comment on Issue #46 should credit the reporter's diagnosis, confirm every technical claim in it, state the decision not to register into the api registry with the `cloudflare-ai-gateway` reasoning, and point at the `agent.streamFunction` workaround.

## Risks and Mitigations

1. **Risk: the `createFakePi` rework silently weakens the Issue [#28] guard.**
   Mitigation: the Invariants at risk section names both invariants and the assertions that carry them; step 1 explicitly keeps the lazy-stub seeding and the delegate-reached assertions, and the new pin is mutation-verified.
2. **Risk: the corrected architecture doc under- or over-states the gap.**
   Mitigation: every claim in the plan is grounded in a named upstream symbol (`provider-composer.streamWith`, `setDefaultStreamFn`, `getBuiltinProviderForModel`, `cloudflareStreams`, `agent.streamFunction`) verified in the clone at the installed version; carry those references into the doc so a future reader can re-verify rather than re-argue.
3. **Risk: a future session re-proposes the api-registry fix.**
   Mitigation: the "remaining gap" section records the decision *and* the disqualifying evidence, and the new test fails loudly if someone implements it without revisiting the record.
4. **Risk: the corrected coverage claim goes stale again when pi changes.**
   Mitigation: the new test pins our half of the contract, and `AGENTS.md`'s "Diagnose Version Regressions From The Tag Source" gotcha already prescribes the tag-diff workflow plus a `gh issue list` check.
5. **Risk: the Mermaid rewrite trips the renderer or the markdown linter.**
   Mitigation: the `mermaid` skill's pitfall list (semicolons, angle-bracket tokens, quoted labels) plus `pnpm run lint:md`; every node label in the proposed diagram is quoted.
6. **Risk: the reporter reads the close as a dismissal.**
   Mitigation: step 6 specifies the closing comment's content — confirm their findings, explain the constraint that rules the fix out, and hand them a workaround.

## Open Questions

1. Should the `agent.streamFunction` workaround be verified live with a real background-agent extension before publishing it, or is the upstream source evidence (`agent.ts` `streamFunction`, `agentLoop`'s stream-function parameter, `agent-session.ts`'s `=== streamSimple` default detection) sufficient?
   The plan assumes source evidence is sufficient; a live repro would be stronger but requires standing up a third-party background agent.
2. If the operator prefers a strictly documentation-only change, step 1 can be dropped and the coverage boundary left in prose.
   The plan includes it because a test harness that reimplements a removed upstream API is the same class of stale record this issue exists to correct.
3. Whether to open a follow-up issue tracking a *re-filed* upstream ask now that [pi#6089] is terminally closed and pi 0.80.8 strengthened the case.
   Deferred; out of scope here.

[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#35]: https://github.com/gotgenes/pi-anthropic-auth/issues/35
[#43]: https://github.com/gotgenes/pi-anthropic-auth/issues/43
[#49]: https://github.com/gotgenes/pi-anthropic-auth/issues/49
[pi#6089]: https://github.com/earendil-works/pi/issues/6089
