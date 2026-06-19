---
issue: 10
issue_title: "Investigate adopting opencode-anthropic-auth-style sanitization to preserve extension-registered tool snippets and guidelines"
---

# Retro: #10 — Investigate adopting opencode-anthropic-auth-style sanitization to preserve extension-registered tool snippets and guidelines

## Stage: Planning (2026-06-18T20:30:00Z)

### Session summary

Discovered that #10's core ask — the `opencode`-style anchor-driven sanitizer (`PARAGRAPH_REMOVAL_ANCHORS` + `TEXT_REPLACEMENTS`) preserving extension `promptSnippet` / `promptGuidelines` — was already implemented and tested in commit `f740a35` during the issue #9 fix cycle.
Verified the preserved-vs-removed paragraph split against the real upstream `buildSystemPrompt` (both installed `@earendil-works/pi-coding-agent@0.79.1` and `~/development/pi/pi` at commit `20da9bc1`), and against a live before/after render.
Planned a docs-and-test close-out rather than new feature code.

### Observations

- The acceptance criteria are already met in behavior: the `Available tools:` block (incl. extension snippets) and `Guidelines:` block (incl. extension guidelines) survive; only the Pi identity paragraph (replaced), the `In addition to the tools above…` filler, and the `Pi documentation` block are removed.
- Operator confirmed via `ask_user`: scope = close-out + docs + regression test; snippet policy = keep showing `Available tools:` (retain as much of the system prompt as possible).
  This makes the change non-breaking — the issue's stated "defer `promptSnippet`" default was deliberately not adopted.
- Stale current-behavior docs to fix: `AGENTS.md:40` / `:97`, `docs/architecture.md:65` / `:92`, `.pi/skills/anthropic/SKILL.md:85` — all still say "replaces Pi's default preamble with a minimal neutral prompt."
  `docs/comparison-to-similar-projects.md` is already accurate and is the canonical phrasing to mirror; historical plan/retro records are intentionally left untouched.
- Regression test will use a verbatim upstream-fidelity inline fixture (not a `dist/` internals import) because `buildSystemPrompt` is not a public export and AGENTS.md says to keep fixtures inline.
  The new test is a characterization test — green on add — and must reuse `assertPreambleReplaced` to avoid regressing the issue #23 helper consolidation.
- Release: ship independently (no roadmap reference, no batch tag).

## Stage: Implementation — Build (2026-06-18T21:25:00Z)

### Session summary

Executed both plan steps: added a verbatim upstream-fidelity fixture (`PI_UPSTREAM_SYSTEM_PROMPT`) plus one characterization test to `test/system-prompt-shaping.test.ts` (green on add, 47 tests total), and reconciled the stale "replaces Pi's default preamble" phrasing across `AGENTS.md`, `docs/architecture.md`, and `.pi/skills/anthropic/SKILL.md`.
No production code changed; this was a docs-and-test close-out of behavior that already shipped in `f740a35`.

### Observations

- Named the fixture `PI_UPSTREAM_SYSTEM_PROMPT` rather than the plan's draft `PI_UPSTREAM_PREAMBLE`, since it includes appended content, `<project_context>`, and the footer beyond the preamble.
  Reviewer flagged this as a non-defect naming note.
- Reused `assertPreambleReplaced` in the new test as the plan required, preserving the issue #23 helper consolidation; left the existing `PI_PREAMBLE` fixture and the issue #9 appended-content test untouched.
- Doc edits mirror the already-accurate `docs/comparison-to-similar-projects.md` "Prompt shaping style" phrasing; grep confirms no stale phrasing remains in current-behavior docs.
- Pre-completion reviewer: PASS — all 3 acceptance criteria code-verified, deterministic checks green (`pnpm test` 47, `tsc --noEmit`, lint, `fallow dead-code`), Conventional Commits clean, cross-step invariants (#9, #23) hold, mermaid validates.
  No WARN findings.
- Both steps complete; next step is `/ship-issue` (release independently).
