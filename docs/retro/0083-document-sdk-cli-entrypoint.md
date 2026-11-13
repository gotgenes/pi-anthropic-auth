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

## Stage: Final Retrospective (2026-11-01T20:06:14Z)

### Session summary

One session ran plan, re-plan, build, ship, and retro for a third-party request to report `cc_entrypoint=cli`.
The request was declined and shipped as docs in v3.4.4 (`fcc2003`), with keeping `sdk-cli` framed as the current choice pending Anthropic's answer on anthropics/claude-code#97074; #83 closed `not_planned`.
The live work along the way (a Claude Code capture, a 2x2 acceptance grid, a rate-limit header probe) produced findings that outlast the issue.

### Observations

#### What went well

- A local `ANTHROPIC_BASE_URL` capture server (log the billing header, answer 500) showed what real Claude Code sends per mode with nothing reaching Anthropic; interactive mode ran under `script -q /dev/null` for a TTY, and the fullscreen TUI did not interfere.
- The 2x2 acceptance grid (billing header x sanitizer) with working-tree spikes, each reverted by `git checkout`, answered "is the plugin still necessary" in about 12 requests: yes, since neither half alone is rejected for this repo's prompt but bare Pi is.
- A one-request spike that logged response headers found the meter Pi can see (`anthropic-ratelimit-unified-7d-utilization`, no 5-hour header on the operator's Ultra plan), which turned a proposed $800+ A/B into a skip.
- The pre-completion reviewer caught the one unattributed #97074 claim the README and skill had attributed correctly.

#### What caused friction (agent side)

- `missing-context` (user-caught) — Planning framed the 5-hour gap as Anthropic deliberately metering programmatic use and called `sdk-cli` the accurate label for Pi, without searching `anthropics/claude-code`, where #97074 already held six controlled A/Bs refuting both.
  `plan-issue` step 3's upstream-tracker rule applied, since the diagnosis blamed Anthropic's service, but its only named example is `earendil-works/pi`.
  Impact: plan rewritten (`5d62ecc`), a revision retro stage, and about six operator turns.
- `other` (unverified citation, user-caught) — Cited opencode PR #237 as an entrypoint precedent from a search hit; it matched "entrypoint" in the package sense.
  Impact: one correction round and a credibility cost on the surrounding evidence.
- `other` (context not self-contained) — After the #237 correction, the follow-up message stated only the delta and "My position is unchanged" before the `ask_user`; the operator replied "What was your answer? I can't see it." and then asked for the evidence "in a message to me, not in a thinking usage or in a `ask_user` invocation".
  Impact: three extra `ask_user` rounds before the operator had what they needed to decide.
- `premature-convergence` — The shipped prose used absolute wording ("Never report", "misrepresents the caller") for a choice that rested on an open upstream question.
  Impact: a reviewer FAIL (`7fb93d9`), an operator "too overblown" redirect, a softening commit across five files (`58abc25`), and two more review dispatches.
- `rabbit-hole` (minor, self-identified) — A `strings` scan of the 268 MB `claude` binary timed out at 120 s; the live capture answered the same question in one call.
- `other` (self-identified) — The first no-header control passed on Haiku, so the earlier `pi` acceptance passes meant nothing; caught before reporting them as evidence.

#### What caused friction (user side)

- The operator surfaced #97074 and the Ultra plan change ("the 5-hour limit was removed") mid-session; both reshaped the decision.
  Sharing the plan change before the A/B design would have skipped one design round, though the agent should have found #97074 itself.
- The "Are you using mitm" interrupt and the "Let's test it" redirect were strategic and moved the work to measurement.

### Diagnostic details

- **Model-performance correlation** — Planning and build ran on `claude-opus-5-5` (119 turns), ship on `claude-sonnet-5-5` (17 turns, mechanical), retro on `claude-opus-5-5`.
  All three `pre-completion-reviewer` dispatches ran on `claude-sonnet-5-5` (one stopped by the operator); review quality was adequate and caught the attribution defect.
- **Escalation-delay tracking** — No sequence exceeded five calls on one error; the binary scan was abandoned after one timeout.
- **Unused-tool detection** — A `gh issue list --repo anthropics/claude-code --search "sdk-cli"` during planning would have found #97074 before the first gate.
- **Feedback-loop gap analysis** — Checks ran after each build step and before ship; no gap.
- **Non-ASCII emission** — Two slips this session: the build-stage heading came out as a tab plus `en`, and the first draft of this entry carried ten literal `\u2014` escapes.
  Both were fixed with a scripted substitution before commit; the existing scans and `rumdl` (which flags hard tabs) cover them, so no new rule.

### Changes made

1. `.pi/prompts/plan-issue.md` — step 3's upstream-tracker rule names `anthropics/claude-code` for Anthropic server behavior (metering, rejections, version gates).
2. `AGENTS.md` — "Context before, not inside" adds: after a correction or a bounced question, restate the whole decision context, not the delta.
3. `.pi/skills/anthropic/SKILL.md` — new "Measured 2026-11-01 (Issue #83)" subsection: the `ANTHROPIC_BASE_URL` capture technique, the 2x2 acceptance-grid result, and the rate-limit headers visible to Pi.
