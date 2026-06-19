---
issue: 10
issue_title: "Investigate adopting opencode-anthropic-auth-style sanitization to preserve extension-registered tool snippets and guidelines"
---

# Preserve Extension-Registered Tool Snippets and Guidelines: Sanitizer Close-Out

## Release Recommendation

**Release:** ship independently

This issue is not referenced by any architecture roadmap step (no `(#10)` / `[#10]` appears in `docs/architecture.md`), and it carries no `Release:` batch tag.
It is a self-contained close-out — a documentation reconciliation plus one characterization test — so it ships on its own.

## Problem Statement

Issue #10 asked us to *investigate adopting* an `opencode-anthropic-auth`-style anchor-driven sanitizer so that extension-registered `promptSnippet` and `promptGuidelines` survive into Anthropic OAuth requests, instead of being dropped when we replaced Pi's entire default preamble with a minimal neutral prompt.

That investigation has effectively already been carried out.
The sanitizer was implemented and committed in `f740a35` ("feat: adopt anchor-driven sanitizer for system prompt shaping (issue #10)") during the issue #9 fix cycle, and 46 tests pass against it today.
The current `src/system-prompt-shaping.ts` already:

1. splits the Pi preamble into blank-line-delimited paragraphs and drops only those matching `PARAGRAPH_REMOVAL_ANCHORS` (`src/constants.ts`),
2. preserves the `Available tools:` block (extension `promptSnippet` lines) and the `Guidelines:` block (extension `promptGuidelines` bullets),
3. applies `TEXT_REPLACEMENTS` for the documented `"Here is some useful information…"` Anthropic classifier trap, and
4. replaces only the Pi identity paragraph with `MINIMAL_ANTHROPIC_OAUTH_PROMPT`.

So #10's acceptance criteria are already met in behavior.
What remains is the unfinished *bookkeeping* around that delivery: three docs still describe the old whole-preamble-replacement behavior, and the test suite pins the behavior against a simplified hand-built fixture rather than the real upstream prompt structure.

This plan closes those two gaps and confirms the acceptance criteria, so the issue can be closed cleanly.

## Goals

- Reconcile the three current-behavior docs that still say shaping "replaces Pi's default preamble with a minimal neutral prompt," so they describe the anchor-driven sanitizer that preserves tool snippets, guidelines, and appended extension content.
- Add one characterization test pinned to the *real* upstream `buildSystemPrompt` output structure, so anchor drift (upstream rewording the preamble) is caught by a high-fidelity fixture rather than only the simplified one.
- Confirm #10's acceptance criteria against the current implementation and record that confirmation, so `/ship-issue` can close the issue.

