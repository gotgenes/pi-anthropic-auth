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
