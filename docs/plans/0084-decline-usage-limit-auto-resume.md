---
issue: 84
issue_title: "Auto-resume option possible?"
---

# Decline auto-resume at the subscription usage limit

## Release Recommendation

**Release:** ship independently

Issue #84 is not part of any roadmap step in `docs/architecture.md`.
The plan changes no shipped file: it records a decline, and the only action is closing the issue with a comment.
Plans are outside the release scope (`CLIFF_EXCLUDED_PATHS`), so nothing is released; `./scripts/release/next-version.sh` reported `Nothing to release (at v3.7.0)` at planning time.

## Problem Statement

A third-party user (`misterunknown`) asks whether this extension can resume a Pi session on its own once a Claude subscription's usage limit resets, or whether that is out of scope, and how the maintainer handles hitting the limit.

## Goals

- Answer the question on the issue, with a pointer to a third-party extension that does auto-resume.
- Close Issue #84 as `not_planned`.
- Change nothing in the repository beyond this plan and its retro.

## Non-Goals

- **Building auto-resume into this package.**
  This was offered at the `ask_user` gate and declined.
  The package shapes Anthropic OAuth requests ("Keep The Override Thin" in `AGENTS.md`).
  Waiting out a multi-hour window is session-level behavior that needs a UI countdown, cancellation, and a new turn.
  Doing it inside the `fetch` wrapper would hold one request open for hours with nothing shown in Pi's UI, and would retry with an access token that may have expired during the wait.
- **Appending a "resets at HH:MM" hint to the 429 error** through the `fetch` wrapper, the way `src/version-rejection.ts` hints a `claude_code_version_too_old` rejection.
  This was offered and declined.
  The live 429 shape is also unmeasured (see Background), so a hint would rest on an inferred header contract.
- **A README Troubleshooting entry.**
  This was first chosen and then withdrawn by the operator: users can find this out for themselves, and the issue comment is enough of a pointer.
- **Documenting Pi's provider-level retry settings as a workaround.**
  `retry.provider.maxRetries: 1` with `retry.provider.maxRetryDelayMs: 0` makes pi-ai sleep the full `retry-after` and retry once.
  It applies to every provider, shows only a "working" state for hours, and reuses the token the request was built with.
- **Testing or endorsing `pi-auto-resume`.**
  The comment names it as a third-party option that this project has not tested.
- No follow-up issue is filed; nothing in this plan is deferred.

## Background

### What Pi does at the limit

Traced from the `~/development/pi/pi` clone at `9a4dcacb7` (after v1.6.1), with the defaults confirmed in the installed copy's `dist/core/settings-defaults.js`:

1. pi-ai's Anthropic transport calls the SDK with `maxRetries: 0` and wraps it in `retryProviderRequest` (`packages/ai/src/utils/provider-retry.ts`).
   With the default `retry.provider.maxRetries` unset (0), a 429 is thrown at once; with retries enabled, a `retry-after` above `maxRetryDelayMs` (default 60 s) fails with `Server requested Ns retry delay (max: 60s)`.
2. `AgentSession._isRetryableError` (`packages/coding-agent/src/core/agent-session.ts`) classifies the error with `isRetryableAssistantError` (`packages/ai/src/utils/retry.ts`), whose patterns include `rate.?limit` and `429`.
3. `_prepareRetry` retries up to `retry.maxRetries` (default 3) times at `baseDelayMs * 2^(n-1)` (default 2 s, 4 s, 8 s), capped by `maxAgentDelayMs` (60 s).
4. After the third retry fails, the run ends with the error, and the user must send a prompt after the reset.

So Pi treats a subscription limit as a short transient throttle; nothing waits for the window to reset.

### What Anthropic sends (inferred, not measured)

