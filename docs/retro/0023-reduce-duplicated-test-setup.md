---
issue: 23
issue_title: "Reduce duplicated test setup flagged by fallow"
---

# Retro: #23 — Reduce duplicated test setup flagged by fallow

## Stage: Planning (2026-06-18T00:00:00Z)

### Session summary

Planned a behavior-preserving test-suite refactor to reduce the duplication `fallow` flags, concentrated on the two named clone families (`test/system-prompt-shaping.test.ts`, 82 lines; `test/oauth-transport.test.ts`, 23 lines).
The plan extracts per-file fixture builders and assertion-invariant helpers while keeping every act explicit, and explicitly scopes out the `src↔test` fixture clone and the pinned ordering experiments.
Wrote and committed `docs/plans/0023-reduce-duplicated-test-setup.md`.

### Observations

- Issue is operator-authored (`gotgenes`) and the proposed approach is unambiguous and backed by the `testing` skill, so the `ask_user` gate was skipped.
- No `(#23)` / `[#23]` reference exists in `docs/architecture.md`, so the release recommendation is **ship independently**.
- This is a refactor with no red phase — recommended `/build-plan` over `/tdd-plan`; the safety net per step is the green suite plus a shrinking `pnpm fallow:dupes` report.
- Per-file dedup strategy differs by clone shape: assertion-invariant helper (`assertPreambleReplaced`) + `piPrompt` builder for system-prompt-shaping; `describe`-scoped `beforeEach` + `resolveOnPayload` for oauth-transport; a shared `CLAUDE_CODE_IDENTITY` constant for request-shaping.
- Deliberately preserved as legitimate clones: `src/request-shaping.ts:78-92` ↔ test fixture (dup:bd6fc547) and the two ordering experiments (dup:8ba4938d).
- Expected no production-code change — only test files, with at most a shared test fixture constant.
