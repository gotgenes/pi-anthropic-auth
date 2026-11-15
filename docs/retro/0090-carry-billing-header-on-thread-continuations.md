---
issue: 90
issue_title: "Explore supporting Anthropic message threads for OAuth requests"
---

# Retro: #90 — Explore supporting Anthropic message threads for OAuth requests

## Stage: Planning (2026-11-15T19:28:09Z)

### Session summary

I planned the deliverable for an exploration issue.
OAuth requests now use pi's message threads, and the `fetch` wrapper splices `system: [billing block]` into each header-less `thread: continue` body, which is the shape Claude Code itself sends.
The `disableContinuation` opt-out from #86 goes away.
The operator chose "carry the header, threads on" and "billing block only" at the single gate.

### Observations

- The deciding finding came from the claude-code tracker, not from a capture.
  anthropics/claude-code#98464 shows that Claude Code drops threads for any custom `ANTHROPIC_BASE_URL`, so the #86 local-server capture behind "Claude Code does not use threads" could never have seen them.
  Running `strings` on the installed 2.1.311 binary confirmed the beta, and showed its continuation builder keeping the `x-anthropic-billing-header:` block (`Adr`/`UG`).
- I tested the premise before the gate, using a scratch `src/` copy that rewrote continuation bodies at the `fetch` boundary on pi 1.5.2 (n=1 per variant, Max 20x account):
  - A billing-only `system` was accepted.
  - A full identical `system` was accepted.
  - A changed `system` got `thread_fingerprint_mismatch`.
  - A billing block at another version was accepted.
  - On `claude-fable-5-2`, a well-formed header gated the version on a continuation; a malformed suffix was ignored in favor of the user-agent.
- My first "billing-low" variant reported acceptance only because a hand-edited `cc_version` dropped the version-dependent suffix.
  Rebuilding the header with `buildBillingHeaderValue` reversed the result, so any header variant in a probe must be built by the recipe.
- Time to response headers showed no difference at 66 KB over 6 turns: 627 ms vs 603 ms median, n=15 each.
  Threads save upload (657 B vs 66 KB per turn), not latency, at this size.
- pi's existing `models.json` provider `compat.supportsMessageThreads: false` is the escape hatch.
  It rests on reading the code (`provider-composer.ts` line 329); TDD step 5 verifies it live.
- The Tidy-First assessor recommended two preparatory commits:
  - Move the four header-less hint tests onto a textless-payload fixture, because a continuation fixture would otherwise get a header and break them for the wrong reason.
  - Extract `prepareOutgoing` from `syncFetch` (cyclomatic 13, CRAP 49.5, measured with fallow).
- Credit: a `Co-authored-by` trailer for @kcocoa on the `feat:` commit, for the Pro measurement and the case for keeping threads on.
  Ask @G4bar and @denjzs at ship time to confirm on their Pro accounts.
- The unmeasured residual is Pro-plan attribution of a continuation that carries the header; it is recorded as an open question with no issue filed.

#### Deferred tidyings

- `src/billing-version-sync.ts`: the version-rejection recovery (`planRecovery`, `hintedResponse`, `readVersionRejection`) could be its own module, since the file is 284 lines; this was declined as unrelated to #90.

## Stage: Implementation — TDD (2026-11-15T19:58:04Z)

### Session summary

I completed all six plan steps: the textless-payload fixture, the `prepareOutgoing` extraction, the `withBillingBlockOnContinuation` helper, the feature (splice the billing block into continuations and remove `disableContinuation`), the live check, and the docs.
Tests went from 268 to 282.
`check`, `lint`, and `fallow:dead-code` stayed green, and `syncFetch` dropped off fallow's flagged-function list.

### Observations

- Step 3 deviated from the plan.
  The plan's `create` fixture carried `system` and had no `"continue"` token, so the prefilter and the system check rejected it before the thread type was ever read, and the `"continue"`→`"create"` mutation left it green.
  I reworked the `create` and no-thread fixtures to carry no `system` and a `"continue"` text token, so the thread check alone decides them; both then died to their own mutations.
- Every other planned mutation killed exactly the predicted tests.
  Removing `attachToContinuation`'s effect also reddened "leaves a non-string body untouched", because the mutation flipped the string guard; that red was not a discrimination signal.
- Process slip in step 1: the green-copy `cp` and the mutating `Edit` again ran in the same tool batch, so the saved copy held the mutation (the same slip as #86).
  Step 1 touched no `src/`, so `git checkout` restored the file; from step 3 on, each `cp` ran alone in its own turn.
- Step 5 live check on pi 1.5.2 used a scratch `src/` copy (`/tmp/live90`) that logged each body after dispatch:
  - `claude-haiku-5-5`: `create` (3 system blocks, 65.6 KB) returned 200, then `continue` (`system=1`, 658 B) returned 200.
    The block stayed at our 2.1.323 pin, which is above pi's 2.1.322.
  - `claude-fable-5-2`, with the pin forced to 2.1.280 and the pi-version read disabled: the `create` got 400, the retry at 2.1.290 returned 200, and then the `continue` went out at the learned 2.1.290 and returned 200.
  - Escape hatch: the operator approved a temporary `~/.pi/agent/models.json` with `providers.anthropic.compat.supportsMessageThreads: false`.
    Both turns went out as `thread=none system=3` and returned 200, so the README's claim is now verified live; the file was removed afterwards.
- The open question is narrower than the plan states it: the reports on #85, #86, and #90 already show that plan type alone does not decide header-less attribution (one Pro accepted, one Pro rejected).
  What remains is whether an account that rejects header-less continuations (@G4bar's, @denjzs's) accepts them once the billing header is attached.
  Ask them at ship time.
- Pre-completion reviewer: WARN.
  Reviewer warnings: the live check was not yet recorded when it reviewed (it is recorded above); `isRecord` is duplicated in `src/thread-continuation.ts` and `src/billing-version-sync.ts` (minor, fallow does not flag it); and the design's measurements are n=1 per variant on one Max 20x account.

#### Deferred tidyings

- `src/thread-continuation.ts` and `src/billing-version-sync.ts` each define a private `isRecord`; a shared guard module could hold one copy.
