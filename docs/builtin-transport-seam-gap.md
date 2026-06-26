# Decision record: shaping Anthropic OAuth payloads on every call path

This record explains why `pi-anthropic-auth` currently wraps pi's built-in Anthropic transport, why that design — not the user's actual need — is what creates the loader/`compat` resolution problem, and what near-term path and upstream direction we commit to.

It is the internal, maintainer-facing companion to the operator-facing upstream request brief in `docs/builtin-transport-seam-upstream-request.md`.
The mechanics narrative and the handle table below are canonical here; the brief restates them in evidence framing and links back to this record.

The facts below were verified against the pi workspace at `~/development/pi/pi` at `@earendil-works/pi-ai` 0.80.2 (the installed devDependency in this repo is still 0.79.1).
Files inspected: `packages/ai/src/types.ts`, `packages/ai/src/api/anthropic-messages.ts`, `packages/ai/src/compat.ts`, `packages/ai/src/legacy-api-aliases.ts`, `packages/ai/src/models.ts`, `packages/coding-agent/src/core/sdk.ts`, `packages/coding-agent/src/core/extensions/runner.ts`, `packages/coding-agent/src/core/extensions/loader.ts`, and `packages/coding-agent/src/core/extensions/types.ts`.

## What the user actually needs

`pi-anthropic-auth` exists to make Claude Pro/Max OAuth work with pi's built-in `anthropic` provider.
That decomposes into exactly two needs:

1. OAuth login and token refresh.
   This is fully served by a supported seam: `registerProvider({ oauth })` (`packages/coding-agent/src/core/extensions/types.ts`).
   There is no gap here.
2. Every outgoing Anthropic request must carry the Claude Code billing header and a shaped system prompt, so OAuth traffic is not rejected as third-party-app usage.
   This is payload mutation, and it is the entire subject of this record.

The second need is not "wrap a transport."
It is "mutate the outgoing request body on every call path."

## pi already has the primitive for it

`onPayload` is a first-class field on pi-ai's `SimpleStreamOptions` (`packages/ai/src/types.ts`): "inspecting or replacing provider payloads before sending. Return undefined to keep the payload unchanged."
Every api implementation applies it; the Anthropic transport calls `await options?.onPayload?.(params, model)` immediately after building its request params (`packages/ai/src/api/anthropic-messages.ts`).

Our own wrapper does nothing but set this `onPayload`.
`src/oauth-transport.ts` composes any caller-provided `onPayload`, applies `shapeAnthropicOAuthPayload`, and then delegates the real HTTP/SSE work straight back to pi's built-in transport unchanged.
The wrapper is pure plumbing to get our `onPayload` onto the call.

## Why our design has to reach for the transport at all

