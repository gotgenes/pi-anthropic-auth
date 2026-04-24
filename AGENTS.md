# AGENTS Guide: pi-anthropic-auth

This file contains shared context for agents working in this repository.
Keep it focused on information that multiple agents need: repository purpose, current architecture, constraints, commands, and known gotchas.
Do not turn this into a task log.

Project-level reusable workflows belong in `.agents/skills/`.
This repo currently includes skills for Anthropic OAuth debugging, Pi CLI repro loops, and Pi skill frontmatter conventions.

## Project

### Overview

`pi-anthropic-auth` is a small pnpm-based Pi package.
Its purpose is to minimally override Pi's built-in `anthropic` provider to improve Claude Pro/Max OAuth compatibility without breaking Pi's normal Anthropic API-key behavior.

The design intent is explicitly minimal.
Prefer wrapping or extending Pi's existing Anthropic behavior over replacing it wholesale.

### Primary Goal

Preserve all of Pi's normal Anthropic UX while adding only the compatibility layers Pi still appears to be missing for Claude Pro/Max OAuth.

That means preserving:

1. Built-in provider name: `anthropic`
2. Built-in model list
3. Normal Anthropic API-key behavior
4. Native `/login anthropic` UX

### Current Status

The current implementation does the following:

1. Re-registers the built-in `anthropic` provider with an `oauth` override only
2. Reuses Pi's native Anthropic login flow from `@mariozechner/pi-ai/oauth`
3. Hardens refresh behavior so missing rotated refresh tokens fall back to the previous refresh token
4. Uses `before_provider_request` to shape only built-in Anthropic OAuth payloads
5. Prepends an Anthropic billing/content-consistency header block to `system[]`
6. Replaces Pi's default system prompt preamble with a minimal neutral prompt (inside `before_provider_request`, gated by the same OAuth detection)

It does not currently replace Pi's built-in Anthropic streaming transport.

## Principles

### Keep The Override Thin

Prefer the smallest integration point that works.
If Pi already supports a behavior upstream, reuse it instead of copying it locally.

### Preserve Built-In Behavior By Default

API-key Anthropic behavior is the baseline.
Any OAuth-specific logic must be narrowly gated so it does not affect non-OAuth Anthropic requests.

### Prefer Request Shaping Before Prompt Rewriting

Start with refresh-token hardening, billing/header injection, and exact request-shape fixes.
Do not add broader prompt rewriting unless real failures show it is necessary.

### Isolate Compatibility Logic

Anthropic validation rules drift.
Keep compatibility logic in small helpers so it is easy to adjust without touching the rest of the extension.

## Architecture

### Extension Surface

The main extension entrypoint is `src/index.ts`.

It currently uses two Pi extension seams:

1. `pi.registerProvider("anthropic", { oauth })`
2. `pi.on("before_provider_request", ...)`

All provider-specific logic (billing header injection, message ordering, system prompt shaping) is consolidated in `before_provider_request`, gated by `isOAuthAnthropicPayload`.

Important upstream behavior confirmed from `pi-mono`:

1. Re-registering `anthropic` with only `oauth` overrides `/login anthropic` auth handling without replacing built-in models
2. Omitting `models` preserves Pi's built-in Anthropic model list
3. `before_provider_request` runs for built-in provider requests, after Pi builds the provider-specific payload

### Local Files

Current source layout:

1. `src/index.ts`: extension registration
2. `src/anthropic-oauth.ts`: OAuth override wrapper and refresh fallback
3. `src/request-shaping.ts`: OAuth-only request shaping helpers
4. `src/system-prompt-shaping.ts`: minimal Anthropic OAuth prompt replacement for Pi's default prompt

### Project Skills

Project skills live in `.agents/skills/`.

Current skills:

1. `anthropic`: Anthropic OAuth compatibility lessons and debugging workflow
2. `pi-cli-repro`: repeatable `pi -p ... -e ...` repro workflow
3. `frontmatter`: Pi skill frontmatter template and rules

### Upstream Dependencies

This repo depends on:

1. `@mariozechner/pi-coding-agent`
2. `@mariozechner/pi-ai`
3. `@anthropic-ai/sdk`

When possible, import Pi behavior from `@mariozechner/pi-ai/oauth` rather than copying code from upstream.

## Upstream Findings

These were confirmed by inspecting upstream `badlogic/pi-mono`.

### Pi Already Handles

