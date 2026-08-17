---
issue: 52
issue_title: "Verify PI_DEFAULT_PROMPT_TERMINATOR against the installed pi at build time, not at request time"
---

# Verify the preamble anchors against the installed pi at build time

## Release Recommendation

**Release:** ship independently

No roadmap step in `docs/architecture.md` references this issue, so there is no batch to join.
The change is test-and-docs only with no runtime behavior change, so it carries no coupling to any other pending work.

## Problem Statement

`src/constants.ts` holds five strings copied verbatim out of pi's default system prompt: `PI_DEFAULT_PROMPT_PREFIX`, `PI_DEFAULT_PROMPT_TERMINATOR`, and the three entries of `PARAGRAPH_REMOVAL_ANCHORS`.
Nothing verifies that any of them still matches the installed `@earendil-works/pi-coding-agent`.

When one drifts, the failure surfaces at request time.
For the terminator that means a `console.warn` on stderr in the middle of a live session.
For a removal anchor it means nothing at all — the paragraph silently survives into the shaped prompt.

Issue [#47] is what that class of rot already cost: the `# Project Context` fallback anchor was correct when written, pi invalidated it in `e2fd651eb` (first released in v0.75.0), and the anchor was dead for every host version this package supports without a single test noticing.

## Goals

- Add a test that builds a prompt with the installed pi's own `buildSystemPrompt` and asserts each of the five constants still matches.
- Make the check blocking: it runs as part of `pnpm test`, so a dependency bump that reworded the preamble fails CI rather than a user's session.
- Pin behaviorally that the installed pi still takes the terminator path, not the degraded sanitize-fallback path.
- Record the deliberate exception to the AGENTS.md "build fixtures inline rather than depending on Pi internals" convention, so the next reader does not undo it.

This change is not breaking.
It adds tests and documentation, and touches no file under `src/`.

## Non-Goals

- Generating `PI_UPSTREAM_SYSTEM_PROMPT` from `buildSystemPrompt`.
  Rejected on measurement, see Design Overview.
- A non-blocking CI step.
  The issue raised it as an option; the operator chose the blocking `pnpm test` path.
- Covering `customPrompt` (`--system-prompt`) users.
  `buildSystemPrompt` short-circuits on `customPrompt`, so a user who supplies one can still land on the fallback with a green check.
  This is stated in the issue and is accepted.
- Any change under `src/`.
  The request-time `console.warn` in `src/system-prompt-shaping.ts` stays exactly as it is — the check adds a second, earlier signal rather than replacing the last-resort one.
- Verifying the constants against the peer floor (`>=0.80.8`) rather than the pinned dev version (`0.84.0`).
  Filed separately as [#56].

## Background

`src/system-prompt-shaping.ts` reads all five constants:

1. `shapeAnthropicOAuthSystemPrompt` locates the preamble with `indexOf(PI_DEFAULT_PROMPT_PREFIX)` and returns the prompt untouched when that misses.
2. It then locates the span end with `indexOf(PI_DEFAULT_PROMPT_TERMINATOR, prefixIdx)`; on a miss it calls `warnTerminatorMissingOnce()` and degrades to whole-remainder sanitization.
3. `sanitizeSystemTextWithReport` splits on blank lines and drops any paragraph containing a `PARAGRAPH_REMOVAL_ANCHORS` entry.

The upstream builder lives at `node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js` and is not listed in that package's `exports` map, which declares only `.`, `./rpc-entry`, and `./client`.

Two AGENTS.md constraints apply:

1. Testing Guidance convention 3 says to "build payload fixtures inline rather than depending on Pi internals."
   This check deliberately inverts that, because depending on the internal *is* the verification.
   The convention needs an explicit carve-out rather than a silent violation.
2. Testing Guidance convention 4 says to pin markers pi actually emits.
   A generated prompt satisfies that by construction, which is what makes it a valid source of truth here.

## Design Overview

### Importing the upstream builder

Measured, on the installed 0.84.0:

| Specifier | Node | vitest |
| --- | --- | --- |
| `@earendil-works/pi-coding-agent/dist/core/system-prompt.js` | `ERR_PACKAGE_PATH_NOT_EXPORTED` | resolve error in `builtin:vite-resolve` |
| `../node_modules/@earendil-works/pi-coding-agent/dist/core/system-prompt.js` | n/a | resolves |

The relative path bypasses the `exports` map in both resolvers.
`pnpm run check` accepts it — `moduleResolution: "Bundler"` picks up the sibling `system-prompt.d.ts` — and `pnpm run lint` accepts it once Biome's import ordering is honored (the deep relative import sorts after the `#src/` group).

This is not the `src/host-transport.ts` situation.
That module has to survive pi's `jiti` loader and its alias/virtual-module maps, which is why it imports a bare `/compat` specifier.
This test runs under vitest only, never under pi's loader, so a filesystem path is both correct and simpler.

If pi restructures its `dist/` layout, the import throws at module load and the suite reds with a resolution error rather than a drift message.
That is the intended outcome: "the constants can no longer be verified" is exactly as actionable as "the constants drifted," and both should stop a dependency bump.
No `try`/`catch` skip is added.

### Why the fixture is not generated

The alternative — replace the hand-written `PI_UPSTREAM_SYSTEM_PROMPT` in `test/system-prompt-shaping.test.ts` with a `buildSystemPrompt` call — was spiked and rejected on measurement.

Since [#47] landed, the terminator-miss fallback sanitizes the whole remainder with the same anchors.
For a generated prompt, nothing after the preamble contains an anchor, so the shaped output is byte-identical whether the terminator matches or not.
The only observable difference is the `console.warn`.

A generated fixture therefore catches zero terminator drift on its own.
The check has to assert the constants against upstream output directly, which is what this plan does.
The hand-written fixture stays: it is readable, machine-independent (the generated one embeds absolute `node_modules/.pnpm/...` doc paths), and it pins shaping against a stable artifact rather than a moving one.

### What the check asserts

Four assertions, over one prompt built with the full option set (tool snippets, an extra guideline, an appended note, and a project-context file), so the preamble is surrounded by the same appended sections a real session produces:

1. `PI_DEFAULT_PROMPT_PREFIX` still opens the prompt.
2. `PI_DEFAULT_PROMPT_TERMINATOR` still appears after the prefix, and the text immediately following it is the appended section — that is, the terminator still ends the preamble rather than merely appearing inside it.
3. Every `PARAGRAPH_REMOVAL_ANCHORS` entry still matches at least one blank-line-delimited paragraph, using the same `split(/\n\n+/)` the sanitizer uses.
4. Shaping the freshly built prompt takes the terminator path: `console.warn` is not called, the Pi identity and documentation block are gone, and the appended note, `<project_context>` block, and cwd footer survive.

Assertions 1–3 give the crisp diagnosis (which constant, and what to re-verify against).
Assertion 4 is the behavioral pin — it is the build-time equivalent of the stderr line the issue is trying to eliminate.

Each assertion carries an explicit message naming the constant, so a failure reads as an instruction rather than a diff.

The upstream builder is exercised through a single local helper:

```typescript
function buildUpstreamPrompt(): string {
  return buildSystemPrompt({
    cwd: "/tmp/project",
    selectedTools: ["read", "bash"],
    toolSnippets: { read: "Read file contents", bash: "Execute shell commands" },
    promptGuidelines: ["Always check the frobnicator before deploying"],
    appendSystemPrompt: `${APPENDED_NOTE}\n- Some critical project instruction.`,
    contextFiles: [{ path: "/tmp/project/AGENTS.md", content: PROJECT_INSTRUCTION }],
  });
}
```

Note the upstream contract that shapes this call: a tool appears under `Available tools:` only when `toolSnippets` supplies a one-line snippet for it *and* the name is in `selectedTools`.
A snippet for a name absent from `selectedTools` renders nothing, and an empty result renders `(none)`.
Assertion 3 does not depend on this — all three anchors live in the fixed template text — but assertion 4's retained-content checks do.

## Module-Level Changes

### `test/upstream-prompt-drift.test.ts` (new)

The whole check.
Imports `buildSystemPrompt` by relative path with a comment block explaining the `exports`-map bypass and why a resolution failure is left to red the suite.
Imports `PARAGRAPH_REMOVAL_ANCHORS`, `PI_DEFAULT_PROMPT_PREFIX`, `PI_DEFAULT_PROMPT_TERMINATOR` from `#src/constants` and `_resetShapingWarnings`, `shapeAnthropicOAuthSystemPrompt` from `#src/system-prompt-shaping`.

### `AGENTS.md`

1. § Testing Guidance → Conventions item 3 — append the carve-out: fixtures stay inline, except the upstream-drift check, which imports `buildSystemPrompt` because depending on the internal is the thing being verified.
2. § Testing Guidance → Coverage areas — add a fifth entry for `test/upstream-prompt-drift.test.ts`.

### `.pi/skills/anthropic/SKILL.md`

§ Fast Debugging Workflow → "3. Render real before/after shaping":

1. The specifier on line 90 is wrong as written — the bare `@earendil-works/pi-coding-agent/dist/core/system-prompt.js` form fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` under Node (measured).
   Correct it to the relative-path form.
2. Line 92's "This is a debug-only technique; tests still build fixtures inline" goes stale the moment this check lands.
   Reword to point at `test/upstream-prompt-drift.test.ts` as the sanctioned test-suite use, keeping the inline-fixture rule for everything else.

### No change

- `src/` — nothing.
- `docs/architecture.md` — its Related-files list enumerates `src/` modules only; no test file, layout listing, or metric table is affected.
- `README.md` — mentions `pnpm test` but no individual suites.
- `.github/workflows/ci.yml` — the check rides the existing `Test` step.
- `docs/plans/0010-*.md` and `docs/retro/0010-*.md` record that this import was *declined* at the time.
  They are historical records of a decision made then and are left alone.

## Test Impact Analysis

1. New tests enabled.
   None of the four assertions was previously possible: without the upstream import there was no way to compare a constant against anything but another hand-written copy of it.
   Assertion 4 in particular is new in kind — it is the first test in this repo that runs shaping over a prompt the installed pi actually produced.
2. Tests that become redundant.
   None are removed.
   The verbatim `PI_UPSTREAM_SYSTEM_PROMPT` case in `test/system-prompt-shaping.test.ts` overlaps assertion 4, but is retained deliberately: it is machine-independent and readable, whereas the generated prompt embeds absolute `node_modules/.pnpm/...` paths that make it useless as a reference artifact.
   The two are complementary — one pins shaping against a stable artifact, the other pins the artifact against reality.
3. Tests that must stay as-is.
   All of `test/system-prompt-shaping.test.ts`.
   The new file verifies the *inputs* to shaping; the existing file verifies shaping itself.
   Neither replaces the other.

## Invariants at risk

1. Issue [#10] — sanitization is confined to the preamble span on the primary path.
   Pinned by `does not sanitize extension content outside the Pi preamble span` in `test/system-prompt-shaping.test.ts`.
   Assertion 4 reinforces it against live upstream output and does not relax it.
2. Issue [#47] — the degraded path preserves everything pi appends after the preamble.
   Pinned by the existing `DRIFTED_TERMINATOR_PROMPT` cases.
   Assertion 4 is complementary: it asserts the degraded path is *not* reached on the installed pi.
   No existing fallback test is touched.
3. Suite runtime.
   Measured baseline: 56 tests, 782 ms vitest duration, 2.07 s wall.
   A spike file with two upstream-importing tests measured ~40 ms of added import and transform time.
   Predicted after: 60 tests, roughly 820 ms vitest duration (estimated from that spike, not measured on the final file).
   This is a test-count and wall-clock note only; no runtime or token characteristic of the extension changes.

## TDD Order

Every cycle here is an invariant pin: the constants match the installed pi today, so each test passes the moment it is written.
Per the `testing` skill that is legitimate only if non-vacuity is demonstrated rather than asserted.
For cycles 1 and 2, do that by temporarily mutating the constant (or, for cycle 2, the terminator) under test, confirming the assertion fails with the intended message, then reverting.
Record the observed failure output in the commit body.

1. Constants presence.
   New file `test/upstream-prompt-drift.test.ts` with the `buildUpstreamPrompt` helper and assertions 1–3: prefix opens the prompt, terminator follows the prefix and is immediately followed by the appended section, every removal anchor matches a paragraph.
   Demonstrate non-vacuity by mutating each of the five constants in turn.
   Commit: `test: verify preamble anchors against the installed pi`.
2. Terminator-path pin.
   Add assertion 4 to the same file: reset the warning latch, spy on `console.warn` with `onTestFinished` cleanup, shape the built prompt, and assert no warning plus the removed/retained split.
   Demonstrate non-vacuity by mutating `PI_DEFAULT_PROMPT_TERMINATOR` and confirming the warning fires.
   Commit: `test: pin that the installed pi takes the terminator shaping path`.
3. Documentation.
   AGENTS.md carve-out and coverage-areas entry; the two `.pi/skills/anthropic/SKILL.md` corrections.
   Commit: `docs: record the sanctioned upstream-internals test exception`.

## Risks and Mitigations

1. A pi `dist/` restructure reds the suite for a non-drift reason.
   Accepted by design, and stated in the file's header comment: an unverifiable constant is as blocking as a drifted one.
   The failure arrives on a deliberate dependency bump, never on a contributor's unrelated change, because the devDependency is pinned exactly at `0.84.0`.
2. `buildSystemPrompt` reaches into pi's config module at call time (`getReadmePath`, `getDocsPath`, `getExamplesPath`).
   Measured to work in this repo and to produce absolute paths under `node_modules/.pnpm/...`.
   Mitigated by asserting on the anchors and on removal, never on the paths themselves.
3. The check verifies against the pinned dev version, not the `>=0.80.8` peer floor.
   Not mitigated here.
   CI runs a single job on a frozen lockfile, so the floor is already an assertion no build verifies; this change inherits that limitation rather than adding it.
   Filed as [#56].
4. The carve-out in AGENTS.md invites future tests to import Pi internals casually.
   Mitigated by wording the carve-out as a named exception for this one file rather than as a general permission.

## Open Questions

1. Should the check eventually run against the floor version as well as the pinned one?
   Deferred to [#56], which frames the CI-matrix question on its own terms.
2. Should `TEXT_REPLACEMENTS` get the same treatment?
   No — its single entry is a phrase pi does not emit (documented in `src/constants.ts` as a future risk carried over from `opencode-anthropic-auth`), so asserting its presence in upstream output would fail immediately and correctly means nothing.
   Left out deliberately, not overlooked.

[#10]: https://github.com/gotgenes/pi-anthropic-auth/issues/10
[#47]: https://github.com/gotgenes/pi-anthropic-auth/issues/47
[#56]: https://github.com/gotgenes/pi-anthropic-auth/issues/56
