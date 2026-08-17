---
issue: 47
issue_title: "`# Project Context` fallback anchor never matches pi's prompt, so a terminator drift drops the whole system prompt"
---

# Retro: #47 — `# Project Context` fallback anchor never matches pi's prompt

## Stage: Planning (2026-08-10T10:40:00Z)

### Session summary

Planned the fix for the dead `# Project Context` fallback anchor in `src/system-prompt-shaping.ts`, filed by a third party (`pandysp`).
Confirmed the report against both the installed `@earendil-works/pi-coding-agent@0.84.0` `dist` and the upstream clone at `v0.84.2-28-g6db110e6f`, then found the exact commit that invalidated the anchor.
Wrote `docs/plans/0047-project-context-fallback-anchor.md` with six TDD cycles and filed one follow-up issue.

### Observations

- The issue proposed anchoring on `<project_context>`.
  A disposable spike measured all four candidates against the issue's own fixture: current 162/753 chars preserved, `<project_context>` anchor 464, whole-prompt paragraph-anchor sanitize 580, unshaped 753.
  The operator chose the sanitize approach, which retires the second anchor instead of replacing it — the `<project_context>` anchor would have reintroduced the [#9] loss of `--append-system-prompt` content.
- Sharper framing than the issue supplied: the anchor was correct when written and pi killed it in `e2fd651eb` (2026-05-16, first released v0.75.0), which swapped the `# Project Context` heading for XML boundaries.
  Since this package's peer floor is `>=0.80.8`, the anchor has been dead for every supported host.
  Conversely `PI_DEFAULT_PROMPT_TERMINATOR` entered the preamble in `d2de6d083` (v0.50.0, 2026-01-26) and has never changed — the stable anchor was the primary one, the volatile one was the fallback.
- The operator declined surfacing drift in `/anthropic-auth:status`.
  Rationale recorded in the plan: `ExtensionDiagnostics` is a load-time value object and drift is a request-time observation, so the field would have put request state into a load-time interface.
- The chosen fallback deliberately relaxes the [#10] invariant (sanitization confined to the preamble span) on the fallback path only.
  The plan adds a dedicated test pinning that trade-off so it reads as a decision rather than an accident, and keeps the primary-path guard test untouched.
- Reading upstream history surfaced two unrelated fixture rots: `PI_UPSTREAM_SYSTEM_PROMPT` claims verbatim parity but is pinned at 0.79.1, still carries the `Current date:` line pi removed in v0.80.7 (`f4e9ca746`), and lacks the `environment-variables.md` bullet added in v0.82.0 (`bb3d7d399`).
  Folded in as its own commit since it is the same class of rot the issue is about.
- Also found that `AGENTS.md` Testing Guidance item 4 recommends `/# Project Context/` as a model assertion marker — a marker pi has not emitted since v0.75.0.
- Filed [#52] to verify `PI_DEFAULT_PROMPT_TERMINATOR` against the installed pi at build time, since nothing currently catches this class of drift before it reaches a user's session.
- Access to the upstream clone at `../pi` was decisive.
  The installed `dist` confirmed *that* the anchor was wrong; only the git history explained *when* and *why*, which is what turned the plan's framing from "the anchor was never checked" into "the anchor rotted at a known release."

### Peer-floor review (same session)

The operator asked whether the pi peer floor should rise, so the session detoured to answer it with evidence.

- Decision: leave `>=0.80.8` alone, with no floor change and no CI change.
  The floor is functionally correct at that version — `unregisterProvider` is in `extensions/types.ts` at v0.80.8, and pi-ai's `anthropicMessagesApi` reached the compat entrypoint in v0.80.0 (`ba93da9a9`).
  Nothing in `0.80.8..0.84.2` breaks the extension; the changes in that range are llama.cpp, catalog-refresh, and auth-preflight work.
- Rejected raising to `>=0.84.0` to match the only tested version.
  It is breaking with no functional driver, and `AGENTS.md` records the concrete cost: `pi update` will not carry a stale install across a major, so users must run `pi install npm:...@latest` — the #43 experience.
  The #40 precedent raised the floor because a version generation was actively broken; no comparable driver exists now.
- Noted but not acted on: CI has a single `check` job on a frozen lockfile pinned to 0.84.0, so nothing ever exercises the floor version.
  The floor is an assertion no build verifies.
- Filed [#53].
  pi v0.81.0 (`019e4ad68`) added `ModelRegistry.getProvider(provider): Provider | undefined`, which directly contradicts the blocker `docs/architecture.md` records for #46 — that `getProviders()` returns id strings rather than `Provider` objects, so `cloudflare-ai-gateway`'s provider-layer wrapping could not be reconstructed.
  That is the one plausible functional driver for a future floor raise, so the issue frames it as an investigation with a stated kill criterion rather than a floor bump.
- Filed [#54].
  `pickAnthropicStreamSimple`'s `streamSimpleAnthropic` branch documents itself as support for "older hosts that predate the factory on the compat entrypoint," but the factory predates the current floor, so no such supported host exists.
  Dead at any floor `>=0.80.0`, independent of this decision.

## Stage: Implementation — TDD (2026-08-17T20:05:00Z)

### Session summary

Implemented the anchor-sanitize fallback across five commits, completing all six planned TDD steps (two were folded into one commit).
The degraded path now preserves everything pi appends after the preamble instead of discarding it, and both shaping branches route through one extracted `shapePreambleSpan` helper.
Tests went from 54 to 56 (the shaping suite from 15 to 17 cases); `check`, `lint`, and `fallow:dead-code` are green.

### Observations

- Deviation: plan steps 1 and 2 were folded into commit `819144b`.
  Step 1 prescribed a test-only commit that is red by construction — the test it adds cannot pass until the step 2 fix lands — so committing it alone would have poisoned `git bisect`.
  The template's own cycle is red→green→commit per step, which the plan's split contradicted.
  Noted in the commit body; the reviewer accepted it and confirmed the `fix:` type is right since the fix is the dominant semantic.
- The Tidy-First assessor returned **no preparatory commits**, and its reasoning was worth reading rather than skimming: it explicitly considered pre-extracting `shapePreambleSpan` and rejected it, because step 2 only touches the fallback branch, so pre-extraction would relocate the refactor without shrinking anything — and would force an awkward choice about whether to use the old or new debug field names.
  Fix-then-extract was the tighter order.
- The step 3 test passed the moment it was written.
  Per the `testing` skill that is either an invariant pin or a broken probe; it is the former.
  Confirmed it is not vacuous by contrast rather than by assertion: the primary-path test `does not sanitize extension content outside the Pi preamble span` asserts the *same* probe string survives, so both directions are pinned by live tests.
- The fixture refresh was verified by diffing the fixture's documentation block against `../pi`'s source at `3dd4623ee`, not by eyeballing.
  It matches verbatim, 8/8 lines — the only initial diff was the closing backtick of the upstream template literal.
- Pre-completion reviewer: **PASS**.
- Reviewer warnings: one WARN on naming — `shapePreambleSpan` says "preamble" but in the fallback path `spanEnd` is `systemPrompt.length`, so the span is the whole prompt.
  The reviewer called it non-blocking (the JSDoc `@param mode` and both call sites make the boundary concrete) and it was left as-is rather than churned after a PASS.
  Worth revisiting if the fallback path ever grows.

[#9]: https://github.com/gotgenes/pi-anthropic-auth/issues/9
[#10]: https://github.com/gotgenes/pi-anthropic-auth/issues/10
[#52]: https://github.com/gotgenes/pi-anthropic-auth/issues/52
[#53]: https://github.com/gotgenes/pi-anthropic-auth/issues/53
[#54]: https://github.com/gotgenes/pi-anthropic-auth/issues/54
