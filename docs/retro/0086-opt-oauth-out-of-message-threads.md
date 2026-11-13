---
issue: 86
issue_title: "Thread-continuation requests drop the billing header, so version recovery can't work and the hint points to an env var that can't help"
---

# Retro: #86 — Thread-continuation requests drop the billing header, so version recovery can't work and the hint points to an env var that can't help

## Stage: Planning (2026-11-13T01:02:40Z)

### Session summary

Planned the immediate fix for a third-party issue: opt Anthropic OAuth requests out of pi 1.5's message-thread continuations with `disableContinuation: true`, and give header-less `claude_code_version_too_old` rejections a hint that blames Pi's `claude-cli` user-agent instead of the env override.
Reproduced the reported failure live on a throwaway pi 1.5.1 (`claude-fable-5-2`), and verified both opt-out mechanisms (PR #85's `disableContinuation`, PR #87's `compat.supportsMessageThreads`) on the wire with a scratch logging copy of `src/`.
Filed #89 (pi 1.5.0 prompt-anchor drift, found by a scratch devDep bump) and #90 (longer-horizon threads support).

### Observations

- The operator asked for our own proposal rather than picking one of the two open PRs, and for two horizons: opt out now, explore threads later (#90).
- Before choosing, the operator needed to know what message threads are and whether Claude Code uses them; a local logging server answered it (no `message-threads` beta, no `thread` field, `system` on every request in `claude -p` 2.1.311/2.1.323 and interactive 2.1.311).
  `ANTHROPIC_BASE_URL` capture sufficed; mitmproxy was offered but not needed because a thread must start with a `create` request.
- The third-party "extra usage" 400 on header-less continuations did not reproduce on the operator's account (haiku/sonnet/opus 5.5 on pi 1.5.2, n=1 each, `status=allowed`, overage disabled); two independent reports say it does on theirs.
  Recorded as an open question in #90 rather than a design input.
- `disableContinuation` was chosen over the `compat` model copy: same per-request spread as our `fetch`, no copied `model` reaching `onPayload` callers.
- The pinned pi-ai 1.3.0 types lack `disableContinuation`, and bumping devDeps to 1.5.2 turned up an unrelated silent regression: pi 1.5.0 reworded its prompt and shaping became a full passthrough (measured: shaped output byte-identical to input).
  The operator kept #86 first and the drift separate (#89); the plan carries a local `MessageThreadOptOut` type that #89 removes.
- The Tidy-First assessor recommended no preparatory commits, and moved the header-less check out of `planRecovery` into `syncFetch`, because the retry body always carries our header; it also surfaced the decision not to learn the floor from a header-less rejection.
- Credit: the operator asked how reporters and PR authors would be credited, and chose co-author trailers for all three (G4bar, pandysp, denjzs) plus a named thank-you in each ship-time close comment; `cliff.toml` does not render trailers, so the commits and comments are the only credit surface.
- Trailer emails: none of the three has a public email; `denjzs`'s PR commit used an address GitHub maps to a second account (`denusklo`), so the plan keeps the `denjzs` noreply address, which the operator confirmed.

## Stage: Implementation — TDD (2026-11-13T01:12:29Z)

### Session summary

Completed all five plan steps: the OAuth-only `disableContinuation` opt-out, the `no-billing-header` hint variant, its wiring ahead of `planRecovery` in `syncFetch`, a live check, and the docs.
Tests went from 236 to 246; `check`, `lint`, and `fallow:dead-code` stayed green.
Live: pi 1.5.1 with `claude-fable-5-2` and a tool call now prints `done` (it returned the 400 with the `set-override` hint before), and pi 1.4.0 with `claude-haiku-4-5` is unaffected.

### Observations

- The step-3 test "does not learn the floor it names" was a genuine red, not the invariant pin the plan predicted: the old path learned the floor in `planRecovery` before `rebuildBody` failed.
- Mutation verification caught a process slip: the `cp` that saved the green copy ran in the same tool batch as the mutating `Edit`, so the "green" copy held the mutation; restored by hand and re-saved in its own call before continuing.
- Every planned mutation killed exactly the predicted tests; an extra mutation (`{ disableContinuation: false }` for API-key requests) confirmed the API-key pins too.
- Added a JSDoc paragraph to `BillingVersionSync` for the header-less path, which the plan listed under Module-Level Changes.
- Pre-completion reviewer: WARN.
  Reviewer warnings: no test pins that a non-string body (`Uint8Array`, `ReadableStream`) with a `claude_code_version_too_old` 400 keeps the old `planRecovery` path; correct by reading, and optional.
