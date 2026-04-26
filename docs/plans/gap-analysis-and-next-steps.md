# Anthropic OAuth Gap Analysis And Next Steps

## Goal

Capture the current comparison between:

1. Pi's built-in Anthropic provider in `pi-mono`
2. This repo's current minimal override
3. `opencode-anthropic-auth`
4. OpenCode's upstream Anthropic request shaping

The purpose of this document is to preserve the hard-fought compatibility lessons without over-porting OpenCode-specific baggage into Pi.

For broader notes on how this repo compares to neighboring projects, see [../comparison-to-similar-projects.md](../comparison-to-similar-projects.md).

## Current Conclusion

The project should remain hook-based for now.

The current evidence does not justify moving to a custom `streamSimple` transport override yet.
Pi already handles much of the compatibility work that OpenCode and `opencode-anthropic-auth` had to implement themselves.

The current real-world result is encouraging:

1. Anthropic OAuth login works.
2. The previous Anthropic validation error about too many `cache_control` blocks was fixed.
3. A subsequent request reached Anthropic account usage enforcement, which indicates the request got past request validation.
4. After replacing Pi's default prompt body for Anthropic OAuth with a minimal neutral prompt, live `pi` CLI requests now succeed again.
5. Live validation now covers simple prompts, tool use, multi-turn continuation, structured output, and expired-token refresh.

## What Pi Already Handles Upstream

These are not current gaps in this repo because Pi already does them in `pi-mono`.

### OAuth headers and Claude Code identity

Pi's built-in Anthropic provider already sets OAuth-specific Claude Code style headers in `pi-mono/packages/ai/src/providers/anthropic.ts:599-617`.

That includes:

1. `anthropic-beta`
2. `user-agent`
3. `x-app`
4. bearer-token auth via `authToken`

Pi also injects the Claude Code identity into `system[]` for OAuth requests in `pi-mono/packages/ai/src/providers/anthropic.ts:655-680`.

### Tool name normalization

Pi already normalizes tool names to Claude Code casing for outbound OAuth requests and maps them back on inbound responses in:

1. `pi-mono/packages/ai/src/providers/anthropic.ts:66-103`
2. `pi-mono/packages/ai/src/providers/anthropic.ts:326-332`
3. `pi-mono/packages/ai/src/providers/anthropic.ts:833-839`
4. `pi-mono/packages/ai/src/providers/anthropic.ts:917-929`

Pi also has direct tests for this behavior in `pi-mono/packages/ai/test/anthropic-tool-name-normalization.test.ts:10-205`.

This means the OpenCode plugin's `mcp_` prefix and stream-stripping logic is not something Pi should copy by default.

### Native Anthropic OAuth flow

Pi already ships native Anthropic OAuth login and refresh helpers in `pi-mono/packages/ai/src/utils/oauth/anthropic.ts:230-402`.

This repo correctly reuses them in `src/anthropic-oauth.ts:1-31`.

### Refresh locking in auth storage

Pi's auth storage already refreshes OAuth credentials under a lock in `pi-mono/packages/coding-agent/src/core/auth-storage.ts:366-412`.
`getApiKey()` routes through that locked refresh path in `pi-mono/packages/coding-agent/src/core/auth-storage.ts:424-472`.

That means OpenCode's fetch-wrapper refresh deduplication is largely compensating for OpenCode's architecture rather than proving a missing Pi gap.

## What This Repo Currently Adds

This repo intentionally adds only the thinner compatibility pieces that Pi still appeared to be missing.

### Refresh-token fallback when refresh responses omit `refresh_token`

Pi upstream currently assumes a refresh response includes a fresh `refresh_token` in `pi-mono/packages/ai/src/utils/oauth/anthropic.ts:374-378`.

This repo preserves the old refresh token when Anthropic omits rotation in `src/anthropic-oauth.ts:4-31`.

Tests:

1. `test/anthropic-oauth.test.ts:42-91`
2. `test/anthropic-oauth.test.ts:93-162`

### Billing header injection

This repo prepends an `x-anthropic-billing-header` system block for OAuth Anthropic payloads in `src/request-shaping.ts:118-137` and `src/request-shaping.ts:148-167`.

This was validated by the real-world failure transition from request validation failure to Anthropic usage enforcement.

### Avoiding the extra cached system block

