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
5. A refusal blamed on request *content* needs an organic-data control before it becomes a diagnosis (Issue #65).
6. Avoid `streamSimple` unless hooks are clearly insufficient — they are insufficient for compaction and background-agent calls, which is why this repo wraps the transport (Issue #18).

## Repo-Specific Findings

### Confirmed Pi upstream behavior

- Pi already handles Claude Code OAuth headers, Claude Code identity injection, native Anthropic OAuth login, and tool-name normalization.
- Pi auth storage already refreshes OAuth tokens under a lock.

### Confirmed local fixes

- OAuth Anthropic payload shaping prepends an `x-anthropic-billing-header` system block.
- The billing block must not add `cache_control`, or Anthropic can reject the request for exceeding the cache-control block limit.
- Content-less `role: "system"` messages carrying `output_config` must survive system-message shaping: on managed-effort models (those pi-ai flags `compat.supportsMidConvoEffort`, which `test/managed-effort-drift.test.ts` enumerates from the installed catalog) they are the only carrier of the requested effort, since Pi pins the top-level effort to `"high"`.
  Dropping them errors nowhere and silently runs every request at `"high"`; Anthropic accepts them with `content: []` (verified live on pi 0.87.1, PR #79).
- Assistant block ordering must *not* be normalized: measured 2026-09-20, Anthropic returns 200 for `[tool_use..., text]` and `[text, tool_use, text, tool_use]` on sonnet-4-5, haiku-4-5, sonnet-5, fable-5, and opus-4-8.
  The split that used to rewrite those turns corrupted signed `thinking` blocks and was removed (Issue #66).
- Pi's default system prompt can act as an Anthropic fingerprint and trigger disguised rejection errors.
- Shaping runs in a thin `streamSimple` transport wrapper (delegating to Pi's built-in Anthropic transport, resolved from the installed pi-ai layout), gated on the `sk-ant-oat` token.
- The billing header's `cc_version` is a **floor**, not a fixed value: the wrapper injects an `options.fetch` that reads pi's own `user-agent: claude-cli/<version>` off the built request and rebuilds the header at pi's version when pi reports a higher one (Issue #74).
  An explicit `PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION` override is absolute and is never raised.
  Measured live on pi 0.87.1 against `claude-opus-5-5`: with the pin forced to 2.1.260 the request succeeds; with the same value set through the env override it is rejected as `claude_code_version_too_old`.
- When Anthropic raises a floor above both pi and the pin, the same `fetch` retries once at the floor the 400 names, and remembers it for the wrapper's lifetime (Issue #75).
  Unrecovered rejections (override set, floor unnamed, body not rebuildable, retry rejected) reach the user with a `[pi-anthropic-auth]` hint appended to `error.message`.
  On pi 0.87.1 the retry is unreachable live without a patch, because pi's own 2.1.280 already meets every current floor; the live check forces the pin to 2.1.260 and disables the pi-version read in the working tree, then looks for the `claude-code-version-recovery` debug line.
- The wrapper covers the main loop and compaction — everything that dispatches through `modelRuntime`.
- It covers only the provider names this extension registers: `anthropic`, plus any the user names in `extensions/pi-anthropic-auth/config.json` (global, or a trusted project's `.pi/`).
  An Anthropic OAuth subscription another extension registers under its own name (pi-multi-pass's `anthropic-2`) is otherwise unshaped and fails real prompts with the extra-usage 400 (Issue #70).
  Reproduced live on 2026-09-24 with a second login of the same account: 400 without the config, 200 with it.
  Short prompts pass either way, so check `/anthropic-auth:status`'s `shaped providers` line before debugging anything else.
- Background agents that pass `ctx.modelRegistry.streamSimple()` as their stream function (pi >=0.86.0) route through `modelRuntime` and are shaped; pi-observational-memory 3.1.x does this (measured live, Issue #53).
- On pi >=0.80.8, callers that dispatch through pi-ai's `compat.streamSimple` (passed explicitly, or reached through the `setDefaultStreamFn` fallback when `streamFn` is omitted) are confirmed uncovered, and cannot be covered from this extension (Issue #46); see `docs/architecture.md` for why, and for the supported path for extension authors.

## Fast Debugging Workflow

### 0. Confirm the extension is loaded

Before anything else, run `/anthropic-auth:status` in Pi.
The command prints the loaded version, the module path (which install it loaded from), and whether the built-in Anthropic transport resolved.
Its `accounts:` block shows the plan behind each shaped provider's OAuth login (plan type, seat, rate-limit tier, subscription status, extra usage); `/anthropic-auth:status --account` adds the email and organization name, for telling several logins apart (Issue #80).
If the command is not found, the extension is not loaded — check for a Docker volume or `pi install` issue before debugging request shaping.

Two copies can load at once — a local `-e`/`"../"` source copy and an installed npm copy from a `settings.json` `packages[]` entry (repo and global settings both contribute).
Pi's `registerProvider` merges their `anthropic` configs, so a stale installed copy can reintroduce a broken `oauth` even when the fixed copy is loaded (Issue #43).
`src/index.ts` calls `pi.unregisterProvider("anthropic")` before re-registering as partial hardening, but during initial load the loader only drops *pending* registrations, so it only helps when the stale copy loaded *before* ours — isolation is still required to validate.
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
A refusal or Terms-of-Service block is model-specific by definition — reproduce on the model named in the report, or on `claude-fable-5` when none is named.

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

To check what shaping does to a real prompt, import upstream `buildSystemPrompt` from `./node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js`, build a realistic prompt, and pipe it through `shapeAnthropicOAuthSystemPrompt` to see the exact removed/retained split.
Use a filesystem path, not the bare `@earendil-works/pi-coding-agent/dist/...` specifier — that subpath is absent from the package's `exports` map, so Node rejects it with `ERR_PACKAGE_PATH_NOT_EXPORTED` and vite's resolver rejects it too.
Write the script in the repo root, not `/tmp` — relative `./node_modules` and `./src` imports resolve against the script's directory (Refs #10).
The same technique is used by one test, `test/upstream-prompt-drift.test.ts`, to check the section names and anchors against the installed Pi (Issue #52); everywhere else tests still build fixtures inline (see Testing Guidance in `AGENTS.md`).

### 4. Probe Anthropic classifiers with organic data and independent trials

Anthropic's refusal classifiers (`reasoning_extraction` and friends) are stochastic, model-specific, and content-sensitive.
A black-box probe gets three things wrong by default:

1. **Build the payload from a real session, not by hand.**
   Load a session from `~/.pi/agent/sessions/`, take its `message` entries, and run pi's own `serializeConversation` over them — a hand-written `<conversation>` string tests your model of the bug, not the bug.
2. **Defeat the prompt cache, and run n>=5.**
   Byte-identical trials return one cached verdict repeatedly, which reads as perfect determinism.
   Insert a per-trial nonce (`(ref ${Math.random().toString(36).slice(2, 10)})`) into the payload.
3. **Place the positive control downstream of whatever you are testing.**
   Probing through `createAnthropicOAuthStreamSimple` measures the shaped payload, so a control that only proves "the classifier still fires" cannot detect that our own shaping removed the variable under test.
   Use `pickAnthropicStreamSimple` directly when the question is about pi's payload rather than ours.

Vary one factor at a time and record refusal rates, not verdicts.
Expect model-specific answers: `claude-fable-5-1` refuses payloads `claude-fable-5` accepts, and 5.1 is unreachable on the unwrapped transport because pi's `claude-cli` user-agent trips the version floor (Issue #60).
When a probe needs pi's own Claude Code version, drive the built-in transport with a throwing capturing `fetch` — offline, no network; `test/claude-code-version-drift.test.ts` is the worked example.

Issue #65 is the worked example of all three failures at once — see `docs/retro/0065-*.md`.

## Implementation Guidance

### Shape in the `streamSimple` transport wrapper

All request shaping runs in the transport wrapper (`src/oauth-transport.ts`), which delegates to Pi's built-in Anthropic `streamSimple` transport (resolved by `src/host-transport.ts`) and injects an `onPayload` step:

- billing-header injection
- `system[]` block ordering
- cache-control adjustments
- system prompt de-fingerprinting (section-aware: replaces the untagged preamble, drops the `docs` section, strips the `tools` filler; preserves every other section byte-identically)
- the same section rules applied to mid-conversation `role: "system"` updates (Issue #69)

One step does not fit in `onPayload` and runs in an injected `options.fetch` instead (`src/billing-version-sync.ts`): raising `cc_version` to pi's reported `claude-cli` version, and recovering from a `claude_code_version_too_old` rejection.
Pi's version is added by pi-ai's own `createClient`, downstream of every other seam we can reach, so the built request's headers are the only place to read it.
The body splice is an exact-string replacement of the header we emitted moments earlier — never a JSON round-trip, which would put a re-serialization downstream of the byte-exact section preservation.
The recovery reads only a 400, through `response.clone()`, so the streaming success path is never touched.

Gate on the `sk-ant-oat` access-token prefix (`options.apiKey`), the same signal Pi uses internally.
This covers the main loop, compaction, and extension calls through `ctx.modelRegistry.streamSimple()`; `compat.streamSimple` callers are confirmed uncovered on pi >=0.80.8 and are out of reach from here (Issue #46, Issue #53).
Do not "fix" that by calling `registerApiProvider` — the registry is keyed by api, not provider, so it would affect all ten `anthropic-messages` providers and break `cloudflare-ai-gateway`.

### Why not `before_provider_request` or `before_agent_start`

`before_provider_request` only fires for the interactive agent loop, so it never reaches compaction or background-agent calls (Issue #18).

`before_agent_start` has no provider or model context, and there is no reliable way to gate provider-specific logic there:

- `model_select` does not fire for the initial model at startup (Pi assigns it directly to `agent.state.model` without calling `setModel`).
- The event itself does not expose which provider is active.

### Avoid by default

- wholesale OpenCode debranding logic
- `mcp_` tool prefix transport hacks
- reimplementing Pi's Anthropic transport (the wrapper delegates to the built-in transport resolved by `src/host-transport.ts`)
- assistant block reordering "to satisfy Anthropic" — measured unnecessary and removed in Issue #66; re-add only against a fresh live rejection, never against a claim ported from another project

## Useful References

- `AGENTS.md`
- `docs/plans/minimal-anthropic-override.md`
- `docs/plans/gap-analysis-and-next-steps.md`
- `src/index.ts`
- `src/diagnostics.ts`
- `src/extension-config.ts`
- `src/extra-provider-shaping.ts`
- `src/oauth-transport.ts`
- `src/request-shaping.ts`
- `src/system-prompt-sections.ts`
- `src/system-prompt-shaping.ts`
- `test/pi-anthropic-ordering-experiment.test.ts`
- `test/system-prompt-sections.test.ts`
- `test/system-prompt-shaping.test.ts`
- `test/upstream-prompt-drift.test.ts`

## Decision Rule

When debugging a new Anthropic OAuth failure in this repo:

1. Reproduce with `pi -p ... -e ...`.
2. Decide whether the failure is prompt fingerprinting, request shape, or transport.
3. Fix it in the shallowest seam that can solve it — but remember `before_provider_request` covers only the interactive loop, so cross-call-path fixes belong in the transport wrapper.
