---
issue: 47
issue_title: "`# Project Context` fallback anchor never matches pi's prompt, so a terminator drift drops the whole system prompt"
---

# Replace the dead `# Project Context` fallback with anchor-based sanitization

## Release Recommendation

**Release:** ship independently

`docs/architecture.md` carries no roadmap steps and no `Release:` tags, so this issue belongs to no batch.
It is a self-contained fix to one function in `src/system-prompt-shaping.ts` with no dependency on other open work.

## Problem Statement

`shapeAnthropicOAuthSystemPrompt` locates the end of pi's default preamble with one exact string, `PI_DEFAULT_PROMPT_TERMINATOR`.
When that lookup fails it falls back to slicing from the literal `"\n\n# Project Context\n\n"`, and when that also fails it returns `MINIMAL_ANTHROPIC_OAUTH_PROMPT` alone.

pi does not emit `# Project Context`.
It wraps project context in `<project_context>` tags, so the fallback can never match and the second fallback is the only reachable one.
A terminator drift therefore discards everything pi appends after the preamble: `--append-system-prompt` content, the `AGENTS.md` files, the skills block, and the working directory.
The user gets one `console.warn` on stderr and a session that keeps running while silently ignoring the project's own instructions.

The primary path still matches pi at v0.84.2, so this is latent rather than live.
It only matters in exactly the case the fallback exists to handle.

## Goals

1. Make the degraded path preserve everything pi appended after the preamble, instead of discarding it.
2. Remove the dead `# Project Context` anchor rather than replacing it with a second anchor that also needs keeping current.
3. Keep the primary (terminator-matched) path's output byte-identical.
4. Keep the one-time drift warning as the user-visible signal.

This change is not breaking.
It alters output only on a path that is unreachable with an unmodified pi at the supported floor, and it changes that path from discarding content to preserving it.

## Non-Goals