This change is **not breaking**: it touches only docs and tests.
No production code, exported API, default, or output shape changes.
The decision to keep showing the `Available tools:` block (rather than stripping `promptSnippet` per the issue's stated default) is deliberate and confirmed with the operator — retaining as much of the existing system prompt as possible.

## Non-Goals

- Not stripping the `Available tools:` snippet block.
  The operator's confirmed direction is to retain as much of the existing system prompt as possible; snippets stay.
- Not changing any shaping behavior in `src/system-prompt-shaping.ts`, `src/constants.ts`, or `src/oauth-transport.ts`.
- Not rewriting the historical plan/retro records that describe earlier states (`docs/plans/gap-analysis-and-next-steps.md`, `docs/plans/0023-*.md`, `docs/retro/0023-*.md`) — these are point-in-time records and stay as-is.
- Not editing `docs/comparison-to-similar-projects.md` — its "Prompt shaping style" section (lines ~88-100) already describes the surgical anchor approach accurately.
- Not importing Pi internals (`dist/core/system-prompt.js`) into the test suite.
  `buildSystemPrompt` is not a public package export, and AGENTS.md testing guidance is to build payload fixtures inline rather than depend on Pi internals.

## Background

### The shaping pipeline today

`src/oauth-transport.ts` injects an `onPayload` step that calls `shapeAnthropicOAuthPayload` (`src/request-shaping.ts`), which calls `shapeSystemBlocks` → `shapeAnthropicOAuthSystemPrompt` (`src/system-prompt-shaping.ts`).
Shaping is gated on the `sk-ant-oat` OAuth token, so API-key and non-Anthropic requests pass through untouched.

`shapeAnthropicOAuthSystemPrompt` locates the preamble span between `PI_DEFAULT_PROMPT_PREFIX` and `PI_DEFAULT_PROMPT_TERMINATOR`, runs `sanitizeSystemTextWithReport` over just that span, and prepends `MINIMAL_ANTHROPIC_OAUTH_PROMPT` to the sanitized remainder.
A degraded-mode fallback (terminator missing) slices from `# Project Context`, and a further fallback returns the minimal prompt only.

### Upstream structure (verified)

`buildSystemPrompt` in `~/development/pi/pi/packages/coding-agent/src/core/system-prompt.ts` (verified at commit `20da9bc1`, and matching the installed `@earendil-works/pi-coding-agent@0.79.1`) emits the preamble as a single template string with these blank-line-delimited paragraphs:

1. `You are an expert coding assistant operating inside pi, a coding agent harness. …` — identity.
2. `Available tools:` + `- <name>: <toolSnippets[name]>` lines (built-in *and* extension `promptSnippet`).
3. `In addition to the tools above, …` — filler.
4. `Guidelines:` + `- <guideline>` bullets (built-in *and* extension `promptGuidelines`).
5. `Pi documentation (read only when the user asks about pi itself, …):` + doc-path bullets, ending with `- Always read pi .md files completely …` (the terminator).

The sanitizer removes paragraphs 1 (replaced), 3, and 5, and keeps paragraphs 2 and 4.
`ToolDefinition.promptSnippet` / `promptGuidelines` (`extensions/types.ts:443-445`) feed paragraphs 2 and 4, so extension contributions are retained.

### Before / after (real upstream output)

Running the real `buildSystemPrompt` with built-in tools plus one extension tool (`my_ext_tool`) and one extension guideline, the shaped output removes only the identity sentence, the `In addition to the tools above…` filler, and the entire `Pi documentation` block (8 lines of Pi-internal doc paths), while retaining the `Available tools:` block (incl. `my_ext_tool`), the `Guidelines:` block (incl. the extension guideline), any `appendSystemPrompt` content, the `<project_context>` block, and the `Current date:` / `Current working directory:` footer.

### Constraints from AGENTS.md

- "Isolate Compatibility Logic" — keep the sanitizer constants in `src/constants.ts`; no new helper is needed for this close-out.
- Testing guidance — build fixtures inline; assert with `node:assert/strict`; pin specific markers (`/^You are an expert coding assistant\./`) over deep-equal on full prompt strings.
- The `frontmatter` / `markdown-conventions` rules apply to the docs touched here (one-sentence-per-line, sequential numbering, no emphasis-as-heading).

## Design Overview

This is a docs-and-test close-out with no behavior change, so there is no new collaborator, data shape, or interface.
The design decisions are (1) the exact replacement wording for the three stale docs and (2) the shape of the high-fidelity regression fixture.

### Doc reconciliation wording

Each stale line currently implies the whole preamble is replaced.
The accurate framing is: shaping replaces only Pi's identity paragraph with a minimal neutral prompt, removes known Pi-specific paragraphs (identity, custom-tool filler, Pi documentation block) by anchor, and preserves the rest — tool snippets, guidelines, extension-appended content, project context, and the date/cwd footer.
The already-accurate `docs/comparison-to-similar-projects.md` "Prompt shaping style" list is the canonical phrasing to mirror.

### Regression fixture shape

Add a verbatim, full-fidelity preamble fixture to `test/system-prompt-shaping.test.ts` that mirrors real upstream `buildSystemPrompt` output — including the multi-line `Pi documentation` block and the `In addition to the tools above…` filler — rather than the simplified `PI_PREAMBLE` the existing tests use.
A header comment documents the upstream source path and verified commit so the fixture can be re-checked manually when Pi bumps.

The single new test is a characterization test: it pins current behavior and is green on add (no red phase), because the behavior is already correct.
It asserts the full removed/retained split:

- identity replaced (`/^You are an expert coding assistant\./`, Pi identity absent),
- `Available tools:` block retained, including an extension `promptSnippet` line,
- `Guidelines:` block retained, including an extension `promptGuidelines` bullet,
- `In addition to the tools above` removed,
- the `Pi documentation` block removed (its doc-path bullets absent),
- appended extension content, `<project_context>`, and the `Current date:` / `Current working directory:` footer retained.

## Module-Level Changes

### Docs (current-behavior reconciliation)

1. `AGENTS.md:40` — rewrite item 6 ("Replaces Pi's default system prompt preamble with a minimal neutral prompt during the same shaping pass") to describe anchor-based paragraph removal that replaces only the Pi identity paragraph and preserves tool snippets, guidelines, and appended content.
2. `AGENTS.md:97` — update the `src/system-prompt-shaping.ts` one-liner ("minimal Anthropic OAuth prompt replacement for Pi's default prompt") to name the anchor-driven sanitizer that preserves extension contributions.
3. `AGENTS.md:369` — extend the `test/system-prompt-shaping.test.ts` coverage one-liner to mention extension snippet/guideline preservation and the upstream-fidelity fixture (light touch, optional within the same `docs:` commit).
4. `docs/architecture.md:65` — rewrite "What the wrapper does" item 2 to describe anchor-driven sanitization (remove identity/filler/Pi-docs paragraphs, replace identity with the minimal prompt, preserve tools/guidelines/extension content).
5. `docs/architecture.md:92` — update the `src/system-prompt-shaping.ts` "Related files" one-liner ("minimal neutral prompt replacement").
6. `.pi/skills/anthropic/SKILL.md:85` — rewrite the bullet "system prompt de-fingerprinting (replaces Pi's default preamble with a minimal neutral prompt)" to describe the anchor sanitizer preserving extension snippets/guidelines.

### Tests

1. `test/system-prompt-shaping.test.ts` — add a verbatim upstream-fidelity preamble fixture and one characterization test pinning the full removed/retained split.
   No existing test is changed or removed.

No `src/` files change.
A grep of `src/` and `test/` for the affected mechanism confirms no removed symbols: this plan removes no exports and renames nothing.

## Test Impact Analysis

1. **New coverage enabled** — pinning against a verbatim upstream preamble (including the real `Pi documentation` block and `In addition to…` filler) catches anchor drift that the simplified `PI_PREAMBLE` fixture cannot, because the simplified fixture omits the exact doc-path lines and filler wording the anchors target.
2. **Tests that become redundant** — none.
   The existing simplified-fixture tests still exercise the helper surface and the issue #9 / #23 invariants; the new test adds a higher-fidelity case alongside them.
3. **Tests that must stay as-is** — all existing `system-prompt-shaping.test.ts` tests, which pin the issue #9 appended-content invariant and the degraded-mode fallbacks, plus the `shapeSystemBlocks` pass-through cases.

## Invariants at Risk

This change touches `test/system-prompt-shaping.test.ts`, refactored under issue #23 (the `piPrompt` / `assertPreambleReplaced` helpers) and pinning behavior landed under issue #9.

- Issue #9 invariant — content appended between the preamble and `# Project Context` is preserved.
  Pinned by `test/system-prompt-shaping.test.ts` "preserves content appended between preamble and Project Context (issue #9)".
- Issue #23 invariant — the consolidated `piPrompt` builder and `assertPreambleReplaced` assertion helper.
  Pinned by every test that routes through them.

The new characterization test must reuse `assertPreambleReplaced` for the identity-replacement assertion (not re-inline it), so it does not regress the #23 consolidation, and it must not alter the existing `PI_PREAMBLE` fixture the other tests depend on.

## TDD Order

1. **Characterization test — upstream-fidelity fixture.**
   Surface: `test/system-prompt-shaping.test.ts`.
   Add a verbatim `PI_UPSTREAM_PREAMBLE` fixture (with a header comment citing `~/development/pi/pi/packages/coding-agent/src/core/system-prompt.ts` and the verified commit) plus one test asserting the full removed/retained split, reusing `assertPreambleReplaced` for the identity assertion.
   This is green on add (behavior is already correct).
   Verify: `pnpm test test/system-prompt-shaping.test.ts` green.
   Commit: `test: pin OAuth prompt shaping against upstream preamble fixture (#10)`.

2. **Docs reconciliation.**
   Surface: `AGENTS.md`, `docs/architecture.md`, `.pi/skills/anthropic/SKILL.md`.
   Apply the six edits in Module-Level Changes so the current-behavior docs describe the anchor-driven sanitizer that preserves tool snippets, guidelines, and appended content.
   Verify: `pnpm run lint:md` (or `pnpm run lint`) green; grep confirms no remaining "replaces Pi's default preamble with a minimal neutral prompt" phrasing in current-behavior docs.
   Commit: `docs: describe anchor-driven prompt sanitizer that preserves extension contributions (#10)`.

## Risks and Mitigations

- **Risk:** doc wording drifts from actual behavior again on the next change.
  **Mitigation:** point all three docs at the same canonical description style already used in `docs/comparison-to-similar-projects.md`, and add the upstream-fidelity test so behavior is pinned independently of prose.
- **Risk:** the verbatim fixture itself drifts from upstream when Pi bumps, giving false confidence.
  **Mitigation:** the fixture header comment records the upstream source path and verified commit, and the test asserts on stable anchor substrings (not absolute doc paths), so it fails loudly if the anchors stop matching real structure.
- **Risk:** reviewers read "issue #10" and expect new feature code.
  **Mitigation:** the plan's Problem Statement and the `f740a35` reference make explicit that the behavior already shipped and this is a close-out.

## Open Questions

- Should `promptSnippet` ever be stripped to reduce fingerprint surface?
  Deferred.
  The operator's confirmed direction is to retain as much of the system prompt as possible; revisit only if a concrete Anthropic classifier rejection is traced to the `Available tools:` block.
