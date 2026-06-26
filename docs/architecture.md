# Architecture

This document explains how `pi-anthropic-auth` applies Anthropic Claude Pro/Max OAuth compatibility shaping, and why it does so at Pi's transport layer rather than through an event hook.

## Overview

The extension re-registers Pi's built-in `anthropic` provider with two things:

1. an `oauth` override that reuses Pi's native Anthropic login and hardens token refresh, and
2. a thin `streamSimple` transport wrapper that shapes outgoing OAuth requests.

The wrapper is the single shaping point.
It delegates to Pi's own built-in Anthropic `streamSimple` transport and only injects an `onPayload` step, so it does not reimplement Pi's Anthropic transport.

## The problem: a hook-coverage gap

Earlier versions shaped requests in a `before_provider_request` handler.
That hook is threaded into the interactive agent loop's `streamFn` only.

Auxiliary Anthropic OAuth calls bypass it:

- Pi's built-in compaction/summarization issues `completeSimple` without an `onPayload`.
- Third-party background agents (for example pi-observational-memory's observer, reflector, and dropper) run via `agentLoop`, which defaults to pi-ai's bare `streamSimple`.

Those requests reached Anthropic carrying an OAuth token but no Claude Code billing header.
Anthropic then classified them as third-party app usage and returned the misleading `You're out of extra usage.` HTTP 400 reported in Issue #18 with `pi-fork` and `pi-observational-memory`.

## The seam: a `streamSimple` transport wrapper

Pi's `registerProvider({ api, streamSimple })` routes through pi-ai's singleton API registry (`registerApiProvider`).
Every Anthropic request resolves its transport from that registry via `getApiProvider("anthropic-messages")`, regardless of which code path issued it.

Registering a `streamSimple` wrapper therefore intercepts all of them in-process:

```mermaid
flowchart TD
    A["Main agent loop"] --> R
    B["Compaction (completeSimple)"] --> R
    C["Background agents (agentLoop)"] --> R
    R["pi-ai API registry (anthropic-messages)"] --> W["streamSimple wrapper"]
    W --> D{"sk-ant-oat token?"}
    D -->|"yes"| S["Inject onPayload shaping"]
    D -->|"no"| P["Pass through unchanged"]
    S --> G["built-in Anthropic streamSimple delegate"]
    P --> G
    G --> AN["Anthropic /v1/messages"]
```

The wrapper delegates to Pi's built-in Anthropic `streamSimple` transport (`streamSimpleAnthropic`), resolved at runtime by `src/host-transport.ts` rather than read out of the API registry.
Resolving it directly avoids both the recursion risk (delegating to the registered wrapper would recurse infinitely) and the pi-ai 0.79.8 lazy-registration clobber: the registry's `anthropic-messages` entry is a lazy stub whose first call re-registers the bare built-in via `registerApiProvider`, overwriting this wrapper (Issue #28).
The resolver imports the bare `@earendil-works/pi-ai` specifier, which Pi's extension loader aliases (Node) / virtualizes (Bun) to its own bundled pi-ai entrypoint — `dist/index.js` on pi 0.79.x, `dist/compat.js` on pi 0.80.x — both of which export `streamSimpleAnthropic`.
A bare-root import is required because `import.meta.resolve` and subpath imports bypass that host indirection: jiti consults its `alias`/`virtualModules` maps on the import path but not on the `resolve` path, so the former `import.meta.resolve("@earendil-works/pi-ai")` plus derived `dist/...` file import fell through to filesystem resolution from the extension's own directory and failed when pi-ai was absent from it — the `pi install` and Bun-binary cases (Issue #31).
Reading `streamSimpleAnthropic` off the namespace resolves across host versions and loader modes with no peer-floor bump; the `compat`-removal cliff that will eventually break this is tracked in Issue #35.

## OAuth gating

Shaping is gated on the resolved API key, available to the transport as `options.apiKey`.
Anthropic OAuth access tokens carry an `sk-ant-oat` prefix, which is the same signal Pi's built-in provider uses internally to decide whether to emit Claude Code identity headers.

When the token is not an Anthropic OAuth token, the payload passes through untouched.
This replaces the previous, brittle approach of sniffing system-prompt markers and keeps API-key and non-Anthropic requests on Pi's normal path.

## What the wrapper does

For OAuth requests, the injected `onPayload` runs `shapeAnthropicOAuthPayload`, which:

1. normalizes assistant message ordering when Pi serializes `[tool_use..., text]` for Anthropic,
2. sanitizes Pi's default preamble by anchor (de-fingerprinting) — removing the identity, custom-tool filler, and Pi documentation paragraphs, replacing only the identity with a minimal neutral prompt, and preserving tool snippets, guidelines, and appended content — and
3. prepends an `x-anthropic-billing-header` system block (without `cache_control`).

The wrapper composes, rather than replaces, any caller-provided `onPayload`.
On the main loop, Pi still passes its own `onPayload` (which fires other extensions' `before_provider_request` handlers); the wrapper runs those first and applies our shaping last, closest to the wire.

## Call paths covered

| Call path | Issued by | Reaches `before_provider_request` | Reaches the wrapper |
| --- | --- | --- | --- |
| Interactive turn | agent loop `streamFn` | yes | yes |
| Compaction / summarization | `completeSimple` | no | yes |
| Background agents | `agentLoop` default `streamSimple` | no | yes |
| Fork children | a separate `pi` process | per-process | yes (if the child loads this extension) |

## What stays untouched

- Non-Anthropic providers (different `api`, so the token gate short-circuits to pass-through).
- Plain Anthropic API-key requests (no `sk-ant-oat` token).
- Pi's built-in Anthropic model list (no `models` are registered).
- Pi's native `/login anthropic` flow (handled by the `oauth` override).

## Related files

- `src/index.ts` — resolves the built-in Anthropic transport at runtime and registers the OAuth override plus `streamSimple` wrapper.
- `src/host-transport.ts` — resolves Pi's built-in Anthropic transport at runtime via a bare-root `@earendil-works/pi-ai` import through Pi's loader indirection (Issue #28, Issue #31); `import.meta.resolve` bypassed that indirection and failed under `pi install` / Bun.
  See `docs/builtin-transport-seam-gap.md` for why no resolution handle is both loader-safe and durable past pi-ai's `compat` removal, and the committed near-term direction.
- `src/oauth-transport.ts` — the token-gated `streamSimple` wrapper.
- `src/request-shaping.ts` — the shaping pipeline applied via `onPayload`.
- `src/system-prompt-shaping.ts` — anchor-driven preamble sanitizer that preserves tool snippets, guidelines, and appended content.
- `src/anthropic-oauth.ts` — OAuth login override and refresh fallback.
