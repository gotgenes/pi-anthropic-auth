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

## Stage: Final Retrospective (2026-06-18T22:00:00Z)

### Session summary

Closed out issue #10 across four stages (Planning, Build, Ship, Retro): discovered the core anchor sanitizer had already shipped in `f740a35` during the #9 cycle, then planned and landed a docs-and-test close-out (one characterization test plus three doc reconciliations) and shipped it.
Execution was clean — pre-completion reviewer PASS, CI green, issue closed — with only two trivial self-corrected tooling hiccups.

### Observations

#### What went well

- Real before/after render as a decision tool: when the operator asked mid-planning "do we show tools in the system prompt, or are those getting filtered out?", the agent imported the real upstream `buildSystemPrompt` and piped a realistic prompt through `shapeAnthropicOAuthSystemPrompt`, producing the exact removed/retained split.
  This turned a prose worry into ground-truth evidence and directly resolved the snippet-policy decision (keep `Available tools:`).
- Caught that #10 was already implemented (`f740a35`, tagged `(issue #10)`) before drafting a redundant feature plan; the planning correctly pivoted to a docs-and-test close-out, avoiding building behavior that already existed.
- Incremental verification: test ran after step 1, lint after each step, full suite (`pnpm test`) plus `tsc --noEmit` at the end — no end-loaded feedback-loop gap.

#### What caused friction (agent side)

- `instruction-violation` (self-identified) — the first Planning `ask_user` call omitted the required `prompt` field and returned `Invalid ask_user payload: questions[0].prompt: prompt is required`; retried immediately with the field added.
  Impact: 1 wasted tool call, no rework.
- `rabbit-hole` (minor, self-resolved) — the before/after script was first written to `/tmp/before-after.mjs`, whose relative `./node_modules` and `./src` imports resolved against `/tmp` and failed with `ERR_MODULE_NOT_FOUND`; rewrote it into the repo root as `./tmp-before-after.mjs`.
  Impact: 1 wasted tool call, no rework.

#### What caused friction (user side)

- Process gap, not a user fault: `f740a35` landed the #10 sanitizer during the #9 cycle and was even tagged `(issue #10)`, yet #10 stayed open.
  That left a full planning cycle spent largely on rediscovery and confirmation.
  Closing or annotating #10 when its work landed would have collapsed this to a quick verification.
- The operator's mid-planning probe ("do we show tools…?") was a high-value redirecting question — it surfaced the snippet-policy decision crisply and prompted the before/after evidence.
  Framed as a positive: interleaved `ask_user` plus a strategic user probe worked well here.

### Diagnostic details

- Model-performance correlation: Planning and Build ran on `claude-opus-4-8` (judgment-heavy: discovery, plan authoring, test/doc design); Ship ran on `claude-sonnet-4-6` (mechanical: `git`, CI watch, `issue_close`).
  Appropriate split — no reasoning-weak model on judgment work and no high-cost model on pure mechanics.
- Escalation-delay: no error sequence exceeded 1 retry; both hiccups self-resolved on the next call.
  No subagent dispatch warranted.
- Feedback-loop: verification was incremental, not end-loaded (see "What went well").

### Changes made

1. `docs/retro/0010-preserve-extension-snippets-and-guidelines.md` — appended this Final Retrospective stage entry.
2. `.pi/skills/anthropic/SKILL.md` — added "### 3. Render real before/after shaping (ground truth, not a hand fixture)" to the Fast Debugging Workflow, capturing the upstream-`buildSystemPrompt` render technique and the repo-root (not `/tmp`) import caveat.