This repo intentionally avoids adding `cache_control` to the injected billing block to stay under Anthropic's `maximum of 4 blocks with cache_control` limit.

Relevant code and tests:

1. `src/request-shaping.ts:134-136`
2. `test/request-shaping.test.ts:65-111`

### Assistant tool-order normalization

This repo now normalizes assistant turns when Pi serializes Anthropic content as `[tool_use..., text]`.

Relevant code and tests:

1. `src/request-shaping.ts:148-185`
2. `test/pi-anthropic-ordering-experiment.test.ts:37-195`

### Minimal default-prompt replacement for Anthropic OAuth

This repo now uses `before_agent_start` to replace Pi's default prompt body with a minimal neutral prompt when the default Pi harness prompt is detected, while preserving project context.

Relevant code and tests:

1. `src/system-prompt-shaping.ts:1-27`
2. `src/index.ts:22-29`
3. `test/system-prompt-shaping.test.ts:6-45`

## OpenCode-Specific Baggage Pi Should Not Port By Default

### Prompt debranding and paragraph stripping

The OpenCode source makes it clear why `opencode-anthropic-auth` needed heavy prompt sanitization.

OpenCode's Anthropic prompt begins with `You are OpenCode...` and contains OpenCode-specific instructions, URLs, and task-management policy in `~/development/opencode/packages/opencode/src/session/prompt/anthropic.txt:1-105`.

That explains the sanitization logic in `~/development/opencode-anthropic-auth/src/transform.ts:232-332`.

Pi does not share this problem. Porting this logic into Pi would add risk without current evidence of benefit.

This conclusion was reinforced by the later `opencode-anthropic-auth` fix in commit `4444663`, which rewrites the exact sentence `Here is some useful information about the environment you are running in:` after OpenCode traced that phrase to Anthropic returning a misleading `You're out of extra usage.` failure. The phrase comes from OpenCode's own environment prompt builder in `~/development/opencode/packages/opencode/src/session/system.ts:48-63` and does not appear in `pi-mono` or this repo.

That makes this a strong example of OpenCode-specific prompt fingerprint baggage rather than a demonstrated Pi compatibility gap.

### `mcp_` tool prefixing and stream rewriting

`opencode-anthropic-auth` prefixes tools and strips the prefix back out of the streaming response in:

1. `~/development/opencode-anthropic-auth/src/transform.ts:101-149`
2. `~/development/opencode-anthropic-auth/src/transform.ts:367-396`

Pi already has built-in Anthropic OAuth tool-name normalization, so this should not be copied into this repo unless a concrete Pi-specific incompatibility proves otherwise.

### URL rewriting, TLS overrides, and product behavior extras

The following OpenCode plugin features are not currently part of this repo's compatibility target:

1. `?beta=true` URL rewriting in `~/development/opencode-anthropic-auth/src/transform.ts:183-230`
2. base URL and insecure TLS override support in `~/development/opencode-anthropic-auth/src/transform.ts:151-181`
3. zeroing model costs in `~/development/opencode-anthropic-auth/src/index.ts:27-38`
4. OAuth-based API-key creation in `~/development/opencode-anthropic-auth/src/index.ts:188-219`

These are transport or product-layer behaviors, not currently demonstrated Claude Pro/Max compatibility gaps in Pi.

## Genuine Anthropic Lessons Worth Carrying Forward

### Preserve `system[]` rather than relocating system prompt text

`opencode-anthropic-auth` eventually settled on keeping the Anthropic system prompt in `system[]` and prepending extra blocks there.
That direction is reflected in its tests in `~/development/opencode-anthropic-auth/src/tests/transform.test.ts:729-807`.

This repo is already aligned with that lesson.

### Billing header logic matters

OpenCode's `cch` billing header implementation in `~/development/opencode-anthropic-auth/src/cch.ts:49-67` matches the logic now used in `src/request-shaping.ts:81-100`.

This appears to be a genuine Claude Pro/Max OAuth compatibility requirement rather than OpenCode baggage.

### Exact request shape can matter beyond branding

OpenCode upstream contains at least one Anthropic-specific request-shape workaround that is not just branding cleanup.

In `~/development/opencode/packages/opencode/src/provider/transform.ts:103-127`, OpenCode rewrites assistant messages where `tool-call` parts are followed by text parts in the same assistant turn.

The associated tests are in `~/development/opencode/packages/opencode/test/provider/transform.test.ts:1291-1393`.

