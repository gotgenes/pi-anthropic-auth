# Comparison to Similar Projects

This document captures how `pi-anthropic-auth` compares to other projects solving closely related Anthropic OAuth compatibility problems.

The goal is not to copy every neighboring implementation.
It is to understand what each project optimized for, what lessons appear genuinely reusable, and which choices do not fit this repository's intentionally minimal design.

As more related projects appear, this document can grow into a running comparison reference.

## This Project's Design Goal

`pi-anthropic-auth` is intentionally a thin override of Pi's built-in `anthropic` provider.

The current design tries to preserve:

1. the built-in provider name: `anthropic`
2. Pi's built-in model list
3. normal Anthropic API-key behavior
4. the native `/login anthropic` user experience
5. Pi's built-in Anthropic transport unless a proven compatibility gap requires replacing it

In practice, that means preferring:

1. small OAuth-specific auth hardening
2. request shaping in `before_provider_request`
3. minimal system-prompt shaping only when needed
4. narrow fixes for known Anthropic validation issues

## Summary Table

| Project | Host app | Approach | Similarity to this repo |
| --- | --- | --- | --- |
| [`pi-anthropic-auth`](https://github.com/gotgenes/pi-anthropic-auth) | Pi | Thin built-in provider override plus payload shaping | Baseline |
| [`pi-anthropic-oauth`](https://github.com/leohenon/pi-anthropic-oauth) | Pi | Fuller provider replacement with custom `streamSimple` transport | Similar goal, heavier implementation |
| [`opencode-anthropic-auth`](https://github.com/ex-machina-co/opencode-anthropic-auth/) | OpenCode | Anthropic OAuth compatibility plugin for OpenCode | Important source of compatibility lessons, but for a different host architecture |

## `pi-anthropic-oauth`

Repo: <https://github.com/leohenon/pi-anthropic-oauth>

### What it does

`pi-anthropic-oauth` re-registers Pi's `anthropic` provider with a much broader replacement surface than this repo.

Its extension owns or overrides:

1. OAuth login flow implementation
2. token refresh behavior
3. provider model registration
4. Anthropic request conversion
5. system prompt shaping
6. custom `streamSimple` transport
7. response stream parsing and tool-call mapping

### Where it differs from this repo

#### 1. Transport ownership

This repo deliberately avoids replacing Pi's built-in Anthropic streaming transport.

`pi-anthropic-oauth` does replace it by registering its own `streamSimple` implementation.
That gives it full control over headers, message conversion, tools, thinking blocks, and stream parsing, but it also increases maintenance surface and upstream drift risk.

For this repository, that is a poor default trade-off.
The current evidence still supports staying hook-based unless a transport-level gap is proven.

#### 2. OAuth implementation depth

This repo reuses Pi's native Anthropic OAuth helpers from `@mariozechner/pi-ai/oauth` and only hardens the refresh path by preserving the previous refresh token when Anthropic omits a rotated one.

`pi-anthropic-oauth` reimplements more of the OAuth flow itself, including:

1. local callback handling
2. PKCE generation
3. manual fallback parsing
4. token exchange
5. retry logic around token requests

That broader control may be useful for an app that needs to work around upstream limitations immediately, but for this repo it would conflict with the design goal of preserving Pi's native `/login anthropic` behavior.

#### 3. Model registration

This repo intentionally omits `models` when re-registering `anthropic`, so Pi keeps its built-in model registry.

`pi-anthropic-oauth` reconstructs the Anthropic model list and adds `Claude Opus 4.7` explicitly.
That may be useful as a product choice, but it is not aligned with this repo's goal of preserving Pi's built-in models by default.

#### 4. Prompt shaping style

Both projects shape prompts, but the style is different.

This repo uses a more surgical approach:

1. detect Pi's default prompt preamble
2. remove known Pi-specific paragraphs via anchors
3. replace the preamble with a minimal neutral prompt
4. preserve the rest of the system prompt and appended project context

`pi-anthropic-oauth` takes a broader sanitizer approach, including replacing `Pi` with `Claude Code` in prompt text.
For this repo, the anchor-based minimal replacement is safer and less invasive.

### What this repo already covers that still matters

Compared with `pi-anthropic-oauth`, this repo already includes some targeted Anthropic OAuth fixes that remain important:

1. refresh-token fallback when refresh responses omit `refresh_token`
2. `x-anthropic-billing-header` injection
3. avoiding an extra `cache_control` block on the billing header system block
4. assistant tool-use ordering normalization when text trails `tool_use` content in the same assistant turn
5. minimal Pi prompt de-fingerprinting for OAuth payloads

Those are well aligned with this repo's stated goal: patch the smallest proven compatibility gaps without taking over the entire provider.

### What might be worth borrowing later

At the moment there is no strong reason to copy `pi-anthropic-oauth` wholesale.

The most plausible ideas worth reconsidering in the future are small hardening techniques, not its overall architecture:

1. a short grace window when token refresh fails but the current token has not yet expired
2. retry/backoff around OAuth token exchange or refresh, if upstream Pi does not add it first
3. synthetic repair for orphaned `tool_use` / `tool_result` histories, but only if Pi is shown to emit that exact Anthropic validation failure
4. surrogate sanitization, but only if malformed-Unicode edge cases appear in practice

### What this repo should not copy by default

The following choices from `pi-anthropic-oauth` do not fit this repository's current design:

1. full `streamSimple` replacement
2. full custom OAuth login flow
3. model-list reconstruction and manual model additions
4. home-directory side effects such as auto-creating a `~/.Claude Code` symlink
5. broad `Pi` -> `Claude Code` prompt rewriting

### Current conclusion

`pi-anthropic-oauth` is a useful reference for what a full-provider Anthropic OAuth override looks like inside Pi.

It does not currently justify changing this repository's architecture.
The main lesson is the opposite: keep the override thin unless a concrete transport-level failure proves that hooks are insufficient.

## `opencode-anthropic-auth`

Repo: <https://github.com/ex-machina-co/opencode-anthropic-auth/>

### Why it matters

This project was a major source of Anthropic OAuth compatibility lessons, especially around:

1. billing-header behavior
2. request-shape sensitivity
3. Anthropic prompt fingerprinting risks
4. how small payload details can trigger misleading `You're out of extra usage.` failures

### Why it should not be copied blindly

OpenCode has a different provider architecture and different default prompt content from Pi.
Some of its heavier sanitization and provider overrides were responses to OpenCode-specific prompt and transport behavior, not proven Pi gaps.

For that reason, this repo borrows lessons selectively rather than porting the whole plugin.

### Current conclusion

`opencode-anthropic-auth` remains a valuable compatibility reference, but this repo should continue translating only the smallest proven lessons that apply cleanly to Pi.

## Decision Rule for Future Comparisons

When another similar project appears, compare it against this repo in the same order:

1. What host application assumptions does it make?
2. Is it solving a genuine Anthropic compatibility gap or a host-app-specific quirk?
3. Does the fix belong in auth hardening, request shaping, prompt shaping, or transport replacement?
4. Can the useful part be borrowed without replacing Pi's built-in Anthropic behavior?
5. Does the new behavior preserve API-key Anthropic sessions by default?

If the answer to the last two questions is no, the idea is usually not a good fit for this repository.
