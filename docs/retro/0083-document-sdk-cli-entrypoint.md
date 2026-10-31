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