OpenCode's comment describes Anthropic rejecting shapes like:

1. `[tool_call, tool_call, text]`

and rewriting them into separate assistant messages so that trailing text does not follow tool calls.

This is the strongest remaining candidate for a real Pi compatibility gap.

## Remaining Candidate Gaps

### 1. Upstream drift risk

Because this repo intentionally depends on Pi's built-in behavior, upstream changes in Pi could affect:

1. Claude Code identity text
2. built-in beta header behavior
3. tool-name normalization
4. Anthropic system-block layout

This is more of a maintenance risk than a current functionality gap, but it should inform test coverage.

Confidence: High.

### 2. Prompt-fingerprint risk should still be monitored

The new OpenCode fix in `~/development/opencode-anthropic-auth` commit `4444663` is a reminder that Anthropic may reject or classify requests based on exact prompt fingerprints, not just formal schema validation.

At the moment there is no evidence that Pi emits the same problematic environment phrase, and direct search did not find that phrase in `pi-mono` or this repo.

This is therefore not currently a Pi gap, but it is a maintenance warning:

1. avoid blindly copying upstream agent prompt wording from other projects
2. keep future prompt-shaping changes minimal and easy to bisect
3. treat misleading Anthropic usage-limit errors as possible prompt-shape or prompt-fingerprint failures, not only billing failures

Confidence: Medium.

### 3. Remaining work is mostly maintenance and cleanup

The core Anthropic OAuth behavior has now been validated through the live `pi` CLI path.

The main remaining work is:

1. keeping docs in sync with the current implementation
2. monitoring upstream Pi changes that could invalidate local assumptions
3. validating again after meaningful upstream Pi or Anthropic changes

Confidence: High.

## Hook-Based Versus Deeper Override

### What `before_provider_request` can handle

The current Pi extension seam can replace the serialized payload, as shown in `pi-mono/packages/coding-agent/src/core/extensions/runner.ts:757-789` and `pi-mono/packages/coding-agent/src/core/extensions/types.ts:574-578`.

That is sufficient for:

1. billing-header injection
2. system-block ordering changes
3. billing-block deduplication
4. avoiding invalid `cache_control` placement
5. request-body normalization such as assistant tool-order reshaping

### What hooks cannot handle

Pi's extension API does not allow `before_provider_request` to modify raw transport headers or URL construction, and `after_provider_response` is observational only in `pi-mono/packages/coding-agent/src/core/extensions/types.ts:580-585`.

That means hooks cannot directly solve:

1. raw HTTP header overrides after client construction
2. query parameter rewriting like `?beta=true`
3. response-stream rewriting
4. transport retry behavior
5. per-request fetch interception

Those would require a deeper override such as registering `streamSimple`.

### Recommendation

Do not move to `streamSimple` unless a concrete failure is traced to a transport-level behavior that hooks cannot touch.

Current evidence still supports remaining hook-based.

## Current Plan

### Priority 1: Keep validating through the real `pi` CLI

Use the real CLI path with this extension loaded explicitly.

This validation sequence has now been completed successfully for:

1. simple prompt
2. tool use
3. multi-turn tool continuation
4. structured output
5. expired-token refresh

Use the same CLI path again after upstream Pi or Anthropic changes, or if a new failure is reported.

The purpose remains to classify any future failures correctly:

1. prompt fingerprint issue
2. request-shape issue that hooks can solve
3. transport-level issue that would justify a deeper override

### Priority 2: Preserve the hook-based design unless validation disproves it

The current code now covers:

1. refresh fallback
2. billing-header injection
3. cache-control block-limit avoidance
4. assistant tool-order normalization
5. minimal default-prompt replacement for Anthropic OAuth

Do not introduce `streamSimple` unless a real failing case is shown to require transport control.

### Priority 3: Keep regression coverage focused on proven breakpoints

The current high-value test areas are:

1. refresh fallback behavior
2. billing-header placement
3. no duplicate billing block
4. no extra `cache_control`
5. assistant tool-order normalization
6. minimal default-prompt replacement

### Priority 4: Keep the repo small and explicit

Prefer preserving the current hook-based shape unless a new concrete failure proves it insufficient.

## Decision Record

Current decision: keep the override thin and hook-based.

Only move deeper if a real Pi Anthropic OAuth failure is shown to require one of the transport behaviors that extension hooks cannot reach.
