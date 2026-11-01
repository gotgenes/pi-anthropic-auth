---
issue: 83
issue_title: "`sdk-cli` entrypoint causes ~3–4× higher Claude subscription usage than `cli`"
---

# Retro: #83 — `sdk-cli` entrypoint causes ~3–4× higher Claude subscription usage than `cli`

## Stage: Planning (2026-10-31T21:00:40Z)

### Session summary

Third-party issue asking to switch `CLAUDE_CODE_ENTRYPOINT` from `sdk-cli` to `cli` to cut metered subscription usage.
The proposal was declined, and the operator chose a docs-only plan that records why `sdk-cli` is deliberate, answers the reporter, and closes the issue as `not_planned` at ship time.
Plan committed as `docs/plans/0083-document-sdk-cli-entrypoint.md`; execute with `/build-plan`.

### Observations

- Declined direction: reporting `cli`, by default or behind a config/env knob, would have Anthropic meter a third-party harness as its interactive first-party app; the reporter's own third question names this as misrepresentation.
- Measured on Claude Code 2.1.309 with a local `ANTHROPIC_BASE_URL` capture server (nothing reached Anthropic): `claude -p` sends `cc_entrypoint=sdk-cli`, interactive `claude` sends `cc_entrypoint=cli`.
  Interactive mode ran under `script -q /dev/null` for a TTY; the fullscreen TUI did not block the capture, and no `~/.claude/settings.json` change was needed.
- The operator chose the base-URL server over `mitmdump`: offline, no quota, no CA trust; the fallback (if the header went missing under a custom base URL) was not needed.
- Spike: flipping the constant to `"cli"` turns 13 tests red (`test/billing-version-sync.test.ts` 10, `test/request-shaping.test.ts` 3) through the independent fixture literal, so the plan adds no test.
- `opencode-anthropic-auth` (pulled to `93cdd23`, `v2/main` `27e883a`) had nothing worth porting: version 2.1.284 (no rejection quoted; ours is 2.1.280 and recovers), fast-mode 429 diagnostics (Pi has no fast mode), and proxy/SSE/tool-alias fixes that belong to opencode's own transport.
- Friction: an early evidence message cited opencode PR #237 as an entrypoint decision; it only matched "entrypoint" in the package sense, and the operator caught it.
  Read a search hit's diff before citing it as precedent.
- Friction: a `strings` scan of the 268 MB `claude` binary timed out at 120 s; the live capture was the faster instrument.
- `AGENTS.md` left unchanged by its admission test; the rule goes in the `anthropic` skill's "Avoid by default".
- Tidy-First assessor not dispatched: the only `src/`/`test/` edits are comments.

## Stage: Planning — revision (2026-11-01T05:06:04Z)

### Session summary

The operator surfaced anthropics/claude-code#97074, which refuted two premises of the first plan, so the plan was rewritten (`5d62ecc`).
The decision is unchanged in effect (keep `sdk-cli`, docs only) but now cites #97074 as an open Anthropic-side question and defers a truthful Pi label until Anthropic answers.

### Observations

- Refuted premises: the first plan said the gap reflected Anthropic deliberately metering programmatic use, and that `sdk-cli` was the accurate label for Pi.
  #97074 shows the weighting attaches to the `sdk-*` labels (headless `claude-vscode` and arbitrary custom labels meter at the normal rate), and `sdk-cli` is Claude Code's print-mode label, borrowed.
  Lesson: search the upstream product's tracker (`anthropics/claude-code`) for the mechanism before framing a metering or policy claim; the first plan searched only `earendil-works/pi` and opencode.
- Live acceptance grid (Pi 1.4.0, one request per cell, this repo's prompt): header-only 200, sanitizer-only 200, neither 400 on Haiku 4.5 and Sonnet 5.5 (bare Pi 400 on Opus 5.5 too).
  The extension is still necessary; acceptance can no longer distinguish `cc_entrypoint` labels (`pi` returned 200 3/3).
  Issue #70's "sanitized, no header, 400" row was a different prompt and model, so not acted on.
- The first no-header control was non-discriminating (Haiku passed without a header); a passing positive check needs a negative control before it means anything.
- Metering A/B skipped by the operator: the account is now Ultra, responses carry only `anthropic-ratelimit-unified-7d-*` headers (no 5-hour meter, measured twice), and #97074 reports the weekly meter unweighted; resolving 2x at 1% weekly steps was estimated at $800+ API-equivalent.
  `/api/oauth/profile` still reported `claude_max` / `default_claude_max_20x`, so the profile endpoint may lag a plan rename.
- T3 Code is not a precedent: it spawns the real `claude` binary with `CLAUDE_CODE_ENTRYPOINT=t3-code`, the path Anthropic's terms allow; Pi calls `/v1/messages` directly.
- Revisit trigger (not filed as an issue): Anthropic's answer on #97074.

## Stage: Implementation — Build (2026-11-01T17:00:53Z)

### Session summary

Both plan steps landed: comments in `src/billing-header.ts` and `test/billing-header-fixtures.ts`, the `docs/architecture.md` sentence, two `anthropic` skill bullets (`3c21a83`), and the README troubleshooting entry (`02828fd`).
Two follow-up commits fixed a reviewer finding (`7fb93d9`) and softened all shipped wording at the operator's direction (`58abc25`), including the plan's issue-reply draft.

### Observations

- Pre-completion round 1: FAIL. The source comment stated the #97074 `sdk-*` weighting as Anthropic's fact; reworded to attribute it as a user report.
- Operator direction after the fix: the comment was "too overblown". Dropped every "never report" / "misrepresents" phrasing across source, README, architecture, and skill; the skill's "Avoid by default" bullet became "changing `cc_entrypoint` without first reading Issue #83".
  The issue reply now frames keeping `sdk-cli` as "the plan for now, subject to change as Anthropic updates its policies".
  Lesson: match a decision's prose confidence to its evidence; a choice deferred on an open upstream question reads as current, not absolute.
- Pre-completion round 2 (delta `7fb93d9`, `58abc25`): PASS.
- No deviations in scope; `AGENTS.md` unchanged as predicted; `CLAUDE_CODE_ENTRYPOINT` still `"sdk-cli"`, 236 tests green.
