---
issue: 86
issue_title: "Thread-continuation requests drop the billing header, so version recovery can't work and the hint points to an env var that can't help"
---

# Opt Anthropic OAuth requests out of pi's message-thread continuations

## Release Recommendation

**Release:** ship independently

The issue is not part of any `docs/architecture.md` roadmap batch.
It fixes a live failure on pi >=1.5.0, so it should not wait on [#89] (prompt-anchor drift), which is planned separately.

## Problem Statement

pi-ai 1.5.0 added Anthropic message threads.
When a session has a `sessionId` and the conversation prefix is unchanged, pi sends each later turn as `thread: {type: "continue"}` with only the new messages.
`prepareThreadRequest` builds that body after our `onPayload` has run, and strips `system` and `tools` from it.
Anthropic's docs say `system` and `tools` are create-only, and sending either on a continue request is a 400.
So no continuation can carry the billing header this extension prepends to `system[]`.

What the user sees, reproduced live during planning (pi 1.5.1, `claude-fable-5-2`, current `main`, one tool call):

1. The prompt request goes out with 3 `system` blocks and `cc_version=2.1.280`.
   It is rejected as `claude_code_version_too_old`, our recovery retries at 2.1.290, and the retry returns 200.
2. The request after the tool result is a 576-byte `thread: continue` with no `system` and no billing header.
   Anthropic gates it on pi's `user-agent: claude-cli/2.1.280` and rejects it.
3. The error reaching the user ends with `[pi-anthropic-auth] Automatic recovery did not succeed; set PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION=2.1.290 and retry.` — advice that cannot help, because there is no billing header for the override to change.

Two third-party reports (PR [#85], and a comment on this issue linking PR [#87]) also describe header-less continuations rejected as third-party usage (`You're out of extra usage` / `Third-party apps now draw from your extra usage`).
That did not reproduce on the operator's account (see Background), but the billing header is this extension's whole mechanism, and continuations are the one request shape that cannot carry it.

## Goals

- Every Anthropic OAuth request that reaches the wrapper is a full request carrying `system` and the billing header, as on pi <=1.4 and as Claude Code sends.
- API-key and non-Anthropic requests keep pi's own message-thread behavior untouched.
- A `claude_code_version_too_old` rejection of a request that carried no billing header gets a hint that names the real cause (pi's own `claude-cli` version) and says to upgrade Pi, instead of the env-var advice.
- Classification: **not breaking** (`fix:`).
  The extension's own outputs, defaults, and config are unchanged; it overrides a pi feature that is days old for OAuth requests only, restoring the pi <=1.4 wire shape.
  A user who explicitly set `compat.supportsMessageThreads: true` for an OAuth provider loses threads, which is the intended fix rather than a contract this package offered.
  A major bump would also strand users: a `^3` install is not moved across a major by `pi update` (see `AGENTS.md`, "`registerProvider` Merges, It Does Not Replace").

## Non-Goals

- Supporting message threads for OAuth requests.
  That is the longer-horizon question, filed as [#90] with the measurements, obstacles, and what pi might need to provide.
- The pi 1.5.0 prompt-anchor drift and the devDep bump to 1.5.2, filed as [#89].
  This plan stays on the pinned pi 1.3.0 devDeps, so it adds a local type for `disableContinuation` that [#89] removes.
- An offline drift alarm that drives pi's real transport through two thread turns — it needs pi-ai >=1.5.0 in devDeps, so it belongs to [#89].
- Raising pi's `user-agent` on a recovery retry (the issue's option 2): with continuations off, every OAuth request carries the billing header, so header-based recovery suffices.
- Recommending a `models.json` `user-agent` header override in the hint; the hint says to upgrade Pi, which is the supported fix.
- Revisiting whether automatic version raising should exist at all (the `kcocoa` comment); out of scope here.

## Background

### Upstream mechanism (pi clone at `d36266e06`, unchanged from v1.5.2 for this path)

`packages/ai/src/api/anthropic-messages.ts`:

- `getAnthropicCompat().supportsMessageThreads` defaults to `model.baseUrl.includes("api.anthropic.com")` (v1.5.2 keyed it on the `anthropic` provider; unreleased `main` widened it to any provider on that host in `49fe0a237`, which reaches config-named providers such as pi-multi-pass's `anthropic-2`).
- `threadSessionId = compat.supportsMessageThreads ? cacheSessionId : undefined`.
- After `onPayload`, `prepared = threadSessionId !== undefined && options?.disableContinuation !== true ? prepareThreadRequest(...) : undefined`; with `prepared` undefined the request is sent as a plain full request with no `thread` field.
- `StreamOptions.disableContinuation` is a typed, documented field (pi-ai >=1.5.0): "Do not use or record server-side continuation state for this request."
  `buildBaseOptions` forwards it from `SimpleStreamOptions`; pi's cache warmer already sets it.
- The `message-threads-2026-08-12` beta header is still sent when `disableContinuation` is set; pi documents a request without `thread` as a normal request under that beta.

On pi <=1.4 the field does not exist and `buildBaseOptions` copies only the fields it lists, so passing it is a no-op across the whole `>=0.86.0` peer range.

### Measurements taken during planning

All live runs used `-ne -e <path>` against a throwaway pi install in `/tmp`, with a scratch copy of `src/` that logged what `createBillingVersionSync`'s `fetch` sent.

| Run | Request 2 shape | Result |
| --- | --- | --- |
| pi 1.5.2, haiku/sonnet/opus 5.5, `main` (measured, n=1 each) | `continue`, 0 `system` blocks, no `cc_version` | 200; `anthropic-ratelimit-unified-status=allowed`, overage disabled |
| pi 1.5.1, `claude-fable-5-2`, `main` (measured) | `continue`, 0 `system`, no `cc_version` | 400 `claude_code_version_too_old` with the `set-override` hint |
| pi 1.5.1, `claude-fable-5-2`, `disableContinuation: true` for OAuth (measured) | full, 3 `system`, `cc_version=2.1.290`, no `thread`, threads beta still sent | 200 (request 1: one recovery retry, then 200) |
| pi 1.5.1, `claude-fable-5-2`, `compat.supportsMessageThreads: false` model copy (measured) | full, 3 `system`, `cc_version=2.1.290`, no `thread`, no threads beta | 200 |

Claude Code does not use message threads (measured against a local logging server): `claude -p` 2.1.311 and 2.1.323 and interactive `claude` 2.1.311 send no `message-threads` beta and no `thread` field, and send 3 `system` blocks on every request.

Turning continuations off changes only request size, not tokens: Anthropic documents no pricing or rate-limit change for threads, and pi says token counts and prompt caching are unchanged.
Measured request size in this repo: about 65 KB full versus about 540 B for a continuation on the first tool turn; the full size grows with the conversation.

### Local code

- `src/oauth-transport.ts` `createAnthropicOAuthStreamSimple`: per request, resolves `isOAuthRequest` from `options.apiKey`, builds `versionSync` for OAuth only, and calls `delegate(model, context, { ...options, onPayload, ...(versionSync ? { fetch } : {}) })`.
- `src/billing-version-sync.ts` `createBillingVersionSync`: `syncFetch` reads only 400s through `readVersionRejection`, then `planRecovery(rejection, sentBody, sentVersion)` decides retry or hint, learning a named floor first.
  `rebuildBody` returns `undefined` when the body lacks the exact header shaping emitted, which is why a header-less body lands on the `set-override` hint today.
- `src/version-rejection.ts`: `RecoveryHintReason` union (`override`, `upgrade-pi`, `set-override`) and `describeRecoveryHint`, an exhaustive `switch`.
- `src/billing-header.ts`: `BILLING_HEADER_MARKER = "x-anthropic-billing-header:"`.

`AGENTS.md` constraints that apply: keep the override thin and gated on `sk-ant-oat`; preserve API-key behavior; diagnostics are ours to make actionable ("Thinness governs request shaping, not user-facing diagnostics").

## Design Overview

### Part 1 — opt OAuth requests out of continuations

The wrapper adds `disableContinuation: true` to the delegate options for OAuth requests only, after the `...options` spread so a caller's `false` cannot re-enable continuations:

```typescript
/**
 * pi-ai >=1.5.0 field; absent from the pinned 1.3.0 types (removed by #89).
 * Continuations omit `system`, so they cannot carry the billing header.
 */
export type MessageThreadOptOut = { disableContinuation?: boolean };

const MESSAGE_THREAD_OPT_OUT: MessageThreadOptOut = { disableContinuation: true };

return delegate(model as Model<"anthropic-messages">, context, {
  ...options,
  onPayload,
  ...(versionSync ? { fetch: versionSync.fetch } : {}),
  ...(isOAuthRequest ? MESSAGE_THREAD_OPT_OUT : {}),
});
```

`disableContinuation` was chosen over a `compat.supportsMessageThreads: false` model copy (PR [#87]'s mechanism) by the operator: it is a per-request option in the same spread as our `fetch`, and it leaves the `model` object every `onPayload` caller sees untouched.
Both were measured to work.

A spread of a typed constant is not subject to excess-property checking, so no cast is needed against the 1.3.0 `SimpleStreamOptions`; tests read the field through `SimpleStreamOptions & MessageThreadOptOut`.
Whether the type is exported or test-local is an implementation detail; exporting it from `src/oauth-transport.ts` keeps one definition for [#89] to delete.

Config-named providers (Issue #70) share the same wrapper, so they are opted out too — which matters once pi's `49fe0a237` default ships.

### Part 2 — name the cause when a rejected request carried no billing header

With Part 1, a header-less OAuth request is still reachable: shaping injects no header when the first user message has no text (`buildBillingHeaderValue` returns `undefined` for empty text, such as an image-only first message).
Anthropic then gates on pi's user-agent, exactly as on a continuation.

`RecoveryHintReason` gains a variant:

```typescript
| {
    /** The request carried no billing header, so Anthropic read Pi's user-agent. */
    kind: "no-billing-header";
    userAgentVersion: string | undefined;
  }
```

`describeRecoveryHint` renders it as:

```text
[pi-anthropic-auth] This request carried no billing header, so Anthropic checked Pi's own claude-cli version (2.1.280). Upgrade Pi.
```

With an unparseable user-agent the parenthetical is dropped: `... so Anthropic checked Pi's own claude-cli version. Upgrade Pi.`

The check lives in `syncFetch`, between `readVersionRejection` and the first `planRecovery` call, not inside `planRecovery` (Tidy-First assessor finding):

```typescript
const userAgent = readUserAgent(input, init); // hoisted; targetVersion reads it too
// ...
const rejection = await readVersionRejection(response);
if (!rejection) return response;
if (lacksBillingHeader(sentInit?.body)) {
  return hintedResponse(response, rejection, {
    kind: "no-billing-header",
    userAgentVersion: readClaudeCliVersion(userAgent),
  });
}
const recovery = planRecovery(rejection, sentInit?.body, sentVersion);
```

- `lacksBillingHeader(body)` is `typeof body === "string" && !body.includes(BILLING_HEADER_MARKER)`.
  A non-string body is "unknown" and keeps today's path; a user message quoting the marker is a false negative that keeps today's hint, which is acceptable.
- The retry's rejection never needs the check: the retry body comes from `rebuildBody`, which only succeeds when the body carries our header.
- It runs before the override check inside `planRecovery`, so an env override does not produce the misleading "sent verbatim" hint on a header-less request.
- It does **not** learn the named floor (decision, not accident): that floor rejected pi's user-agent, not our header, so teaching it to the shared floor would raise headers on later requests for a reason they never hit.
  `planRecovery`'s signature is unchanged.

### Edge cases

- An API-key request with a caller-supplied `disableContinuation` keeps it verbatim; with none, the key stays absent.
- pi's cache warmer already sets `disableContinuation: true`; our forced `true` agrees.
- A session that already holds thread state from before an upgrade: `disableContinuation` makes pi neither use nor record state, so the stale entry is simply never read.

## Module-Level Changes

| File | Change |
| --- | --- |
| `src/oauth-transport.ts` | Add `MessageThreadOptOut` type and `MESSAGE_THREAD_OPT_OUT` constant; spread it for OAuth requests; extend the JSDoc to say why (continuations omit `system`). |
| `test/oauth-transport.test.ts` | New `describe("message-thread opt-out")`. |
| `src/version-rejection.ts` | `RecoveryHintReason` gains `no-billing-header`; `describeRecoveryHint` gains its case. |
| `test/version-rejection.test.ts` | Wording tests for the new variant, with and without a version. |
| `src/billing-version-sync.ts` | Hoist `readUserAgent`; add `lacksBillingHeader` and the pre-`planRecovery` check; update the interface JSDoc's recovery description. |
| `test/billing-version-sync.test.ts` | New tests in the "hints on unrecovered…" describe, inline setup style (matching the file). |
| `README.md` | "A new model is rejected as `claude_code_version_too_old`": the hint list gains the header-less case. New Troubleshooting entry for requests failing after the first tool call on pi 1.5 ("upgrade pi-anthropic-auth"). |
| `docs/architecture.md` | "What the wrapper does": new paragraph on the message-thread opt-out; the recovery paragraph's "When recovery cannot run (…)" list gains "the request carried no billing header". Mermaid node `S` label becomes "Inject onPayload shaping, fetch wrapper, thread opt-out". |
| `AGENTS.md` | Current Status: new item for the opt-out. Line 62 ("injects two steps") and line 99 (Extension Surface) mention the opt-out. Line 582 hint list gains the header-less case. Coverage areas items 1 and 4 mention the new tests. Line 603 ("only injects an `onPayload` shaping step") gains the opt-out. |
| `.pi/skills/anthropic/SKILL.md` | Confirmed local fixes: a bullet on the opt-out with the measurements above, including that Claude Code does not use threads. The "Unrecovered rejections (…)" list gains "no billing header". |
| `.pi/skills/upstream-watch/SKILL.md` | Watchlist row: "`disableContinuation` keeps OAuth requests out of message threads, whose continuations omit `system`" → `packages/ai/src/api/anthropic-messages.ts` (`prepareThreadRequest`, `getAnthropicCompat`) → Coverage-gap (continuations lose the billing header). |

Predicted unchanged:

- `test/index-registration.test.ts` — it never reads delegate options, and `createAnthropicOAuthStreamSimple`'s signature does not change (assessor-confirmed).
- `src/request-shaping.ts`, `src/billing-header.ts` — read only (`BILLING_HEADER_MARKER` is already exported).
- `src/constants.ts` — the anchor drift is [#89].

## Test Impact Analysis

- New tests pin the opt-out at the delegate boundary (the mocked-delegate style `test/oauth-transport.test.ts` already uses) and the new hint at the `fetch` boundary.
- No existing test becomes redundant.
- Existing rejection tests in `test/billing-version-sync.test.ts` all send header-bearing bodies (verified: every rejection case uses `shapedPayload(...)` or the default `requestInit` body), so they are invariant pins for the unchanged `planRecovery` paths, including "points at the override when the body cannot be rebuilt" (header present, `recordRequest` not called).
- The real-transport assertion (second OAuth turn still carries `system`) cannot be written on pi-ai 1.3.0 and is deferred to [#89]; the live check in step 4 stands in for it.

## Invariants at risk

| Invariant (origin) | Constituency | Pinned by |
| --- | --- | --- |
| API-key requests pass through untouched (OAuth gate) | API-key users, including their own thread use | Existing "leaves fetch untouched for API-key requests"; new API-key opt-out tests. |
| Success responses are never read (Issue #75) | Every OAuth request's streaming path | Existing success-path tests in `test/billing-version-sync.test.ts`; the new check runs only after `readVersionRejection` returns a rejection. |
| An env override is never raised or taught (Issue #74/#75) | Users pinning a version | Existing override tests (header-bearing bodies, unchanged). |
| The learned floor comes only from rejections of our header (Issue #75, made explicit here) | Later requests in the same process | New test: after a header-less rejection, `floor.applyTo("1.0.0") === "1.0.0"` and no retry is sent. |
| `onResponse` and the caller's `fetch` reach the delegate (pi 0.84.0 contract) | Callers composing hooks | Existing tests, unchanged. |

Quantitative: the opt-out raises OAuth request size on pi >=1.5 from the continuation size (about 540 B measured) to the full conversation (about 65 KB measured on the first tool turn in this repo); token counts are unchanged per Anthropic and pi.
Time to first token is unmeasured and is part of [#90].

## TDD Order

1. **`fix:` opt OAuth requests out of message threads so every request carries the billing header** — `test/oauth-transport.test.ts`, new `describe("message-thread opt-out")`:
   - OAuth request → `options.disableContinuation === true` (red).
   - OAuth request whose caller passed `disableContinuation: false` → `true` (red).
   - API-key request with no caller value → key absent (`"disableContinuation" in options === false`) (invariant pin; confirm by mutation).
   - API-key request with caller `true` → `true` (invariant pin).
   - Killing mutations: replace `isOAuthRequest ? MESSAGE_THREAD_OPT_OUT : {}` with `{}` (kills both OAuth tests); make it unconditional `MESSAGE_THREAD_OPT_OUT` (kills the API-key absent test); move the spread before `...options` (kills the caller-`false` test).
   - Commit trailers (mechanism from PR [#85]; root-cause trace through `prepareThreadRequest` from this issue):

     ```text
     Co-authored-by: Gabriele Berti <108946753+G4bar@users.noreply.github.com>
     Co-authored-by: Andreas Spannagel <31705035+pandysp@users.noreply.github.com>
     ```

2. **`refactor:` add a recovery hint for rejections of header-less requests** — `src/version-rejection.ts` and `test/version-rejection.test.ts`:
   - `describeRecoveryHint({ kind: "no-billing-header", userAgentVersion: "2.1.280" })` equals the exact string in Design Overview (red).
   - With `userAgentVersion: undefined`, the parenthetical is absent (red).
   - Killing mutation: drop the `(${userAgentVersion})` interpolation (kills the first test).
   - `refactor:` because no producer emits the variant until step 3.
3. **`fix:` point header-less version rejections at Pi's own claude-cli version instead of the env override** — `src/billing-version-sync.ts`, `test/billing-version-sync.test.ts` (inline setup, no new helper):
   - Header-less body (`JSON.stringify` of a payload with no billing block), user-agent `claude-cli/2.1.280`, rejection naming `REQUIRED` → `assertHinted` with `{ kind: "no-billing-header", userAgentVersion: "2.1.280" }`, and `base.calls.length === 1` (red: today it is `set-override`).
   - Same with `withVersionOverride("2.1.260")` set → still `no-billing-header`, not `override` (red).
   - Same with no user-agent → `userAgentVersion: undefined` (red).
   - Same, sharing a `createLearnedClaudeCodeFloor()` → `floor.applyTo("1.0.0") === "1.0.0"` afterwards (red only under the mutation below; label it an invariant pin and prove it by mutation).
   - Killing mutations: delete the `lacksBillingHeader` check (kills the first three); move it after `planRecovery` and route `planRecovery`'s hint through it (kills the override test and the floor test); invert `includes` (turns every existing header-bearing rejection test red).
   - Commit trailer: `Co-authored-by: Andreas Spannagel <31705035+pandysp@users.noreply.github.com>` (hint fix proposed in this issue).
4. **Live verification (no commit)** — install pi 1.5.1 in `/tmp` (`npm i @earendil-works/pi-coding-agent@1.5.1`) and run from the repo root:

   ```bash
   /tmp/pi151/node_modules/.bin/pi --model anthropic/claude-fable-5-2 --thinking high -ne --no-session \
     --tools bash,read -e "$PWD/src/index.ts" \
     -p "Run the shell command 'echo hi' with your bash tool, then reply with just: done"
   ```

   Expected: `done`.
   Pre-fix this printed the 400 with the `set-override` hint (measured during planning).
   Also run the same prompt on pi 1.4.0 (the operator's installed `pi`) with `claude-haiku-4-5` to confirm the field is a no-op there.
5. **`docs:` document the message-thread opt-out and the header-less hint** — `README.md`, `docs/architecture.md` (prose and Mermaid node), `AGENTS.md`, `.pi/skills/anthropic/SKILL.md`, `.pi/skills/upstream-watch/SKILL.md`, per Module-Level Changes.
   Run `pnpm run lint` and `pnpm exec rumdl check .pi`.
   Commit trailers (the docs record all three reporters' measurements and diagnoses):

   ```text
   Co-authored-by: Gabriele Berti <108946753+G4bar@users.noreply.github.com>
   Co-authored-by: Andreas Spannagel <31705035+pandysp@users.noreply.github.com>
   Co-authored-by: Den Kong <218532172+denjzs@users.noreply.github.com>
   ```

### Ship-time credit

The operator chose to thank each contributor by name in the close comments:

1. Close this issue thanking @pandysp (diagnosis, offline repro, hint fix), @denjzs (independent WSL repro and live validation of the opt-out), and @kcocoa (confirming the hint misled them), linking the release, [#89], and [#90].
2. Close PR [#85] thanking @G4bar: the `disableContinuation` mechanism was adopted and credited as co-author.
3. Close PR [#87] thanking @denjzs: the `compat.supportsMessageThreads` alternative was measured to work, and `disableContinuation` was chosen because it leaves the `model` object `onPayload` callers see untouched; their repro is credited as co-author on the docs commit.

## Risks and Mitigations

- **pi renames or drops `disableContinuation`.**
  The opt-out silently stops and continuations lose the header again (coverage-gap).
  Mitigation: the upstream-watch row added in step 5, and the real-transport drift alarm deferred to [#89].
- **The local type outlives the bump.**
  [#89]'s body names it for removal.
- **Larger uploads on long OAuth sessions.**
  The pi <=1.4 behavior, and what Claude Code does; token cost is unchanged.
  [#90] tracks whether threads can come back.
- **The threads beta header without a `thread` field.**
  Measured 200 on `claude-fable-5-2`; pi documents it as a normal request.
- **A header-less body that quotes the marker in user text** keeps today's hint; benign.

## Open Questions

- Whether header-less continuations are rejected as third-party usage on some plans — unmeasured here, tracked in [#90].

[#85]: https://github.com/gotgenes/pi-anthropic-auth/pull/85
[#87]: https://github.com/gotgenes/pi-anthropic-auth/pull/87
[#89]: https://github.com/gotgenes/pi-anthropic-auth/issues/89
[#90]: https://github.com/gotgenes/pi-anthropic-auth/issues/90
