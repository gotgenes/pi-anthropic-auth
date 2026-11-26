---
issue: 84
issue_title: "Auto-resume option possible?"
---

# Retro: #84 — Auto-resume option possible?

## Stage: Planning (2026-11-26T19:08:16Z)

### Session summary

Third-party question about resuming a Pi session automatically when the Claude subscription usage limit resets.
Traced Pi's behavior at the limit (three agent-level retries at 2 s, 4 s, and 8 s, then the run stops) and found an existing third-party extension, `@fahrizkyputra/pi-auto-resume`, that does what the reporter asks.
The operator chose to decline; the plan is a decline record whose only action is closing the issue as `not_planned` with a pointer comment.

### Observations

- Options offered at the gate: decline with a README entry (recommended), decline with a comment only, decline plus a "resets at" hint appended to the 429 error, or build auto-resume here.
  The operator picked the README entry, then withdrew it after the first plan draft ("users can find this for themselves"), so the plan was rewritten as comment-only and the first draft deleted before commit.
- Lesson: for a third-party question with no defect, "comment only, no repo change" can be the operator's default; offer it as the recommended option rather than assuming a docs deliverable.
- The real subscription-limit 429 shape (`retry-after`, `anthropic-ratelimit-unified-reset`) is unmeasured; the evidence is Claude Code 2.1.326's rate-limit simulator and a LiteLLM report.
  Any later reset-time hint should start with a live capture.
- `pi-auto-resume` should coexist with this extension, because `src/oauth-transport.ts` spreads `options`, so `onResponse` and `after_provider_response` still fire; this is not verified live.
- Tidy-First assessment skipped: no `src/` or `test/` change.
