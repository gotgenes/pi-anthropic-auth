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

## Stage: Final Retrospective (2026-11-26T20:32:28Z)

### Session summary

One session covered planning, the decline decision, and closing Issue #84 as `not_planned` with a comment pointing to `@fahrizkyputra/pi-auto-resume`.
The committed plan (`7859cfd`) is a decline record with no repository change beyond itself and this retro (`e5d7aa1`), so nothing was released.

### Observations

#### What went well

- Searching npm for prior art (`npm search "keywords:pi-package rate limit resume"`) found `pi-auto-resume`, and reading its tarball (`npm pack`) confirmed it uses `after_provider_response` and `agent_settled`.
  That reframed the issue from "should we build this" to "point at the existing extension", and it became the core of the close comment.
- Reading the Claude Code binary's strings (`strings -n 20` into a file, then `perl` context extraction) showed both Claude Code's own auto-resume and its rate-limit simulator's header contract, without a live capture.

#### What caused friction (agent side)

- `instruction-violation` (self-identified in this retro) — the `ask_user` gate offered "Decline + README entry" as recommended without showing the README text it would produce.
  `AGENTS.md` ("Context before, not inside") asks for the rendered output when options differ in what they produce.
  The operator picked it, saw the drafted entry in the plan, and withdrew it in favor of a comment only.
  Impact: one plan draft (`0084-document-usage-limit-auto-resume.md`) written, then deleted before commit; about three tool calls of rework, no rework after a commit.
- `other` — a `grep -oE '.{300}…'` over the Claude Code binary failed on grep's 255 repetition limit; switching to `perl` fixed it on the next call.
  Impact: one wasted call.

#### What caused friction (user side)

- None of note.
  The withdrawal came from seeing the concrete draft, which is the signal the gate should have supplied up front.

### Diagnostic details

- **Model-performance correlation** — every turn ran on `anthropic/claude-opus-5-5`; no subagents were dispatched, which suited a short, judgment-heavy scope decision.
- **Feedback-loop gap analysis** — `rumdl check` ran on the plan and on the retro before each commit; there was no code, so `check`/`test`/`lint` did not apply.

### Changes made

1. `docs/retro/0084-decline-usage-limit-auto-resume.md`: appended this Final Retrospective entry; no prompt, skill, or `AGENTS.md` changes (the operator chose notes only).
