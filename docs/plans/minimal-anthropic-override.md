# Minimal Anthropic Override Plan

## Goal

Build a Pi package that minimally overrides Pi's built-in `anthropic` provider to improve Claude Pro/Max OAuth compatibility while preserving Pi's normal Anthropic API-key flow and model UX.

## Why This Approach

Pi already implements several Claude-compatible behaviors for Anthropic OAuth:

- OAuth login and token refresh
- Claude Code style headers for OAuth tokens
- Claude Code tool-name mapping
- Claude Code identity injection in the system prompt

The missing work appears to be the smaller compatibility layer that `opencode-anthropic-auth` evolved in response to Anthropic's request validation changes, especially around:

- request shape
- billing header injection
- exact tool naming edge cases
- refresh-token rotation robustness

Starting with a minimal override is lower risk than replacing Pi's Anthropic provider wholesale.

## Scope For V1

1. Bootstrap this repo as a pnpm-based Pi package.
2. Override or extend the built-in `anthropic` provider instead of creating a separate provider name.
3. Preserve Pi's API-key behavior.
4. Preserve Pi's model list and `/login anthropic` UX.
5. Add only the OAuth compatibility layers that Pi appears to be missing.

## Planned Work

### 1. Package scaffold

- Add `package.json` with a `pi.extensions` manifest.
- Use pnpm for dependency management.
- Keep the project small: one extension entrypoint plus a few support modules.

### 2. Anthropic override entrypoint

- Register an override for the built-in `anthropic` provider.
- Keep built-in Anthropic API-key auth behavior intact.
- Route OAuth-backed Anthropic requests through the compatibility layer.

### 3. Reuse Pi behavior first

- Reuse Pi's built-in OAuth flow shape where possible.
- Reuse Pi's tool-name mapping and Anthropic transport behavior where possible.
- Avoid reimplementing the full Anthropic provider unless extension hooks force it.

### 4. Port compatibility fixes from `opencode-anthropic-auth`

Initial priority order:

1. Refresh-token rotation safety.
2. Claude billing header injection and content-consistency hash support.
3. Exact tool-name compatibility for Claude Code style behavior.
4. Additional request shaping only if needed after testing.

### 5. System prompt handling

- Do not blindly port all OpenCode sanitization.
- Pi's system prompt is already much more neutral than OpenCode's.
- Only add Pi-specific prompt or system rewrites if OAuth requests still fail without them.
- If request shaping is needed, prefer the newer three-block `system[]` layout rather than the older system-to-user relocation approach.

### 6. Tests

Add focused tests for:

- OAuth callback parsing
- token refresh behavior
- stale refresh-token rotation handling
- billing header generation
- tool-name mapping edge cases
- request-body shaping helpers

### 7. Validation

Manual validation order:

1. Anthropic API-key flow still works.
2. Anthropic OAuth login works.
3. Simple prompts work.
4. Tool use works.
5. Structured output works.
6. Multi-turn sessions work.
7. Token refresh works.

## Risks

### Extension API limitations

If Pi does not expose enough hooks to wrap the built-in Anthropic transport cleanly, the fallback is to fully re-register `anthropic` with preserved built-in behavior.

### Anthropic drift

Anthropic's validation rules may continue to change. The code should therefore isolate compatibility logic into small helpers that are easy to adjust.

### Over-porting from OpenCode

OpenCode needed aggressive prompt debranding. Pi likely does not. Porting too much logic too early would add unnecessary surface area and regression risk.

## Deliverables

- pnpm-based Pi package scaffold
- initial Anthropic override extension
- compatibility helper modules
- tests for the compatibility layer
- setup and usage documentation
