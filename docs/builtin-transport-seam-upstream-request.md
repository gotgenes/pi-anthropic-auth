# Upstream request brief: registering a payload transform on a provider

This is source material for an upstream pi issue, not a finished issue body.
It is organized so the operator can decide which ask to lead with and write the issue in their own voice; the pi project rejects AI-composed issues, so nothing here is meant to be pasted verbatim.

The full internal reasoning, the handle inventory, and the rejected near-term alternatives live in the maintainer-facing decision record at [`docs/builtin-transport-seam-gap.md`](./builtin-transport-seam-gap.md); this brief restates only the evidence an upstream reader needs and the candidate asks.

All facts were verified against the pi workspace at `~/development/pi/pi` at `@earendil-works/pi-ai` 0.80.2.

## Status: filed as [pi#6089]

This brief was used to author [pi#6089], filed 2026-06-25.
The operator wrote the issue by hand in their own voice (the brief is source material, not the posted text).
The filed issue leads with the provider-bound `onPayload` transform as the preferred ask and composable registration (`registerApiProvider` returning the previous provider, or taking a decorator) as the fallback, matching the ranking below.
A follow-up comment cross-links the prior art ([pi#4980] superset, [pi#3262] precedent, plus [pi#3987], [pi#5061], [pi#4038]).
The issue was auto-closed by the project's new-contributor bot and awaits the maintainers' daily review of auto-closed issues; track reopen/`lgtm` status there.

## The ask, in one sentence

An extension that overrides a built-in provider should be able to register a payload transform bound to that provider — applied by pi-ai's own dispatch on every call path — without having to replace and re-implement (or reach inside pi-ai to obtain and delegate to) the built-in transport.

## Why an extension needs this

`pi-anthropic-auth` makes Claude Pro/Max OAuth work with pi's built-in `anthropic` provider.
OAuth login and refresh are already fully served by `registerProvider({ oauth })`.
The remaining need is purely payload mutation: every outgoing Anthropic request must carry the Claude Code billing header and a shaped system prompt, or Anthropic rejects OAuth traffic as third-party-app usage.

pi-ai already has the exact primitive for that mutation.
`onPayload` is a first-class field on `SimpleStreamOptions` ("inspecting or replacing provider payloads before sending"), and every api implementation applies it — the Anthropic transport calls `await options?.onPayload?.(params, model)` right after building its request params.
The gap is not the primitive; it is that an extension has no supported way to set one `onPayload` provider-wide across every call path.

## Evidence

### onPayload is only wired into one call path

pi sets `onPayload` for the interactive agent loop only.
The coding-agent builds the main loop's stream options with `onPayload` routed to the `before_provider_request` extension event.
Compaction (`completeSimple`) and third-party background agents (`agentLoop`) issue requests through the same provider transport but never receive that `onPayload`, so their OAuth requests reach Anthropic with no billing header.

### The hook cannot be extended to cover all paths

`before_provider_request` is a coding-agent extension event, emitted by the extension runner.
Third-party background agents call pi-ai's `agentLoop` directly, below the extension host, so coding-agent cannot emit its event into them.
The only layer common to the main loop, compaction, and foreign `agentLoop` callers is the pi-ai api-registry transport.
A durable transform must therefore live at the pi-ai registry/dispatch layer, not in coding-agent.

### The registry is replace-only

`registerApiProvider` does `apiProviderRegistry.set(provider.api, ...)`; it does not return the previous provider or offer a decorator, and its internal wrapper only validates `model.api` and applies no transform.
So an extension that registers a provider must supply a whole transport, which forces it to obtain pi's built-in transport to delegate the real work to.

### Obtaining the built-in transport has no loader-safe, durable handle

This is the symptom that motivated the issue.
The host loader aliases/virtualizes only the bare `@earendil-works/pi-ai` root, `/compat`, and `/oauth` for extensions; the forward implementation modules live under non-aliased `/api/*` and `/providers/*` subpaths.
The bare root resolves to `dist/compat.js`, whose header marks it for deletion with the coding-agent ModelManager migration.

| Handle | Bare-root reachable (Node + Bun)? | Durable past compat removal? |
| --- | --- | --- |
| `anthropicMessagesApi()`, `streamSimpleAnthropic` | Yes (via the compat alias) | No — defined in `legacy-api-aliases.ts` / re-exported by `compat.ts`, both deprecated |
| api-registry `getApiProvider("anthropic-messages")` | Yes (compat) | No — the registry functions are defined in `compat.ts` |
| `@earendil-works/pi-ai/api/anthropic-messages` `streamSimple` | No — `/api/*` subpath is not aliased/virtualized | Yes — exports `stream` and `streamSimple` directly |
| `createModels()` (core barrel) | Yes (through `compat.ts`) | Yes, but returns an empty registry — seeding anthropic still needs the non-aliased subpath factory |
| pi-coding-agent `registerProvider` | Yes | Yes, but override-only — no retrieve-builtin seam |

The intersection of the two yes columns is empty: nothing is both reachable in every loader mode and durable.
A payload-transform seam sidesteps this table entirely, because the extension never obtains the transport at all.

## Prior art and how this ask differs

A search of `earendil-works/pi` found no existing request for this seam, but two adjacent issues position it.

1. [pi#4980] ("Compaction requests bypass `before_provider_request`") is the closest precedent and the one this ask supersedes.
   It raised only the compaction slice and was withdrawn by its author pending internal review, never resubmitted.
   It does not cover third-party `agentLoop` agents (the harder half of the gap) or the transport-acquisition problem, so a fix scoped to it would still leave foreign background-agent traffic unshaped.
2. [pi#3262] ("Export `AssistantMessageEventStream` for extensions that wrap `streamSimple`") came from the same Claude Pro/Max wrapping domain and was accepted and landed.
   It is evidence the maintainer supports the `streamSimple`-wrapping use case; it solved the return-type export but not the all-paths transform this ask is about.

Adjacent extension-point requests for a wire-layer `fetch` hook ([pi#3987], [pi#5061]) and a post-`onPayload` hook ([pi#4038]) were closed without landing, two flagged by the project as suspected machine-generated.
That is the strongest reason to write this issue in a human voice, grounded in the concrete code references above.

## Candidate directions

Ranked by how completely each serves the actual need (mutate every outgoing payload for one provider), not pre-selected — the operator chooses which to lead with.

1. A provider-bound payload transform.
   `registerProvider` already accepts a `streamSimple`; a sibling `onPayload` (or transform) that the coding-agent forwards into the pi-ai registry, and that pi-ai's dispatch applies on every call for that api, would serve the need directly: `registerProvider("anthropic", { oauth, onPayload })`.
   It is the smallest conceptual addition because the primitive already exists everywhere.
   Two requirements to call out: it must be applied at the pi-ai registry/dispatch layer so it reaches foreign `agentLoop` callers, and the transform needs the credential/OAuth signal (pi already computes an `isOAuth` flag in the Anthropic transport before invoking `onPayload`) so the extension can leave API-key requests untouched.
2. Composable provider registration.
   Have the registry hand back, or accept a decorator over, the previous provider, so an extension delegates to a transport pi provides instead of resolving one from the filesystem.
   This also removes the lazy-registration clobber, since pi owns ordering.
3. Loader-safe access to the built-in transport.
   Alias/virtualize the `/api/*` (or `/providers/*`) subpaths for extensions, or export a stable transport handle from the durable core past the `compat` removal.
   These keep the extension's current wrap-and-delegate design alive but are the least elegant, since the extension still re-implements transport plumbing it does not need.

## Open framing questions

These are questions the operator may want pi maintainers to answer, framed as genuine uncertainty rather than implied requirements.

1. Is there an intended, supported path for an extension to mutate a built-in provider's outgoing payload on every call path — including compaction and third-party `agentLoop` agents — that this extension has missed?
2. Is `onPayload` intended to be settable provider-wide by an extension, or is it deliberately scoped to per-call options set by the coding-agent?
3. When `compat.ts` is removed, what is the expected migration for extensions that currently reach the bare-root surface — does the bare root keep resolving to a durable entrypoint, or are extensions expected to move to specific subpaths?
4. Are the `/api/*` and `/providers/*` subpaths intended to be extension-facing at all, or is the registry/factory API the intended public surface for this use case?

[pi#3262]: https://github.com/earendil-works/pi/issues/3262
[pi#6089]: https://github.com/earendil-works/pi/issues/6089
[pi#3987]: https://github.com/earendil-works/pi/issues/3987
[pi#4038]: https://github.com/earendil-works/pi/issues/4038
[pi#4980]: https://github.com/earendil-works/pi/issues/4980
[pi#5061]: https://github.com/earendil-works/pi/issues/5061