If `onPayload` is the primitive, why not just set it from a hook?
Because pi wires its `onPayload` seam — the `before_provider_request` extension event — into exactly one call path.
`packages/coding-agent/src/core/sdk.ts` builds the main agent loop's stream options with `onPayload: () => runner.emitBeforeProviderRequest(payload)`.
Compaction (`completeSimple`) and third-party background agents (`agentLoop`) never get that `onPayload` (Issue [#18]).

To reach those paths we drop down to the one layer they all share — the pi-ai api-registry transport — and register a `streamSimple` that force-injects our `onPayload`, delegating the rest to pi's built-in transport.
Needing to obtain that built-in transport to delegate to is what creates the entire loader/`compat` resolution problem.
The resolution fragility (Issue [#31], Issue [#32], Issue [#33]) and the `compat` removal cliff are second-order consequences of choosing "wrap the registry transport" as the delivery mechanism for our `onPayload`.
They are not inherent to what the user needs.

## The layering constraint that rules out the easy fix

The obvious fix — "thread `before_provider_request` into compaction too" — does not actually close Issue [#18].
That compaction-only slice is exactly what upstream [pi#4980] proposed and then withdrew, and it would still leave foreign `agentLoop` callers uncovered.
`before_provider_request` is a coding-agent extension event, emitted by the extension runner (`packages/coding-agent/src/core/extensions/runner.ts`).
Third-party background agents call pi-ai's `agentLoop` directly, below the extension host; coding-agent cannot emit its event into them.

We confirmed (Decide gate, this issue) that covering those foreign background-agent call paths is a real requirement.
Given that, the api-registry transport is the only chokepoint visible to the main loop, compaction, and foreign `agentLoop` callers alike.
That is the structural reason we register there rather than in a hook — and any durable fix must live at the pi-ai registry/dispatch layer, not in coding-agent.

## Why the registry can't be decorated today

The registry is replace-only.
`registerApiProvider` does `apiProviderRegistry.set(provider.api, ...)` (`packages/ai/src/compat.ts`); it neither returns the previous provider nor offers a decorator form, and its `wrapStreamSimple` only validates `model.api` — it applies no transform.
So even staying at the registry there is no supported way to compose; you must supply a whole transport, which forces obtaining the built-in one to delegate to.
Reading the previous transport back out of the registry is also unsafe: the `anthropic-messages` entry is a lazy stub whose first call re-registers the bare built-in and clobbers our wrapper (Issue [#28]).

## Handle inventory

Each row was traced against pi-ai 0.80.2.
This table explains why "just get the built-in transport" is hard — it is the fallback framing, not the preferred one (see Upstream direction).

| Handle | Bare-root reachable (Node + Bun)? | Durable past compat removal? |
| --- | --- | --- |
| `anthropicMessagesApi()`, `streamSimpleAnthropic` | Yes (via the compat alias) | No — defined in `legacy-api-aliases.ts` / re-exported by `compat.ts`, both deprecated |
| api-registry `getApiProvider("anthropic-messages")` | Yes (compat) | No — the registry functions are defined in `compat.ts` |
| `@earendil-works/pi-ai/api/anthropic-messages` `streamSimple` | No — `/api/*` is a subpath the host loader does not alias/virtualize | Yes — exports `stream` and `streamSimple` directly |
| `createModels()` (core barrel) | Yes (through `compat.ts`) | Yes, but returns a fresh empty `ModelsImpl`; seeding anthropic still needs the non-aliased subpath factory |
| pi-coding-agent `registerProvider` | Yes | Yes, but override-only — no retrieve-builtin seam |

The intersection of the two yes columns is empty: everything bare-root reachable today is compat-only, and everything durable lives behind a non-aliased subpath or returns an empty registry.

## Upstream direction

Because `onPayload` already exists on every transport and the registry is already the universal chokepoint, the best-targeted upstream change is to let an extension attach a payload transform to a provider without replacing its transport.
We are not asking for access to pi's transport; we are asking to register a transform.
This direction was filed upstream as [pi#6089] (see the brief at [`docs/builtin-transport-seam-upstream-request.md`](./builtin-transport-seam-upstream-request.md) for status).
Ranked, for the operator to weigh in `docs/builtin-transport-seam-upstream-request.md`:

1. Primary — a provider-bound payload transform.
   `registerProvider` already accepts `streamSimple`; a sibling `onPayload` (forwarded into the pi-ai registry and applied by pi-ai's own dispatch on every call) would let us write `registerProvider("anthropic", { oauth, onPayload })` and delete `src/host-transport.ts` and the wrap-and-delegate machinery entirely.
   It must be applied at the pi-ai registry/dispatch layer so it reaches foreign `agentLoop` callers, and the transform needs the OAuth signal (pi already computes `isOAuth` in the Anthropic transport before `onPayload`) so API-key requests pass through untouched.
2. Alternative — composable registration.
   Have the registry hand back (or wrap) the previous provider, so we delegate to a transport pi gives us instead of resolving one from the filesystem.
   This also removes the Issue [#28] clobber, since pi owns ordering.
3. Fallbacks (least elegant — keep the current wrap-and-delegate design alive).
   Alias/virtualize the `/api/*` subpaths for extensions, or export a stable transport handle from the durable core past the `compat` removal.

## Upstream prior art

A search of `earendil-works/pi` confirmed this exact ask is unfiled, but two adjacent issues frame it.

1. [pi#4980] ("Compaction requests bypass `before_provider_request`") proposed the compaction-only slice and was withdrawn by its author pending internal review; it was never resubmitted, and it does not address foreign `agentLoop` callers or the transport-acquisition problem.
   Our ask supersedes it.
2. [pi#3262] ("Export `AssistantMessageEventStream` for extensions that wrap `streamSimple`") came from the same Claude Pro/Max wrapping domain and landed — the class is now exported from pi-ai's root and this extension imports it.
   It is precedent that the maintainer accepts the `streamSimple`-wrapping use case, but it solved only the return-type export, not the all-paths transform.

Adjacent extension-point requests for a wire-layer `fetch` hook ([pi#3987], [pi#5061]) and a post-`onPayload` hook ([pi#4038]) were closed without landing, two of them flagged by the project as suspected machine-generated.
The upstream issue should therefore be authored in the operator's own voice, grounded in concrete code references.

## Near-term decision

The upstream change is not in hand, so this repo keeps shaping at the registry transport for now and only hardens how it obtains the built-in delegate.
Near-term, switch `src/host-transport.ts` from `import.meta.resolve` (plus filesystem resolution) to the bare-root `@earendil-works/pi-ai` import, reading the built-in transport off the compat surface the loader aliases and virtualizes in both modes.
This fixes Issue [#31] across Node installs and the Bun-compiled binary for the current pi generation.

This is explicitly non-durable: it depends on the compat surface, which `compat.ts` says is deleted with the ModelManager migration, so the switch must carry a visible compat-removal-cliff TODO pointing at this record and the upstream brief.
Implementation is deferred to a separate follow-up issue; this record only commits the direction.

Alternatives considered and rejected for the near term:

1. The Issue [#32] parent-`node_modules` walk.
   Rejected: it bypasses the host indirection exactly as `import.meta.resolve` does and still breaks in the Bun-binary mode, which has no on-disk `node_modules` to walk.
2. Holding the status quo (`import.meta.resolve` plus the dual-layout fallback from Issue [#33]).
   Rejected: it leaves Issue [#31] unfixed for `pi install` and Bun-binary users, which is the live breakage.
3. Jumping straight to a forward subpath import.
   Rejected for now: it is not loader-safe until upstream aliases or virtualizes the `/api/*` subpath, so it cannot ship before the upstream change lands.

## Cross-references

1. Issue [#18] — the hook-coverage gap (`before_provider_request` only on the main loop) that forced shaping into the transport wrapper.
2. Issue [#28] — the lazy-registration clobber, why the wrapper resolves a concrete module export rather than reading the registry.
3. Issue [#31] — `import.meta.resolve` fails when installed via `pi install`; the breakage the near-term path fixes.
4. Issue [#32] — the proposed parent-`node_modules` walk, rejected here.
5. Issue [#33] — the dual-layout resolution the current resolver uses, superseded by the bare-root compat import when the follow-up lands.
6. [pi#4980] — the withdrawn upstream compaction-bypass precedent our ask supersedes.
7. [pi#3262] — the landed upstream precedent that the `streamSimple`-wrapping use case is accepted.
8. [pi#6089] — the upstream feature request this direction was filed as.

[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[pi#3262]: https://github.com/earendil-works/pi/issues/3262
[pi#6089]: https://github.com/earendil-works/pi/issues/6089
[pi#3987]: https://github.com/earendil-works/pi/issues/3987
[pi#4038]: https://github.com/earendil-works/pi/issues/4038
[pi#4980]: https://github.com/earendil-works/pi/issues/4980
[pi#5061]: https://github.com/earendil-works/pi/issues/5061
[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#32]: https://github.com/gotgenes/pi-anthropic-auth/issues/32
[#33]: https://github.com/gotgenes/pi-anthropic-auth/issues/33
