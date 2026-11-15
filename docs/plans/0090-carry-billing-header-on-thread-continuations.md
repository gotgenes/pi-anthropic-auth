---
issue: 90
issue_title: "Explore supporting Anthropic message threads for OAuth requests"
---

# Carry the billing header on message-thread continuations, and let OAuth requests use threads

## Release Recommendation

**Release:** ship independently

Issue #90 is not part of any `docs/architecture.md` roadmap batch.
It reverses the opt-out [#86] shipped in v3.4.5, so it should go out as soon as its live check passes rather than wait on unrelated work.

## Problem Statement

[#86] opted Anthropic OAuth requests out of pi-ai 1.5's message threads (`disableContinuation: true`).
pi builds a `thread: {type: "continue"}` request after `onPayload` has run, and leaves `system` out of it.
Our billing header lives in `system`, so a continuation reached Anthropic without it.
That broke version recovery ([#75]) on continuations, and two reporters saw header-less continuations rejected as third-party usage.

The issue asks whether OAuth requests can use threads at all.
It listed four obstacles:

1. `system` is create-only, so no continuation can carry the billing header.
2. Nobody knows how Anthropic attributes a header-less continuation: accepted on two accounts, rejected on two.
3. On a continuation, the version gate reads pi's `claude-cli` user-agent, which our recovery cannot raise.
4. Claude Code does not use threads, so threads would move pi further from Claude Code's request shape.

Planning measured each of these, and obstacles 1 and 4 turned out to be wrong (see Background).
Claude Code does use threads, and on each continuation it sends `system` filtered down to its billing-header block.
Anthropic accepts that block on a continuation, leaves it out of the thread fingerprint, and reads it for the version gate.
So the billing header can travel on every continuation, which is exactly what Claude Code does.

## Goals

- Every Anthropic OAuth `thread: continue` request that reaches our `fetch` wrapper without `system` carries `system: [<billing header block>]`, matching Claude Code's continuation shape.
- OAuth requests no longer set `disableContinuation`, so pi's message threads apply to them as they do to API-key requests.
  A caller's own `disableContinuation` (pi's cache warmer sets `true`) passes through untouched.
- Version reconciliation ([#74]) and rejection recovery ([#75]) apply to continuations unchanged, because the body now carries the header they rewrite.
- API-key and non-Anthropic requests stay untouched.
- Classification: **not breaking** (`feat:`).
  No extension output, default, or config contract changes.
  The wire shape of OAuth requests changes back to pi's own default, and users who want full requests can opt out through pi's existing `models.json` compat key (see Design Overview).

## Non-Goals

- Sending the full `system` on continuations.
  Anthropic accepts an identical one (measured), but it re-uploads about 65 KB per turn, and any byte drift costs a `thread_fingerprint_mismatch` round trip.
  The operator chose billing-block-only, the shape Claude Code sends when its server flag is on.
- A config key of our own to turn threads off.
  pi already has one: `providers.anthropic.compat.supportsMessageThreads: false` in `models.json`, merged into built-in models by `provider-composer`.
- Raising pi's `claude-cli` user-agent on rejection (the direction measured in the 2026-11-15 comment on #90).
  With the header attached, Anthropic gates continuations on the header (measured), so the user-agent no longer matters for recovery.
- Asking pi upstream to keep `x-anthropic-billing-header` blocks on continuations.
  The `fetch`-boundary splice fixes it from here; an upstream change would be speculative.
- Measuring time to first token at long context.
  Planning measured a 66 KB, 6-turn session (below); the long-context claim is Anthropic's.
- Changing `version-rejection.ts`'s `no-billing-header` hint.
  It stays reachable (first user message with no text) and its wording stays accurate.

## Background

### Measurements taken during planning

All runs were on 2026-11-15, on pi 1.5.2 (`./node_modules/.bin/pi`, `-ne`), against the operator's Max 20x account, one run per row.
They used a scratch copy of `src/` (`/tmp/probe90`) that rewrote each continuation body at the `fetch` boundary before dispatch, as described in the `pi-cli-repro` skill.
The prompt ran one `bash` tool call, so turn 2 was a continuation.

Continuation variants on `claude-haiku-5-5` (the `create` always carried the full shaped `system`):

| Continuation `system` | Result |
| --- | --- |
| none (what pi sends) | 200 |
| `[billing block]` | 200 |
| full, identical to the `create` | 200 |
| full, last block changed | 400 `thread_fingerprint_mismatch`, "differing field(s): system"; pi then re-created the thread |
| `[billing block]` rebuilt at a different valid version (2.1.330) | 200 |

The version gate on `claude-fable-5-2` (floor 2.1.290):

| Continuation `system` | `user-agent` | Result |
| --- | --- | --- |
| none | `claude-cli/2.1.280` | 400 `claude_code_version_too_old` |
| `[billing block]` at 2.1.323 | `claude-cli/2.1.280` | 200 |
| `[billing block]` at 2.1.280, valid suffix | `claude-cli/2.1.322` | 400 `claude_code_version_too_old` |
| `[billing block]` at 2.1.330, valid suffix | `claude-cli/2.1.322` | 200 |
| `[billing block]` at 2.1.280, stale suffix | `claude-cli/2.1.322` | 200, so Anthropic ignored the malformed header and read the user-agent |

So on a continuation, a well-formed billing header gates the version exactly as it does on a `create`.
Obstacle 1 holds only for a `system` that differs from the thread's; the billing block is outside that comparison.

Time to response headers in a 6-turn tool-call session, about 66 KB of context on `claude-haiku-5-5`, three runs per mode:

| Mode | Upload per later turn | Median time to response headers (n=15) |
| --- | --- | --- |
| Threads, billing block attached | 657 B | 627 ms |
| Full requests (opt-out) | 66.0–67.4 KB | 603 ms |

At this size threads save upload, not latency.
Time to headers is a proxy for time to first token, not the same measurement.

### Claude Code uses threads

The #86 capture found no threads in Claude Code, but that capture pointed `ANTHROPIC_BASE_URL` at a local server.
Claude Code drops message threads for any non-default base URL, starting with 2.1.265 ([anthropics/claude-code#98464]).
The installed Claude Code 2.1.311 binary ships the `message-threads-2026-08-12` beta.
Its continuation builder sends `system: Adr(system)` when a server flag (`tengu_quiet_heron`) is on.
`Adr` keeps only the blocks whose text starts with `x-anthropic-billing-header:`, plus one fixed prompt block.
With the flag off it sends the full `system` and `tools`.
Either way the billing header rides every continuation.

### pi's thread path (v1.5.2, unchanged on `main` at `463e17f8d`)

`packages/ai/src/api/anthropic-messages.ts`:

1. `buildParams` → `onPayload(params)` (our shaping, which records the full payload's first user text in `BillingVersionSync.recordRequest`).
2. `prepareThreadRequest` strips `system` and `tools` and slices `messages` when the prefix hash matches.
3. `sendThreadRequest` → the SDK → our injected `options.fetch`.
   On a `NEW_THREAD_ERRORS` code (`thread_fingerprint_mismatch` among them) it resends `params` in full as a new thread.

The hash pi compares is computed on its own `params`, so editing the wire body leaves pi's thread bookkeeping intact.
Unreleased `main` widens the threads default to any provider on `api.anthropic.com` (earendil-works/pi#11987).
That reaches config-named providers such as `anthropic-2` ([#70]), and the wrapper covers those too, because the splice runs for every OAuth request that goes through it.

### Relevant modules

- `src/oauth-transport.ts`: `MESSAGE_THREAD_OPT_OUT` and its OAuth-only spread into the delegate options.
- `src/billing-version-sync.ts`: `createBillingVersionSync`, whose `syncFetch` computes `pinned`, `target`, `upgraded`, `sentInit`, and `sentVersion`, dispatches, then runs the header-less hint, `planRecovery`, and the single retry.
  `rebuildBody` swaps one exact header string for another; `lacksBillingHeader` detects a string body with no marker.
- `src/billing-header.ts`: `buildBillingHeaderValue(messageText, version)` and `BILLING_HEADER_MARKER`.
- `test/message-thread-drift.test.ts`: drives pi's own transport through two turns; its OAuth test currently pins the opt-out.

`AGENTS.md` constraints that apply: keep the override thin; gate on `sk-ant-oat`; never JSON-round-trip a body (the existing exact-string splice convention); the `message-thread-drift` suite is one of four sanctioned suites that drive pi internals.

## Design Overview

### Decision

Two changes, one in each layer that owns the fact:

1. The `fetch` wrapper gives a header-less continuation the billing block, because only the built body shows that pi made a continuation.
2. The transport wrapper stops opting OAuth requests out of threads.

### The splice helper (new `src/thread-continuation.ts`)

```typescript
/**
 * Returns `body` with `system: [{ type: "text", text: headerText }]` spliced
 * in, when `body` is a message-thread continuation that carries no `system`;
 * otherwise `undefined`.
 */
export function withBillingBlockOnContinuation(
  body: string,
  headerText: string,
): string | undefined;
```

- It parses `body` only to decide; a parse failure, a non-object top level, `thread?.type !== "continue"`, or an own `system` key returns `undefined`.
  Parsing is the only reliable test: a `"system":` substring can occur as a key inside a `tool_use` input object.
- It splices by string: `` `{"system":[${JSON.stringify(block)}],${body.slice(1)}` ``, guarded by `body.startsWith("{")` and a non-empty remainder.
  The block is `{ type: "text", text: headerText }`, the same shape `prependBillingHeader` emits, with no `cache_control`.
- It is a pure function of its two arguments; it reads no version, floor, or env.
  A cheap prefilter (`body.includes('"continue"')`) skips the parse for `create` bodies, which run to tens of kilobytes.

### Where it runs (`src/billing-version-sync.ts`)

A preparatory refactor (TDD step 2) moves the pre-send derivation out of `syncFetch` into a closure next to `rebuildBody`:

```typescript
function prepareOutgoing(
  init: RequestInit | undefined,
  userAgent: string | undefined,
): { init: RequestInit | undefined; version: string };
```

The feature step then adds one stage at its top: attach at the pin, then upgrade as today.

```typescript
const pinned = resolveClaudeCodeVersion();
const attached = attachToContinuation(init?.body, pinned); // string | undefined
const body = attached ?? init?.body;
const target = targetVersion(userAgent);
const upgraded = target === pinned ? undefined : rebuildBody(body, pinned, target);
// sentInit carries `upgraded ?? attached` when either is defined; sentVersion as today
```

`attachToContinuation` is a closure helper.
It returns `undefined` unless `body` is a string and `buildBillingHeaderValue(firstUserText, pinned)` is defined, and then delegates to `withBillingBlockOnContinuation`.
Attaching at `pinned` is what keeps everything downstream unchanged.
`rebuildBody(…, pinned, target)` finds the attached header and raises it to pi's version or the learned floor.
`planRecovery(…, sentVersion)` retries a rejected continuation at the named floor.
An env override stays absolute, because `pinned` and `target` are then both the override.

`firstUserText` is correct on a continuation: `recordRequest` receives the full, pre-thread payload from `onPayload`, so it is the conversation's first user text, the same text the `create` header was hashed from.

The header-less hint (`lacksBillingHeader`) stays.
After this change it is reachable only when no header could be built, that is, when the first user message has no text.

### The transport wrapper (`src/oauth-transport.ts`)

Delete `MESSAGE_THREAD_OPT_OUT` and its spread.
`...options` already forwards a caller's `disableContinuation`, so pi's cache warmer (which sets `true`) keeps its opt-out.

### Escape hatch

A user who wants full requests sets, in `~/.pi/agent/models.json`:

```json
{ "providers": { "anthropic": { "compat": { "supportsMessageThreads": false } } } }
```

`provider-composer.ts` (v1.5.2, line 329) merges provider-level `compat` into built-in chat models, and `getAnthropicCompat` reads `supportsMessageThreads` from it.
This rests on reading the code, not on a run; TDD step 5 verifies it live.

### Edge cases

| Input at `fetch` | Behavior |
| --- | --- |
| `create` body (has `system`) | unchanged |
| request with no `thread` (threads off, cache warmer, pi's threads-unsupported fallback) | unchanged |
| `continue`, no `system`, first user text recorded | billing block spliced in at the pin, then raised as today |
| `continue` that already has `system` (a future pi) | unchanged |
| `continue`, first user message has no text | unchanged; a version rejection gets the `no-billing-header` hint |
| non-string body | unchanged |
| API-key request | the sync is never constructed |

## Module-Level Changes

- `src/thread-continuation.ts` (new): `withBillingBlockOnContinuation`.
- `src/billing-version-sync.ts`: extract `prepareOutgoing` (step 2); add the attach stage and the `attachToContinuation` closure helper (step 3).
  Update the `BillingVersionSync` doc (continuations now carry the header) and the `lacksBillingHeader` doc (reachable only with no first-user text).
- `src/oauth-transport.ts`: remove `MESSAGE_THREAD_OPT_OUT`, its spread, and its doc comment; mention in the wrapper doc that continuations carry the billing block via the `fetch` wrapper.
- `test/thread-continuation.test.ts` (new): helper unit tests.
- `test/billing-version-sync.test.ts`: step 1 adds a `textlessPayload()` builder, renames `headerlessBody()` to `continuationBody()`, and moves the four `no billing header` tests onto `textlessPayload()`; step 3 adds a `describe("message-thread continuations")`.
- `test/oauth-transport.test.ts`: rewrite `describe("message-thread opt-out")`.
- `test/message-thread-drift.test.ts`: the OAuth test asserts a billing-only continuation; update the header comment.
- `README.md`: rewrite "Requests fail after the first tool call on Pi 1.5" (lines ~114-121) and add the `models.json` escape hatch.
- `AGENTS.md`:
  - Current Status item 10 and the paragraph after the list (line ~64).
  - The Architecture paragraph at line ~102.
  - Coverage item 1 (`oauth-transport`), item 4 (`billing-version-sync`), and item 15 (`message-thread-drift`).
  - Add a coverage entry for `test/thread-continuation.test.ts`.
  - Add `src/thread-continuation.ts` to Local Files (renumbering the list).
  - The "Registering `streamSimple`" gotcha (line ~612), which lists "a message-thread opt-out".
- `docs/architecture.md`: rewrite the `disableContinuation` paragraph (lines ~155-161), and change the Mermaid node `S` label ("Inject onPayload shaping, fetch wrapper, thread opt-out").
  Add `src/thread-continuation.ts` to the module list next to `src/billing-version-sync.ts` (line ~320), and extend that entry to say it attaches the billing block to continuations.
- `.pi/skills/anthropic/SKILL.md`:
  - Replace the `disableContinuation` bullet group (lines ~52-56) with the measured continuation shape.
  - Correct "Claude Code itself does not use threads".
  - Add to Core Lesson 7 and "Measured 2026-11-01" that a custom `ANTHROPIC_BASE_URL` turns Claude Code's threads off, so a local-server capture cannot see them.
  - Add the binary-strings technique as the alternative.
- `.pi/skills/upstream-watch/SKILL.md`: rewrite the `options.disableContinuation` watchlist row to the new assumption (pi strips `system` from continuations after `onPayload`; the body is a JSON string with a top-level `thread`).
  Add an Anthropic-side row: a billing-only `system` is accepted on a continuation and read for the version gate.
- Predicted unchanged:
  - `src/version-rejection.ts`: the hint wording stays accurate.
  - `src/request-shaping.ts`: `onPayload` shaping is untouched.
  - `src/billing-header.ts`: the recipe is reused, not changed.
  - `test/version-rejection.test.ts`.

## Test Impact Analysis

1. The new pure helper makes the splice testable without a `fetch`, a sync, or a version.
   That covers byte-exactness, parse rejection, a nested `"system"` key, and an existing `system`.
2. No existing test becomes redundant.
   The four `no billing header` tests keep their claims on a different fixture.
3. `test/message-thread-drift.test.ts` must stay a pi-driving suite.
   It is the only test that sees pi strip `system` after `onPayload` and the wrapper put the block back on the real wire body.

## Invariants at risk

| Invariant (source) | Constituency | Pinned by |
| --- | --- | --- |
| Every OAuth request reaching Anthropic carries the billing header ([#86]) | Subscription users on every plan; header-less continuations were rejected on two accounts | `message-thread-drift` OAuth test (reworked: `system` is exactly `[billing block]` on the continuation) |
| A `create` body leaves `fetch` byte-identical when no version change applies ([#74]) | Prompt-cache hits | existing `leaves the body untouched…` tests; the helper's prefilter and `undefined` return |
| The splice never re-serializes the body | Byte-exact section preservation (Issue #67) | helper test asserting the exact output string |
| API-key requests keep pi's threads and get no `fetch` | API-key users | `message-thread-drift` API-key test; `oauth-transport` API-key opt-out tests (unchanged pins) |
| A caller's `disableContinuation: true` survives | pi's cache warmer (a warm replay must not consume thread state) | new `oauth-transport` test |
| A header-less rejection blames pi and learns no floor ([#86]) | Users on a pi below a model's floor | the four rewritten `no billing header` tests |
| Recovery retries once at the named floor ([#75]) | Users when Anthropic raises a floor | existing recovery tests, plus a new continuation retry test |

Quantitative: a continuation grows by its billing block (measured 657 B with the block vs. 574–576 B without, per #85 and #86).
That still avoids a ~66 KB re-upload on every turn.

## TDD Order

1. `test: give the header-less rejection tests a payload with no first-user text`
   - In `test/billing-version-sync.test.ts`, add `textlessPayload()`, a shaped payload whose first user message holds only a `tool_result` block and whose `system` has no billing block.
   - Rename `headerlessBody()` to `continuationBody()`.
   - Switch the four tests under `when the rejected request carried no billing header` to `recordRequest(textlessPayload())`.
   - All four are **invariant pins**, green before and after.
   - Killing mutation: in `syncFetch`, delete the `if (lacksBillingHeader(sentInit?.body)) { … }` block. "blames Pi's own claude-cli version", "blames Pi rather than an override", and "omits Pi's version" go red; "does not learn the floor it names" goes red because `planRecovery` learns first.
2. `refactor: extract outgoing-request preparation from syncFetch`
   - Move the `pinned`/`target`/`upgraded`/`sentInit`/`sentVersion` derivation into a `prepareOutgoing(init, userAgent)` closure placed below `syncFetch`.
   - This prepares the attach stage so it lands without adding a third body-state branch to `syncFetch`, which fallow flags today: cyclomatic 13, 55 lines, CRAP 49.5, measured.
   - No behavior change; the full `test/billing-version-sync.test.ts` stays green.
   - Re-read the moved code against `code-design` before committing.
3. `refactor: add a helper that splices the billing block into a thread continuation`
   - Add `src/thread-continuation.ts` and `test/thread-continuation.test.ts`.
   - Tests:
     - The output equals `{"system":[{"type":"text","text":"<h>"}],` + `body.slice(1)`, compared as an exact string.
     - The result parses with `system` as the only change.
     - Splices a continuation whose only `"system"` key is nested in a `tool_use` input, because it has no top-level `system`.
     - Returns `undefined` for a `create` body, a body with no `thread`, a continuation that already has `system`, invalid JSON, and a JSON array.
   - Killing mutations, one per class:
     - Return `{"system":[…],` + `body` without `.slice(1)`: kills the exact-string test.
     - Drop the own-`system` check: kills the "already has `system`" test.
     - Replace the parsed own-`system` check with `body.includes('"system":')`: kills the nested-key test.
     - Change `"continue"` to `"create"`: kills the splice test and the `create` test.
   - `refactor:`, because no consumer references the module yet.
4. `feat: send Anthropic OAuth requests as message threads, with the billing header on every continuation`
   - In `src/billing-version-sync.ts`: add `attachToContinuation` and the attach stage at the top of `prepareOutgoing`, and update both doc comments.
   - In `src/oauth-transport.ts`: remove `MESSAGE_THREAD_OPT_OUT` and its spread, and update the docs.
   - Tests in `test/billing-version-sync.test.ts`, under a new `describe("message-thread continuations")`, all **red**:
     - Attaches the billing block at the pin when pi reports no higher version.
     - Raises the attached block to pi's `claude-cli` version.
     - Sends a continuation at a learned floor without a rejection.
     - Retries a rejected continuation once at the named floor, with the retry body carrying the block at that floor.
     - Leaves a continuation untouched when no request was recorded (**pin**).
   - Tests in `test/oauth-transport.test.ts`:
     - "leaves OAuth requests on pi's continuations": `disableContinuation` is absent. **Red.**
     - "keeps an OAuth caller's own opt-out": `true` preserved. **Pin.**
     - "keeps an OAuth caller's `disableContinuation: false`". **Red.**
     - The two API-key tests are unchanged pins.
   - Test in `test/message-thread-drift.test.ts`: the OAuth turn 2 has `thread: {type: "continue", previous_message_id: "msg_1"}` and `system` deep-equal to a single block whose text starts with `BILLING_HEADER_MARKER`. It also has `messages.length === 1`, and that block's text equals turn 1's first `system` block text. **Red.**
   - Killing mutations:
     - Make `attachToContinuation` return `undefined`: kills the new sync tests and the drift test.
     - Restore the `MESSAGE_THREAD_OPT_OUT` spread: kills the transport "leaves OAuth requests" and "`false`" tests and the drift test.
     - Skip `rebuildBody` on attached bodies, by passing `init?.body` instead of `body`: kills "raises the attached block".
   - Commit trailer, because @kcocoa's Pro measurement and their case for keeping threads on (comment on #90) set the direction:
     `Co-authored-by: Kamfor Cocoa <202315505+kcocoa@users.noreply.github.com>`
5. Live check (no commit), on pi 1.5.2 with `-ne -e src/index.ts`, using a scratch `src/` copy that logs each body summary after `dispatch` (the `pi-cli-repro` technique):
   - `claude-haiku-5-5`, one `bash` tool call. Expect turn 2 to be `thread=continue`, `system=1`, carrying the pi-raised `cc_version`, with a 200.
   - `claude-fable-5-2`, same prompt, in a scratch copy with `CLAUDE_CODE_VERSION` forced to 2.1.280 and the pi-version read disabled (the [#75] live check). Expect the `create` to be rejected, retried at 2.1.290, then 200. Expect the continuation to go out at the learned 2.1.290 with a 200.
   - The escape hatch. Use `ask_user` to have the operator temporarily add `providers.anthropic.compat.supportsMessageThreads: false` to `~/.pi/agent/models.json`, then confirm both turns go out with no `thread` and a full `system`. Remove the key afterwards.
6. `docs: record that OAuth requests use message threads with the billing header attached`
   - Update `README.md`, `AGENTS.md`, `docs/architecture.md` (prose and Mermaid node `S`), `.pi/skills/anthropic/SKILL.md`, and `.pi/skills/upstream-watch/SKILL.md`, as listed in Module-Level Changes.
   - Grep afterwards: `rg -n -i 'disableContinuation|opt(s|ed)? out of (pi.s )?(anthropic )?message|does not use threads|create-only' README.md AGENTS.md docs/architecture.md .pi/skills src test` should leave only history (plans and retros are excluded) and the `oauth-transport` caller-pass-through test.

## Risks and Mitigations

- **Attribution on a Pro login is unmeasured with the header attached.**
  The operator's Max account accepts continuations in every variant, so it cannot discriminate.
  Mitigations:
  - The continuation now has Claude Code's own shape, which a reporter's Pro account (kcocoa) accepted even without the header.
  - The `models.json` escape hatch exists.
  - The README troubleshooting entry names it.
  - At ship time, ask @G4bar and @denjzs (whose Pro accounts rejected header-less continuations) to confirm.
- **Anthropic starts fingerprinting the billing block.**
  Then pi's `thread_fingerprint_mismatch` fallback resends in full as a new thread, so a request costs one extra round trip and does not fail.
- **A future pi keeps `system` on continuations.**
  The helper leaves a body with `system` alone, so it degrades to pass-through.
  `test/message-thread-drift.test.ts`'s control test fails if pi stops stripping `system`, which flags the change.
- **pi renames `thread` or changes the continuation shape.**
  The helper returns `undefined`, so continuations go out header-less, which is the [#86] failure mode.
  The drift suite's OAuth test fails on a pi-ceiling run within about two hours of the release.
- **The splice prefilter misses a continuation.**
  `JSON.stringify` emits `"type":"continue"` without whitespace, and the prefilter only gates the parse, so a miss means "no attach", never a corrupted body.
  The drift test runs on pi's real serializer.

## Open Questions

- Does a Pro login bill a continuation that carries the billing header to the plan?
  Ask the #85/#86 reporters at ship time; no follow-up issue until someone reports a rejection.
- Is threads' time-to-first-token benefit material at long context (100k+ tokens)?
  It is not needed for this decision: the change matches pi's default and Claude Code's shape regardless.

[#70]: https://github.com/gotgenes/pi-anthropic-auth/issues/70
[#74]: https://github.com/gotgenes/pi-anthropic-auth/issues/74
[#75]: https://github.com/gotgenes/pi-anthropic-auth/issues/75
[#86]: https://github.com/gotgenes/pi-anthropic-auth/issues/86
[anthropics/claude-code#98464]: https://github.com/anthropics/claude-code/issues/98464
