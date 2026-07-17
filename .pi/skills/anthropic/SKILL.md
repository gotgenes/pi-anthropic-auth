---
name: anthropic
description: Anthropic Claude Pro/Max OAuth compatibility workflow for this repo. Use when debugging Anthropic OAuth failures, misleading extra-usage errors, Pi request shaping, prompt fingerprinting, or deciding between hook-based fixes and deeper provider overrides.
compatibility: Intended for the pi-anthropic-auth repository and Pi Anthropic OAuth investigations.
---

# Anthropic OAuth Compatibility

## Use When

- Anthropic OAuth requests fail with `You're out of extra usage.`
- Pi Anthropic OAuth works for login but fails for actual requests.
- You need to compare Pi, OpenCode, and `opencode-anthropic-auth` behavior.
- You need to decide whether a fix belongs in `before_provider_request`, the `streamSimple` transport wrapper, or a deeper override.

## Core Lessons

1. Treat Anthropic's `You're out of extra usage.` error as a possible disguised request rejection, not only a billing problem.
2. Prefer the thinnest fix that works.
3. Preserve Pi's built-in Anthropic behavior by default.
4. Prefer request shaping before prompt rewriting.
5. Avoid `streamSimple` unless hooks are clearly insufficient — they are insufficient for compaction and background-agent calls, which is why this repo wraps the transport (Issue #18).

## Repo-Specific Findings

### Confirmed Pi upstream behavior

- Pi already handles Claude Code OAuth headers, Claude Code identity injection, native Anthropic OAuth login, and tool-name normalization.
- Pi auth storage already refreshes OAuth tokens under a lock.

### Confirmed local fixes

- OAuth Anthropic payload shaping prepends an `x-anthropic-billing-header` system block.
- The billing block must not add `cache_control`, or Anthropic can reject the request for exceeding the cache-control block limit.
- Assistant message ordering must be normalized when Pi serializes `[tool_use..., text]` for Anthropic.
- Pi's default system prompt can act as an Anthropic fingerprint and trigger disguised rejection errors.
- Shaping runs in a thin `streamSimple` transport wrapper (delegating to Pi's built-in Anthropic transport, resolved from the installed pi-ai layout), so it applies to every OAuth call path — main loop, `completeSimple` compaction, and `agentLoop` background agents — gated on the `sk-ant-oat` token.

## Fast Debugging Workflow

### 0. Confirm the extension is loaded

Before anything else, run `/anthropic-auth:status` in Pi.
The command prints the loaded version, the module path (which install it loaded from), and whether the built-in Anthropic transport resolved.
If the command is not found, the extension is not loaded — check for a Docker volume or `pi install` issue before debugging request shaping.

Two copies can load at once — a local `-e`/`"../"` source copy and an installed npm copy from a `settings.json` `packages[]` entry (repo and global settings both contribute).
Pi's `registerProvider` merges their `anthropic` configs, so a stale installed copy can reintroduce a broken `oauth` even when the fixed copy is loaded (Issue #43).
Before validating a provider/OAuth change, isolate to the fixed copy (remove the global `packages[]` entry, or `--no-extensions -e <local>`).
Test `/login` interactively; a green `pi -p` prompt exercises requests, not the login path.

### 1. Reproduce with the real `pi` CLI

Use the actual CLI rather than only unit tests:

```bash
pi \
  --model anthropic/claude-haiku-4-5 \
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

This gives the shortest reliable feedback loop for live Anthropic OAuth behavior. Prefer the latest Haiku alias for fast repros unless the bug appears model-specific.

If an installed copy of this extension is listed in `~/.pi/agent/settings.json`, `-e <local path>` loads the local copy *in addition to* the installed one, so shaping appears to run twice.
Add `--no-extensions` to the repro command to load only the `-e` copy when verifying local changes.

This workflow has already been used successfully in this repo to validate:

1. simple prompts
2. tool use
3. multi-turn continuation
4. structured output
5. expired-token refresh

### 2. Distinguish the failure class

- If a minimal custom `--system-prompt` succeeds but the default Pi prompt fails, suspect prompt fingerprinting.
- If failures happen only after tool use or multi-turn flows, inspect serialized Anthropic message ordering.
- Use `PI_ANTHROPIC_AUTH_DEBUG=tool-use` to log only tool-using Anthropic OAuth requests, or `PI_ANTHROPIC_AUTH_DEBUG=all` to log every shaped OAuth request.
- If validation errors mention block counts or payload shape, inspect `system[]`, `cache_control`, and `messages` ordering.

### 3. Render real before/after shaping (ground truth, not a hand fixture)

To check what shaping does to a real prompt, import upstream `buildSystemPrompt` from `@earendil-works/pi-coding-agent/dist/core/system-prompt.js`, build a realistic prompt, and pipe it through `shapeAnthropicOAuthSystemPrompt` to see the exact removed/retained split.
Write the script in the repo root, not `/tmp` — relative `./node_modules` and `./src` imports resolve against the script's directory (Refs #10).
This is a debug-only technique; tests still build fixtures inline (see Testing Guidance in `AGENTS.md`).

## Implementation Guidance

### Shape in the `streamSimple` transport wrapper

All request shaping runs in the transport wrapper (`src/oauth-transport.ts`), which delegates to Pi's built-in Anthropic `streamSimple` transport (resolved by `src/host-transport.ts`) and injects an `onPayload` step:

- billing-header injection
- `system[]` block ordering
- cache-control adjustments
- assistant message ordering normalization
- system prompt de-fingerprinting (anchor-based removal of the Pi identity, custom-tool filler, and Pi documentation paragraphs; preserves tool snippets, guidelines, and appended content)

Gate on the `sk-ant-oat` access-token prefix (`options.apiKey`), the same signal Pi uses internally.
This covers every OAuth call path, including compaction and background agents.

### Why not `before_provider_request` or `before_agent_start`

`before_provider_request` only fires for the interactive agent loop, so it never reaches compaction or background-agent calls (Issue #18).

`before_agent_start` has no provider or model context, and there is no reliable way to gate provider-specific logic there:

- `model_select` does not fire for the initial model at startup (Pi assigns it directly to `agent.state.model` without calling `setModel`).
- The event itself does not expose which provider is active.

### Avoid by default

- wholesale OpenCode debranding logic
- `mcp_` tool prefix transport hacks
- reimplementing Pi's Anthropic transport (the wrapper delegates to the built-in transport resolved by `src/host-transport.ts`)

## Useful References

- `AGENTS.md`
- `docs/plans/minimal-anthropic-override.md`
- `docs/plans/gap-analysis-and-next-steps.md`
- `src/index.ts`
- `src/diagnostics.ts`
- `src/oauth-transport.ts`
- `src/request-shaping.ts`
- `src/system-prompt-shaping.ts`
- `test/pi-anthropic-ordering-experiment.test.ts`
- `test/system-prompt-shaping.test.ts`

## Decision Rule

When debugging a new Anthropic OAuth failure in this repo:

1. Reproduce with `pi -p ... -e ...`.
2. Decide whether the failure is prompt fingerprinting, request shape, or transport.
3. Fix it in the shallowest seam that can solve it — but remember `before_provider_request` covers only the interactive loop, so cross-call-path fixes belong in the transport wrapper.