1. Detecting terminator drift proactively at build time — filed as [#52].
2. Surfacing drift through `/anthropic-auth:status`.
   `ExtensionDiagnostics` is a load-time value object and drift is a request-time observation; the operator chose to keep the single `console.warn` rather than widen that interface.
3. Returning the prompt unshaped as a last resort.
   That preserves the most content but sends pi's identity fingerprint to Anthropic, which is what this extension exists to strip.
4. Any change to `src/request-shaping.ts`, `src/oauth-transport.ts`, `src/host-transport.ts`, `src/index.ts`, or `src/diagnostics.ts`.
5. Restructuring `test/system-prompt-shaping.test.ts` beyond the cases this change touches.
6. Moving the peer floor.
   It stays at `>=0.80.8`, which was reviewed during this planning session and confirmed functionally correct — `unregisterProvider` and pi-ai's `anthropicMessagesApi` both exist at that version.
   The fixture refresh in step 5 is correct at that floor, since pi removed `Current date:` in v0.80.7.
   Two findings from that review are tracked separately: [#53] (whether pi 0.81.0's `ModelRegistry.getProvider` reopens the compat-dispatch gap, which would supply a driver for raising the floor) and [#54] (the `streamSimpleAnthropic` fallback that the current floor already makes unreachable).

## Background

### Why the anchor is dead

The anchor was correct when it was written.
pi replaced the heading with XML boundaries in `e2fd651eb` (2026-05-16), first released in v0.75.0:

```text
-  prompt += "\n\n# Project Context\n\n";
+  prompt += "\n\n<project_context>\n\n";
```

This package's peer floor is `>=0.80.8`, so the anchor has been dead for every supported host.
Verified against the upstream clone at `v0.84.2-28-g6db110e6f` and against the installed `@earendil-works/pi-coding-agent@0.84.0` `dist`.

By contrast `PI_DEFAULT_PROMPT_TERMINATOR` entered the preamble in `d2de6d083` (2026-01-26, v0.50.0) and has not changed since.
The stable anchor is the primary one; the volatile one was the fallback.

### The pieces already in place

`sanitizeSystemTextWithReport` splits text on blank lines and drops any paragraph containing one of `PARAGRAPH_REMOVAL_ANCHORS` — the pi identity sentence, the custom-tool filler, and the pi documentation block.
Today it is applied only to the preamble span, so user content is never touched.
That restriction is a deliberate outcome of [#10] and is pinned by the test `does not sanitize extension content outside the Pi preamble span`.

`AGENTS.md` constrains this work in two ways.
Prefer request shaping over prompt rewriting, and keep compatibility logic in small helpers so it is easy to adjust when Anthropic's rules drift.

## Design Overview

### The fallback becomes the same operation over a wider span

When the terminator is missing we do not know where the preamble ends, so there is no honest span boundary to slice at.
Instead of guessing one from a second positional anchor, sanitize from the preamble prefix to the end of the prompt using the paragraph anchors already maintained for the primary path, and prepend the minimal prompt.

This removes the pi identity, the filler, and the documentation block wherever they sit, and leaves every other paragraph in place.
No second anchor survives to rot.

Measured against the fixture in the issue body (753 chars, four appended sections):

| behavior | output chars | appended text | `<project_context>` | skills | cwd |
| --- | --- | --- | --- | --- | --- |
| current | 162 | dropped | dropped | dropped | dropped |
| `<project_context>` anchor | 464 | dropped | kept | kept | kept |
| anchor sanitize (chosen) | 580 | kept | kept | kept | kept |
| unshaped | 753 | kept | kept | kept | kept |

All four numbers are measured, from a disposable spike run against the current `sanitizeSystemTextWithReport`.
The chosen fallback removed exactly three paragraphs, one per anchor.

### Both branches collapse to one span operation

After the change the two branches differ only in where the span ends and what the debug record calls it.
That makes a shared private helper a genuine consolidation rather than procedure splitting: it returns a value, both callers pass a span boundary, and the duplicated slice-sanitize-splice sequence disappears.

```typescript
function shapePreambleSpan(
  systemPrompt: string,
  prefixIdx: number,
  spanEnd: number,
  mode: "terminator" | "sanitize-fallback",
): string {
  const span = systemPrompt.slice(prefixIdx, spanEnd);
  const report = sanitizeSystemTextWithReport(span);
  const shaped = report.text
    ? `${MINIMAL_ANTHROPIC_OAUTH_PROMPT}\n\n${report.text}`
    : MINIMAL_ANTHROPIC_OAUTH_PROMPT;

  if (shouldLogPromptDebug(report)) {
    debugLog("system-prompt-shaping", { mode, spanLength: span.length /* ... */ });
  }

  return systemPrompt.slice(0, prefixIdx) + shaped + systemPrompt.slice(spanEnd);
}
```

Call sites:

```typescript
if (terminatorIdx !== -1) {
  const spanEnd = terminatorIdx + PI_DEFAULT_PROMPT_TERMINATOR.length;
  return shapePreambleSpan(systemPrompt, prefixIdx, spanEnd, "terminator");
}

warnTerminatorMissingOnce();
return shapePreambleSpan(systemPrompt, prefixIdx, systemPrompt.length, "sanitize-fallback");
```

`systemPrompt.slice(spanEnd)` is the empty string when `spanEnd` is the prompt length, so the fallback needs no special case.
Both branches preserve `systemPrompt.slice(0, prefixIdx)` untouched, which keeps the existing behavior for blocks where the preamble does not start at index 0.

The helper takes primitives and stays private, so there is no new public surface and no domain object to over-accept.

### Edge cases

1. Every paragraph matches an anchor.
   `report.text` is empty and the result is the minimal prompt alone — the existing empty-report branch already covers this.
2. The prefix is absent.
   Unchanged: return the prompt as-is before either branch runs.
3. A user's own `AGENTS.md` paragraph quotes an anchor string.
   In fallback mode that paragraph is dropped.
   This is the deliberate cost of the choice and is covered under Invariants at risk.
4. The warning stays latched to one emission per process, and the fallback path no longer implies content loss, so the message text needs rewording but not escalation.

### Debug record

`mode` changes from `"project-context-fallback"` to `"sanitize-fallback"`, and the fields rename from `preambleLength`/`sanitizedPreambleLength` to `spanLength`/`sanitizedSpanLength` because the span is no longer always the preamble.
The fallback branch also starts using `shouldLogPromptDebug(report)` instead of its own `!isToolUseOnlyDebugEnabled()` check, which it can now do because it has a report.
No test or document references these field names; they are developer-facing only.

## Module-Level Changes

### `src/system-prompt-shaping.ts`

1. Remove `findProjectContextStart`.
   The fallback was its only call site.
2. Add the private `shapePreambleSpan` helper described above.
3. Rewrite the fallback branch of `shapeAnthropicOAuthSystemPrompt` to call `shapePreambleSpan` over the remainder of the prompt.
4. Reword `warnTerminatorMissingOnce`: replace `falling back to '# Project Context' anchor` with `falling back to anchor-based sanitization of the full prompt`.
   Keep the phrase `preamble terminator not found`, which an existing test asserts on.
5. Update the `shapeAnthropicOAuthSystemPrompt` JSDoc, which currently documents the `# Project Context` slice and the minimal-only last resort.

### `test/system-prompt-shaping.test.ts`

1. Add fallback-preservation cases (new).
2. Rework `falls back to '# Project Context' anchor when terminator is missing and warns once` — the anchor no longer participates; the case keeps its warn-once assertion.
3. Rework `falls back to minimal-only when terminator and Project Context are both missing` — its premise is gone; trailing content now survives.
4. Add a case pinning the relaxed span boundary in fallback mode, so the trade-off is explicit rather than incidental.
5. Refresh `PI_UPSTREAM_SYSTEM_PROMPT` and its provenance comment.
   The fixture is documented as mirroring upstream verbatim but is pinned at 0.79.1 and still carries the `Current date:` line pi removed in v0.80.7 (`f4e9ca746`), below this package's supported floor.
   Also add the `environment-variables.md` bullet the documentation block gained in v0.82.0 (`bb3d7d399`).
   The `Current date:` assertions in this case go with it; the other cases keep their synthetic footers, which exercise footer preservation rather than upstream parity.

### `AGENTS.md`

1. Testing Guidance item 4 offers `/# Project Context/` as a model assertion marker.
   pi has not emitted that string since v0.75.0, so the example teaches a marker that cannot match; change it to `/<project_context>/`.
2. Coverage-areas item 3 and priority-areas item 3 both mention `fallback paths` / `degraded-mode fallbacks` in the abstract and stay accurate; no edit needed.

Greps run to bound this list: `Project Context`, `project_context`, `findProjectContextStart`, `fallback`, `preambleLength`, `project-context-fallback`, and `Current date` across `src/`, `test/`, `docs/`, `.pi/`, `AGENTS.md`, and `README.md`.
`README.md` does not describe prompt shaping.
`docs/architecture.md` covers the transport seam only and does not mention the fallback, the anchor, or a module layout that changes here.
`.pi/skills/anthropic/SKILL.md` describes shaping as "anchor-based removal" without naming the fallback, which stays true.
`docs/plans/0010-*`, `docs/plans/0023-*`, and `docs/retro/0010-*` mention the anchor as historical record and are not edited.

## Test Impact Analysis

### Newly enabled

The fallback previously had one meaningful outcome, so it supported only two shallow cases.
With content preservation there is a per-section contract worth pinning: appended text, `<project_context>`, `<available_skills>`, and the cwd footer each survive a drifted terminator, while each of the three anchors is still removed.

### Becoming redundant

None are removable.
`falls back to minimal-only when terminator and Project Context are both missing` loses its premise but is repurposed rather than deleted — the same input now has a preservation assertion instead of a loss assertion.

### Must stay as-is

1. `does not sanitize extension content outside the Pi preamble span` — the [#10] invariant, and now the boundary between the two paths.
2. `preserves content appended between preamble and Project Context (issue #9)` — the [#9] invariant on the primary path.
3. `pins the removed/retained split against the verbatim upstream prompt` — assertions unchanged; only the fixture is refreshed.
4. `test/request-shaping.test.ts` uses a prompt containing the terminator, so it exercises the primary path and is untouched.

## Invariants at risk

1. [#9] — content appended between the preamble and the project-context section reaches Anthropic.
   Pinned by `preserves content appended between preamble and Project Context (issue #9)`.
   The change strengthens this on the fallback path and leaves the primary path untouched.
2. [#10] — sanitization is confined to pi's preamble span, so extension content that happens to contain an anchor string is never rewritten.
   Pinned by `does not sanitize extension content outside the Pi preamble span`.
   **This invariant is deliberately relaxed on the fallback path only**, because the fallback has no trustworthy span boundary.
   The primary-path test stays as the guard, and a new fallback-path test records the relaxation so a future reader sees it as a decision.
   Measured cost on the issue's fixture: three paragraphs removed, all three matching a pi anchor, 580 of 753 chars retained against 162 today.
3. Primary-path output is byte-identical.
   The `refactor` step rewrites both branches through one helper, so this is the step where a regression would land.
   Pinned by every existing primary-path case in `test/system-prompt-shaping.test.ts` plus `test/request-shaping.test.ts`.

## TDD Order

1. **`test:`** Add the failing fallback-preservation cases to `test/system-prompt-shaping.test.ts`.
   A prompt with a reworded terminator, an appended section, `<project_context>`, `<available_skills>`, and a cwd footer must keep all four while losing the three anchor paragraphs.
   Red against the current implementation, which returns the minimal prompt alone.
   Commit: `test: pin fallback preservation for a drifted preamble terminator (#47)`
2. **`fix:`** Replace the fallback branch with whole-remainder anchor sanitization, remove `findProjectContextStart`, reword the warning, and update the two existing fallback cases and the JSDoc.
   Source and its tests move together because the removal breaks them in the same commit.
   Commit: `fix: preserve appended prompt content when the preamble terminator drifts (#47)`
3. **`test:`** Add the case pinning the relaxed span boundary in fallback mode — an anchor-quoting paragraph in user content is dropped in fallback mode and kept on the primary path.
   Commit: `test: pin the fallback span-boundary trade-off (#47)`
4. **`refactor:`** Extract `shapePreambleSpan` and route both branches through it; rename the debug fields.
   No test changes; the full suite is the safety net.
   Commit: `refactor: share span shaping between the terminator and fallback paths`
5. **`test:`** Refresh `PI_UPSTREAM_SYSTEM_PROMPT` to pi v0.84.2 and update its provenance comment.
   Commit: `test: refresh the verbatim upstream prompt fixture to pi 0.84.2`
6. **`docs:`** Update the `AGENTS.md` assertion-marker example.
   Commit: `docs: use <project_context> as the assertion-marker example (#47)`

Steps 4 and 5 are independent of each other and of step 3; the order above keeps each commit's diff small.

## Risks and Mitigations

1. **A user's `AGENTS.md` quoting an anchor string loses that paragraph in fallback mode.**
   Narrow — it requires a drifted terminator *and* the quoted string.
   The alternative on the table lost the entire file rather than one paragraph.
   Pinned by the step 3 test so the behavior is documented rather than surprising.
2. **The refactor silently changes primary-path output.**
   The refactor lands after the behavior change, as its own commit, with the full existing suite green before and after.
   The verbatim-upstream case pins the removed/retained split.
3. **The fallback becomes so good that terminator drift stops being noticed.**
   That is the real trade: the failure gets quieter because it stops causing damage.
   The `console.warn` stays, and [#52] proposes catching drift at build time instead.
4. **Refreshing the upstream fixture weakens footer coverage.**
   `Current date:` assertions live in three other cases with synthetic footers, which continue to pin footer preservation independently of what pi currently emits.

## Open Questions

1. Whether the `sanitize-fallback` path should eventually be the only path, with the terminator span kept purely as an optimization.
   Not worth deciding now — the span restriction is the [#10] invariant and there is no evidence pressing against it.
2. Whether [#52] should gate `pnpm test` or run as a separate non-blocking CI step.
   Deferred to that issue.

[#9]: https://github.com/gotgenes/pi-anthropic-auth/issues/9
[#10]: https://github.com/gotgenes/pi-anthropic-auth/issues/10
[#52]: https://github.com/gotgenes/pi-anthropic-auth/issues/52
[#53]: https://github.com/gotgenes/pi-anthropic-auth/issues/53
[#54]: https://github.com/gotgenes/pi-anthropic-auth/issues/54
