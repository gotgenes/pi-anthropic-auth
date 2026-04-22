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
- You need to decide whether a fix belongs in `before_agent_start`, `before_provider_request`, or a deeper override.

## Core Lessons

1. Treat Anthropic's `You're out of extra usage.` error as a possible disguised request rejection, not only a billing problem.
2. Prefer the thinnest fix that works.
3. Preserve Pi's built-in Anthropic behavior by default.
4. Prefer request shaping before prompt rewriting.
5. Avoid `streamSimple` unless hooks are clearly insufficient.

## Repo-Specific Findings

### Confirmed Pi upstream behavior

- Pi already handles Claude Code OAuth headers, Claude Code identity injection, native Anthropic OAuth login, and tool-name normalization.
- Pi auth storage already refreshes OAuth tokens under a lock.

### Confirmed local fixes

- Refresh fallback preserves the previous refresh token when Anthropic omits `refresh_token`.
- OAuth Anthropic payload shaping prepends an `x-anthropic-billing-header` system block.
- The billing block must not add `cache_control`, or Anthropic can reject the request for exceeding the cache-control block limit.
- Assistant message ordering must be normalized when Pi serializes `[tool_use..., text]` for Anthropic.
- Pi's default system prompt can act as an Anthropic fingerprint and trigger disguised rejection errors.

## Fast Debugging Workflow

### 1. Reproduce with the real `pi` CLI

Use the actual CLI rather than only unit tests:

```bash
pi \
  --model anthropic/claude-sonnet-4-20250514 \
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

This gives the shortest reliable feedback loop for live Anthropic OAuth behavior.

This workflow has already been used successfully in this repo to validate:

1. simple prompts
2. tool use
3. multi-turn continuation
4. structured output
5. expired-token refresh

### 2. Distinguish the failure class

- If a minimal custom `--system-prompt` succeeds but the default Pi prompt fails, suspect prompt fingerprinting.
- If failures happen only after tool use or multi-turn flows, inspect serialized Anthropic message ordering.
- If validation errors mention block counts or payload shape, inspect `system[]`, `cache_control`, and `messages` ordering.

## Implementation Guidance

### Prefer `before_provider_request` for

- billing-header injection
- `system[]` block ordering
- cache-control adjustments
- assistant message ordering normalization
- OAuth-only payload shaping

### Prefer `before_agent_start` for

- minimal prompt de-fingerprinting of Pi's assembled default system prompt
- preserving project context while replacing unsafe harness boilerplate

### Avoid by default

- wholesale OpenCode debranding logic
- `mcp_` tool prefix transport hacks
- custom `streamSimple` overrides

## Useful References

- `AGENTS.md`
- `docs/plans/minimal-anthropic-override.md`
- `docs/plans/gap-analysis-and-next-steps.md`
- `src/index.ts`
- `src/request-shaping.ts`
- `src/system-prompt-shaping.ts`
- `src/anthropic-oauth.ts`
- `test/pi-anthropic-ordering-experiment.test.ts`
- `test/system-prompt-shaping.test.ts`

## Decision Rule

When debugging a new Anthropic OAuth failure in this repo:

1. Reproduce with `pi -p ... -e ...`.
2. Decide whether the failure is prompt fingerprinting, request shape, or transport.
3. Fix it in the shallowest hook that can solve it.