Pi's built-in Anthropic provider already includes:

1. Claude Code OAuth headers
2. Claude Code identity injection in `system[]`
3. Claude Code tool-name mapping
4. Native Anthropic OAuth login support

### Gap Identified So Far

The clearest upstream gap found during initial inspection is refresh-token rotation robustness.
Pi's built-in Anthropic refresh helper currently expects a fresh `refresh_token` on refresh responses.
Other Pi OAuth providers already fall back to the previous refresh token when a new one is omitted.

## Development

### Package Manager

Use `pnpm`.

### Commands

Install dependencies:

```bash
pnpm install
```

Run the typecheck:

```bash
pnpm run build
```

Alias:

```bash
pnpm run check
```

### TypeScript

This repo uses `module` and `moduleResolution` set to `NodeNext`.
Use `.js` import specifiers for local TypeScript module imports.

### Editing Conventions

1. Prefer ASCII unless the file already requires otherwise
2. Keep helper modules small and purpose-specific
3. Avoid introducing a custom full Anthropic transport unless hook limitations force it

## `ask_user` Tool Usage

This project has `pi-ask-user` installed as a local Pi plugin.
The `ask_user` tool renders as a compact dialog widget — not a document viewer.
Keep invocations lean and put supporting context in regular message output.

### When to use it

Load the `ask-user` skill and invoke `ask_user` before:

1. High-stakes architectural decisions (provider override strategy, seam changes, transport replacement).
2. Irreversible or costly-to-undo changes (large refactors, breaking API-key behavior).
3. Ambiguous requirements or conflicting constraints.
4. Any step where multiple valid options exist and the trade-off is preference-dependent.

A quick clarifying question is cheaper than 10 tool calls of inconclusive investigation.

### Manual actions

When a task requires a manual action from the user (e.g., run a `pi` command, log in via a browser flow, approve an OAuth prompt), use `ask_user` to gate on completion rather than printing instructions and continuing.

Use options like: `Done`, `Need help`, `Something went wrong`.

If the user selects `Need help` or `Something went wrong`, ask clarifying questions before retrying.

### Context before, not inside

Output all explanatory context — plan summaries, analysis results, trade-off notes — as regular message text **before** invoking `ask_user`.
The `question` parameter should be a concise prompt, almost never more than one sentence.
Options should be short and outcome-oriented.

### One decision per call

Each `ask_user` call should address a single independent decision.
Do not combine unrelated decisions into one call with combinatorial options.
For multiple independent decisions, make sequential calls — one per decision.

## Testing Guidance

There is not yet a dedicated test harness in this repo.
When adding tests, keep them focused on compatibility helpers rather than broad end-to-end behavior.

Priority areas:

1. OAuth callback parsing
2. Refresh fallback when `refresh_token` is omitted
3. Billing header generation
4. OAuth-only request-body shaping

## Gotchas

### Provider Hook Scope

`before_provider_request` only exposes the built payload, not the provider name.
Request-shaping logic therefore needs a reliable Anthropic OAuth guard based on payload structure, not provider metadata from the hook event.

### `model_select` Does Not Fire At Startup

Pi's `model_select` event only fires from `setModel` and `cycleModel`.
The initial model assigned during `createAgentSession` goes directly to `agent.state.model` without emitting the event.
Do not rely on `model_select` to track the provider for logic that must run on the first turn.

### `before_agent_start` Has No Provider Context

The `BeforeAgentStartEvent` does not expose which provider or model is active.
Provider-specific logic cannot be reliably gated in `before_agent_start`.
Use `before_provider_request` instead, where the payload structure identifies the provider.

### Avoid Over-Porting From OpenCode

This repository is not trying to reproduce `opencode-anthropic-auth` wholesale.
OpenCode needed broader system prompt debranding.
Pi's built-in Anthropic provider is already much closer to the desired Claude Code request shape.

### Registering `streamSimple`

If you register a custom `streamSimple`, you are much closer to replacing Pi's built-in Anthropic transport.
Do that only if hooks are insufficient for the concrete compatibility issue being fixed.

## Related Files

1. `README.md`
2. `docs/plans/minimal-anthropic-override.md`
3. `docs/plans/gap-analysis-and-next-steps.md`
4. `.agents/skills/`
5. Upstream reference clone: `~/development/pi-mono`
6. Example reference project: `~/development/opencode-anthropic-auth`
