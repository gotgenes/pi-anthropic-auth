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

[#9]: https://github.com/gotgenes/pi-anthropic-auth/issues/9
[#10]: https://github.com/gotgenes/pi-anthropic-auth/issues/10
[#52]: https://github.com/gotgenes/pi-anthropic-auth/issues/52
