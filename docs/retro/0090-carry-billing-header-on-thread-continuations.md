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