The Claude Code 2.1.326 binary's rate-limit simulator answers a rejected request with a 429 `rate_limit_error`, `anthropic-ratelimit-unified-status: rejected`, `anthropic-ratelimit-unified-reset: <epoch seconds>`, and `retry-after: <reset - now>`.
A LiteLLM report (BerriAI/litellm#37754) says Claude Code depends on those two headers to fail fast, which supports the same reading.
Neither is a live capture, because the limit cannot be triggered on demand.

### Prior art

- Claude Code itself auto-resumes at the reset: its binary carries strings such as "the task will not resume on its own when the usage limit resets" and "[usage limit recheck] probe admitted".
- `@fahrizkyputra/pi-auto-resume` (v0.4.2, <https://github.com/fahrizkyputra/pi-auto-resume>) is a Pi extension that does this.
  Read from its published tarball: it listens to `after_provider_response` (status and headers, including error responses) and `agent_settled`, remembers `anthropic-ratelimit-unified-reset`, shows a status-bar countdown, cancels on Esc or input, and sends a marked continuation at the reset.
- It is compatible with this extension in principle: `src/oauth-transport.ts` spreads the caller's `options` into the delegate call, so Pi's `onResponse` (which emits `after_provider_response`) reaches pi-ai unchanged.
  Not verified live.
- Upstream Pi has no built-in auto-resume; the closest open item is earendil-works/pi#11071 (structured provider failure metadata, including the requested retry delay).

## Design Overview

No code or docs change.
The deliverable is the close comment below, posted with reason `not_planned` (in the `github-voice` style):

```markdown
Thanks for asking, Marco!

I've decided to keep auto-resume out of this extension.
It only shapes Anthropic OAuth requests, and waiting out a 5-hour window is session-level behavior: it needs a countdown in Pi's UI, a way to cancel, and a fresh turn once the limit resets.
Doing that inside the request transport would leave Pi showing nothing for hours, and it would retry with a token that may have expired in the meantime.

Today Pi retries a rate-limited request three times over a few seconds and then stops, so I send a prompt myself after the reset.

[pi-auto-resume](https://github.com/fahrizkyputra/pi-auto-resume) is a third-party extension that does what you describe.
It reads the reset time from Anthropic's response headers, waits, and then continues the session.
I haven't tested it alongside this extension, but nothing in this extension should get in its way.
```

## Module-Level Changes

None.
Predicted unchanged, with the claim each rests on:

- `README.md`: the operator declined a Troubleshooting entry.
- `AGENTS.md`, `.pi/skills/anthropic/SKILL.md`, `docs/architecture.md`: none documents usage-limit behavior (`rg -n -i 'usage limit|rate.?limit'` over them finds only the 7-day utilization note and the `accounts:` rate-limit tier in the `anthropic` skill).
- `src/`, `test/`: no code change.

## Test Impact Analysis

No code changes, so no tests.
The comment's two checkable claims were verified at planning time:

1. Pi's retry defaults: `rg -n 'maxRetries: 3|baseDelayMs: 2000' node_modules/@earendil-works/pi-coding-agent/dist/core/settings-defaults.js` prints lines 19 and 20.
2. The link resolves: `gh repo view fahrizkyputra/pi-auto-resume --json url` prints the repository URL.

## Invariants at risk

None; nothing in the repository changes.

## TDD Order

No implementation steps, so neither `/tdd-plan` nor `/build-plan` applies.

1. Close Issue #84 with reason `not_planned` and the comment from Design Overview (`issue_close`).

## Risks and Mitigations

- **The third-party extension changes, breaks, or disappears.**
  The comment calls it third-party and untested and names no version; a stale pointer in a closed issue costs nothing to maintain.
- **Pi adds a built-in auto-resume later.**
  The `upstream-watch` sweep at a later Pi release would surface it; a reply on the closed issue can point there.

## Open Questions

- Whether Anthropic's real subscription-limit 429 carries `retry-after` and `anthropic-ratelimit-unified-reset` is unmeasured.
  It matters only if a later issue revisits the declined reset-time hint.
