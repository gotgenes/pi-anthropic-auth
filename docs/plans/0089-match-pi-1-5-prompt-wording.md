---
issue: 89
issue_title: "Pi 1.5.0 reworded its default prompt, so OAuth shaping passes Pi's whole prompt through unshaped"
---

# Match Pi 1.5's reworded default prompt

## Release Recommendation

**Release:** ship independently

Issue #89 is not a step in the `docs/architecture.md` roadmap, and it fixes a live behavioral-silent regression for every user on pi >=1.5.0, so it should not wait on a batch.

## Problem Statement

Pi 1.5.0 reworded its default system prompt (earendil-works/pi@705d047, "tighten system prompt").
All three strings shaping keys on changed: the preamble opening, the `tools` filler sentence, and the `docs` section's first line.
On pi >=1.5.0, every Anthropic OAuth request therefore sends Pi's whole default prompt: the "You are a coding assistant running inside pi" identity, the `<docs>` block with its install paths, and the "Additional tools may be available." filler.
Requests still return 200 (the operator measured haiku, sonnet, and opus 5.5 on pi 1.5.2), so nothing reports it.

The suite stays green because the devDeps pin pi 1.3.0, and `test/upstream-prompt-drift.test.ts` verifies only the installed Pi.
Bumping the devDeps to 1.5.2 turns 6 tests red across 3 files (measured in a scratch worktree, below).

## Goals

- Shape Pi's default prompt on both the <=1.4 and the >=1.5 wording, since the peer range stays `>=0.86.0`.
- Warn once at runtime when a prompt carries all of Pi's own sections but opens with a preamble no known prefix matches, so the next rewording is not silent for users on a newer Pi.
- Raise `CLAUDE_CODE_VERSION` above pi 1.5.2's `claude-cli/2.1.322`.
- Bump both Pi devDeps to 1.5.2, fixing the `Type` import pi-ai 1.5.0 removed from its root.
- Drop the local `MessageThreadOptOut` type Issue [#86] added for the 1.3.0 type gap.
- Add an offline drift alarm that drives pi 1.5.2's real transport through two thread turns and asserts the second OAuth request still carries `system`.

The change is not breaking.
On pi <=1.4 the shaped output is byte-identical to today's; on pi >=1.5 it restores the documented shaping.
The new warning fires only on a prompt shape no supported Pi release produces.

## Non-Goals

- A CI job that runs the drift suites against the latest Pi release.
  The operator chose to record it on [#56] rather than file a new issue; the comment is [#56 (comment)](https://github.com/gotgenes/pi-anthropic-auth/issues/56#issuecomment-6841205945).
- Runtime warnings for a missed `docs` or `tools` anchor.
  A `docs` section without Pi's anchor is also what an extension that overwrites `docs` produces, which is the case the anchor exists for, so its miss is ambiguous.
  The preamble miss is the unambiguous signal, and the 1.5 rewording would have tripped it.
- Changing the `shapeSystemBlocks` gate to shape a block on its sections alone.
  pi-permission-system writes `tools` and `rules` sections under a subagent's custom prompt, and a section-based gate would start rewriting those prompts.
  The gate stays "contains a known preamble prefix"; the warning sits on the gate's miss path and changes no output.
- Raising the peer floor to `>=1.5.0` and dropping the old wording; that would be breaking with no functional driver.
- Message threads for OAuth requests ([#90]).
- A full upstream-impact pass over pi 1.3.0 → 1.5.2.
  Both changelogs and the routing watchlist files were skimmed at planning time (see Background); nothing beyond this issue's items surfaced.
- Rewording the 2.1.280 examples in `README.md`'s `claude_code_version_too_old` troubleshooting section; they illustrate the error shape, not the current pin.

## Background

### Where shaping keys on wording

- `src/constants.ts` holds `PI_DEFAULT_PROMPT_PREFIX`, `PI_TOOLS_FILLER_ANCHOR`, and `PI_DOCS_SECTION_ANCHOR`, each a single string.
- `src/system-prompt-shaping.ts`:
  - `decideSection()` replaces the preamble when it `startsWith` the prefix, drops a `docs` section whose body `includes` the docs anchor, and strips the `tools` paragraph containing the filler anchor.
    The leading prompt and mid-conversation section updates (Issue [#69]) both go through it.
  - `shapeSystemBlocks()` shapes only a `system[]` text block that `includes(PI_DEFAULT_PROMPT_PREFIX)`.
    That gate is why the 1.5 failure is fully silent: the prompt block never reaches the parser, so not even the existing "carries none of its own sections" warning fires.
- `src/request-shaping.ts` reaches the constants only through `shapeSystemBlocks` and `shapeSystemUpdateText`.

The wording change, as `git show 705d047 -- packages/coding-agent/src/core/system-prompt.ts` in `~/development/pi/pi` shows it (unchanged on `main` through v1.5.2 and after):

| Constant | Pi <=1.4 | Pi >=1.5 |
| --- | --- | --- |
| prefix | `You are an expert coding assistant operating inside pi, a coding agent harness.` | `You are a coding assistant running inside pi, a coding agent harness.` |
| tools filler | `In addition to the tools above` | `Additional tools may be available.` |
| docs anchor | `Pi documentation (read only when the user asks about pi itself` | `Pi documentation (read only when the user asks about the harness itself` |

Pi emits `tools`, `rules`, and `docs` only in the default-preamble branch of `buildSystemPromptSections` (verified at v0.86.0 and v1.5.2).
A custom `--system-prompt` gets none of them, unless an extension writes them.
pi-permission-system does, writing `tools` and `rules` (not `docs`) under a subagent's custom prompt (`packages/pi-permission-system/src/handlers/before-agent-start.ts` in `~/development/pi/pi-packages`).
That is why the warning requires all three sections.

### Scratch-worktree measurements (`/tmp/bump89`, devDeps at 1.5.2)

- `vitest run`: 6 failed, 237 passed, and `pi-anthropic-ordering-experiment.test.ts` failed to load (its 3 tests did not run).
  Baseline on 1.3.0: 246 passed in 17 files.
  The failures:
  - five in `upstream-prompt-drift`: the prefix, both anchors, the section path, and tag balance;
  - one in `claude-code-version-drift`: the pin 2.1.280 is below pi's 2.1.322;
  - the ordering experiment: `Type` is no longer exported from the pi-ai root (`TS2305` under `tsc`, `undefined` at runtime).
- A prototype changed the three constants to lists and matched them with `.some`.
  Shaping pi 1.5.2's real `buildSystemPrompt` output (tools `read`, `bash`, `edit`, `write`, plus one context file) then went from 2271 to 613 bytes (measured).
  The preamble was replaced, the filler paragraph and the whole `<docs>` section were dropped, and every other line was byte-identical.
- A two-turn thread spike used pi 1.5.2's `anthropicMessagesApi().streamSimple`, a fake SSE `fetch`, the same `sessionId`, and `cacheRetention: "short"`.
  It measured, per transport:
  - pi's bare transport: turn 1 `thread: {type: "create"}`; turn 2 `thread: {type: "continue", previous_message_id: "msg_1"}`, with no `system` and only the new message.
  - through `createAnthropicOAuthStreamSimple` with an `sk-ant-oat` key: no `thread` on either turn, and turn 2 carries 3 system blocks and all 3 messages.
  - with `MESSAGE_THREAD_OPT_OUT` mutated to `disableContinuation: false`, the wrapped turn 2 became a `continue` without `system`.
  So the alarm discriminates.
- Plain JSON Schema literals for `Context["tools"]` parameters typecheck against the pinned 1.3.0 types (`tsc --noEmit` exit 0, measured), so the `Type` fix can land before the bump.
- `disableContinuation?: boolean` is on pi-ai 1.5.2's `StreamOptions` (`dist/types.d.ts`), which `SimpleStreamOptions` extends.

### Upstream sweep, 1.3.0 → 1.5.2

Both changelogs were read for 1.4.0, 1.5.0, 1.5.1, and 1.5.2.

- Relevant items:
  - the prompt tightening (coding-agent 1.5.0, a one-line "Tightened system prompt", which is how it went unnoticed);
  - the TypeBox root re-export removal (pi-ai 1.5.0);
  - message threads and `disableContinuation` (1.5.1, handled by Issue [#86]);
  - pi's Claude Code version bump (1.5.2).
- `provider-composer.ts`'s `streamWith` still routes a registered `streamSimple` first.
- `model-runtime.ts`'s `apiKey` forwarding is unchanged in shape.
- `renderSystemMessageUpdate` in `packages/ai/src/utils/text.ts` is unchanged; only `ownedSlice` was added.

### AGENTS.md constraints that apply

- Keep compatibility logic in small helpers; prefer request shaping; preserve API-key behavior.
- The drift suites are sanctioned exceptions to "build fixtures inline"; the new thread alarm joins them and must be listed.
- Fresh-release lockfile age gate: pi 1.5.2 was published 2026-11-10, well past the 60-minute `minimumReleaseAge`.
- Do not take `CLAUDE_CODE_VERSION` from a local `claude --version`; use `npm view @anthropic-ai/claude-code dist-tags`.
  At planning time `latest` is 2.1.323 and `stable` 2.1.311 (below pi's 2.1.322).

## Design Overview

### Anchor lists, newest wording first

```typescript
/** Opening sentence of Pi's default preamble, one entry per wording, newest first. */
export const PI_DEFAULT_PROMPT_PREFIXES: readonly string[] = [
  // pi >=1.5.0
  "You are a coding assistant running inside pi, a coding agent harness.",
  // pi 0.86.0 – 1.4.x
  "You are an expert coding assistant operating inside pi, a coding agent harness.",
];
export const PI_TOOLS_FILLER_ANCHORS: readonly string[] = [
  "Additional tools may be available.",
  "In addition to the tools above",
];
export const PI_DOCS_SECTION_ANCHORS: readonly string[] = [
  "Pi documentation (read only when the user asks about the harness itself",
  "Pi documentation (read only when the user asks about pi itself",
];
```

A shared common substring was considered and rejected: the two filler sentences share none, and a uniform shape keeps one rule for adding the next wording.
A `matchesAnyAnchor(text, anchors, mode)` helper was also rejected (Tidy-First assessor): the three call sites use `startsWith`, `includes`, and paragraph filtering, so the helper would need a mode flag.
Each site uses an inline `.some(...)`, and `removeParagraphContaining` takes `readonly string[]` and drops a paragraph containing any anchor.

### Runtime warning on an unrecognized preamble

`shapeSystemBlocks` keeps its gate, renamed to a predicate, and gains one branch on the miss path:

```typescript
export function shapeSystemBlocks(blocks: TextBlock[]): TextBlock[] {
  return blocks.map((block) => {
    if (block.type !== "text") return block;
    if (!containsPiPreamble(block.text)) {
      warnIfPiPromptUnrecognized(block.text); // output unchanged
      return block;
    }
    return { ...block, text: shapeAnthropicOAuthSystemPrompt(block.text) };
  });
}
```

- `containsPiPreamble(text)`: `PI_DEFAULT_PROMPT_PREFIXES.some((prefix) => text.includes(prefix))`, which keeps today's `includes` semantics.
- `warnIfPiPromptUnrecognized(text)`: parses the chunks, and when every name in `PI_OWNED_SECTIONS` is present, emits a one-time `console.warn`.
  - The latch is a second module-level boolean, `warnedPreambleUnrecognized`.
  - It is set when the warning fires, read before warning, and cleared by `_resetShapingWarnings()` alongside `warnedPromptUnstructured`.
  - The keyed warn-once helper the assessor offered as optional is not adopted: two latches are below the threshold.
- Starting wording, following the existing `[pi-anthropic-auth]` warning:
  `[pi-anthropic-auth] Pi's system prompt carries its own sections but opens with a preamble this extension does not recognize; passing it through unshaped. Upstream Pi may have reworded its prompt — re-verify PI_DEFAULT_PROMPT_PREFIXES.`

Which inputs warn:

| `system[]` block | Gate | Warns |
| --- | --- | --- |
| Claude Code identity block | miss | no (no sections) |
| Pi default prompt, known wording | hit | no |
| Pi default prompt, unknown wording (the next #89) | miss | **yes**, once |
| custom `--system-prompt` | miss | no (no Pi sections) |
| custom prompt + pi-permission-system `tools`/`rules` | miss | no (`docs` absent) |
| pre-0.86 flat prompt (below peer floor) | hit | existing "no sections" warning |

The parse on the miss path runs over the short identity block on every request; the cost is negligible next to the shaping parse it replaces on a hit.

### Pin

`CLAUDE_CODE_VERSION` becomes the `latest` dist-tag read at implementation time: 2.1.323 at planning, and never below pi 1.5.2's 2.1.322.
On pi 1.5.2 the wire-level sync (Issue [#74]) already sends 2.1.322; the pin matters for users on older pi.

### Thread drift alarm

`test/message-thread-drift.test.ts` drives pi-ai's own `anthropicMessagesApi().streamSimple`, as `test/managed-effort-drift.test.ts` does.
Each case runs two turns with a fetch that answers turn 1 with a minimal SSE stream: `message_start` with `id: "msg_1"`, one text block, `message_delta` `end_turn`, then `message_stop`.
That makes pi record a thread reply; the case then captures turn 2's body.
pi-ai's thread state is module-global and keyed by `sessionId`, so every case uses its own `sessionId`.

### Data and mechanism separation

The anchor lists (data) and the warning (mechanism) land as separate steps.
The pin (data) lands separately from the devDep bump.

## Module-Level Changes

- `src/constants.ts`: replace the three single-string constants with the three lists, and update the section-aware block comment to say the lists hold one entry per Pi wording.
- `src/system-prompt-shaping.ts`:
  - `.some` matching in `decideSection`;
  - `removeParagraphContaining(text, anchors: readonly string[])`;
  - the `containsPiPreamble` predicate;
  - `warnIfPiPromptUnrecognized` with its latch, cleared in `_resetShapingWarnings`;
  - an updated `shapeSystemBlocks` JSDoc.
- `src/claude-code-version.ts`: raise `CLAUDE_CODE_VERSION`.
- `src/oauth-transport.ts`: remove the exported `MessageThreadOptOut`, type `MESSAGE_THREAD_OPT_OUT` as `Pick<SimpleStreamOptions, "disableContinuation">`, and drop "absent from the pinned 1.3.0 type" from its JSDoc.
- `package.json`, `pnpm-lock.yaml`: both Pi devDeps 1.3.0 → 1.5.2.
- `test/system-prompt-fixture-parts.ts`:
  - add a `PiPromptWording` bundle type (`{ preamble, toolsFiller, docsIntro }`);
  - add `PI_WORDING_1_4`, the current literals, in the tidy step;
  - add `PI_WORDING_1_5` in the fix step.
- `test/system-prompt-shaping.test.ts`:
  - rename `pi086Prompt`/`PI_086_*` to version-neutral names, parameterized by wording;
  - run the preamble, docs, filler, tag-balance, and "well-formed fixture" tests for both wordings;
  - add `shapeSystemBlocks` cases for the 1.5 gate and for the warning.
- `test/upstream-prompt-drift.test.ts`:
  - assert that some entry of each list matches the installed Pi;
  - make the shaped-output assertions wording-agnostic: `/inside pi, a coding agent harness/` absent, and no paragraph containing any filler anchor;
  - route the section-path check through `shapeSystemBlocks` and assert zero warnings of either kind.
- `test/request-shaping.test.ts`: add mid-conversation `docs` and `tools` update cases in 1.5 wording; existing <=1.4 cases stay.
- `test/pi-anthropic-ordering-experiment.test.ts`: plain JSON Schema literals instead of `Type.Object`/`Type.String`, and remove the `Type` import.
- `test/oauth-transport.test.ts`: drop the `type MessageThreadOptOut` import (line 14) and its three `SimpleStreamOptions & MessageThreadOptOut` uses (lines 276, 289, 306).
- `test/message-thread-drift.test.ts`: new.
- `AGENTS.md`:
  - Testing Guidance: four sanctioned exceptions instead of three, plus coverage item 15 for the thread alarm;
  - coverage items 7 and 10 mention both wordings and the unrecognized-preamble warning;
  - the Claude Code version gotcha's pi `claudeCodeVersion` history gains "2.1.322 in 1.5.2";
  - Current Status item 4 notes both prompt wordings.
- `docs/architecture.md`: in "What the wrapper does" item 1, say the anchors cover both wordings and describe the unrecognized-preamble warning.
- `.pi/skills/upstream-watch/SKILL.md`:
  - the prompt row names the anchor lists and the runtime warning;
  - the `disableContinuation` row names `test/message-thread-drift.test.ts` as its alarm;
  - the TypeBox note from the 1.5.0 sweep goes in "Read both changelogs" only if it is not already obvious from `tsc`.
    It is obvious, so the plan's default is not to add it.
- `.pi/skills/anthropic/SKILL.md`: Implementation Guidance's de-fingerprinting bullet mentions both wordings and the runtime warning.

Predicted unchanged, with the claim each rests on:

- `src/request-shaping.ts`: it never names the constants (assessor grep confirmed).
- `test/system-prompt-sections.test.ts`: it tests the parser and uses the old preamble only as opaque text.
- `test/claude-code-version-drift.test.ts`: it reads `CLAUDE_CODE_VERSION` symbolically; it goes green once the pin passes 2.1.322.
- `test/managed-effort-drift.test.ts`: it passed on 1.5.2 in the scratch run.
- `test/billing-version-sync.test.ts`, `test/version-rejection.test.ts`, and `test/claude-code-version.test.ts`: every hardcoded version there is an override, a fixture user-agent, or a comparison literal, never "just above the pin".
- `README.md`: the `2.1.280` examples are illustrative (see Non-Goals).

## Test Impact Analysis

1. Newly possible:
   - real-transport coverage of the `disableContinuation` opt-out (impossible on pi-ai 1.3.0, which has no threads);
   - per-wording unit coverage of each anchor list entry.
2. Redundant: none.
   The drift test verifies only the installed wording; the hand fixtures are now the sole guard for the <=1.4 entries, which is the residual [#56] tracks.
3. Must stay as-is:
   - `test/oauth-transport.test.ts`'s `disableContinuation` cases, which pin the wrapper's options shape (OAuth only, overriding a caller's `false`);
   - the existing <=1.4 `request-shaping` fixtures.

## Invariants at risk

- **Byte-exact preservation of non-Pi sections** (Issue #67's section-aware sanitizer).
  Pinned by `upstream-prompt-drift`'s section-path test (addendum, project context, cwd survive) and `system-prompt-shaping`'s "preserves rules, addendum, project context, skills, and cwd verbatim".
  Both now run for both wordings.
  The prototype diff showed only the three intended edits.
- **The <=1.4 output is unchanged** (users on pi 0.86–1.4).
  Pinned by running the existing legacy-wording tests unmodified through the tidy step, then over `PI_WORDING_1_4` after the fix.
- **API-key requests keep pi's threads** (Issue [#86]'s OAuth-only opt-out).
  Today it is pinned only at the options level in `test/oauth-transport.test.ts`; the new alarm adds an API-key case against the real transport.
- **The new warning never fires on a supported Pi.**
  Pinned by the drift test's zero-warning assertion through `shapeSystemBlocks` on the installed 1.5.2, and by the `PI_WORDING_1_4` `shapeSystemBlocks` case.
- **Per-message effort messages survive** (PR #79): `test/managed-effort-drift.test.ts`, green on 1.5.2 in the scratch run.

## TDD Order

1. **Parameterize the hand-built Pi prompt fixture by wording** (Tidy-First, prepares step 4).
   - Friction: the <=1.4 wording is baked into `pi086Prompt()`, `PI_086_TOOLS_BODY`, `PI_086_DOCS_BODY`, `assertPreambleReplaced`, and three regexes.
   - Changes:
     - add `PiPromptWording` and `PI_WORDING_1_4` to `test/system-prompt-fixture-parts.ts`;
     - give the prompt and body builders a `wording` argument defaulting to `PI_WORDING_1_4`;
     - have the wording-sensitive assertions take the wording;
     - rename to version-neutral names (`piPrompt`, `piToolsBody`, `piDocsBody`).
   - No behavior change: the same test count (246), all green.
   - Mutation check: none (a pure test refactor).
   - Commit: `test: parameterize the hand-built Pi prompt fixture by wording`.
2. **Plain JSON Schema tools in the ordering experiment** (Tidy-First, prepares step 7).
   - Replace `Type.Object({ filePath: Type.String() })` with `{ type: "object", properties: { filePath: { type: "string" } }, required: ["filePath"] }` (and likewise `pattern`), then drop `Type` from the import.
   - Verify `pnpm test test/pi-anthropic-ordering-experiment.test.ts && pnpm run check` on 1.3.0.
   - Commit: `test: build the ordering experiment's tool schemas as plain JSON Schema`.
3. **Name the `shapeSystemBlocks` gate** (Tidy-First, prepares step 5).
   - Extract `containsPiPreamble(text)` (still the single constant at this point) so the warning step adds a branch instead of growing the inline condition.
   - Existing `shapeSystemBlocks` tests stay green.
   - Commit: `refactor: name the Pi-preamble gate in shapeSystemBlocks`.
4. **Shape both wordings.**
   - Red tests:
     - add `PI_WORDING_1_5` to the fixture parts;
     - wrap the preamble, docs, filler, tag-balance, and well-formed-fixture tests in a `describe` per wording;
     - add a `shapeSystemBlocks` case where a 1.5-wording block is shaped;
     - add `request-shaping` cases for 1.5-wording mid-conversation `docs` (dropped) and `tools` (filler stripped) updates.
   - All 1.5 cases red; all 1.4 cases are invariant pins.
   - Green:
     - the three lists in `src/constants.ts`;
     - `.some` in `decideSection` and `containsPiPreamble`;
     - `removeParagraphContaining` over a list;
     - update `test/upstream-prompt-drift.test.ts`'s imports and assertions to the lists and wording-agnostic patterns (it stays green on 1.3.0 through the <=1.4 entries).
   - Killing mutations:
     - delete the 1.5 entry from `PI_DEFAULT_PROMPT_PREFIXES`: the 1.5 preamble test and the 1.5 `shapeSystemBlocks` case go red;
     - delete the <=1.4 entry: the 1.4 preamble tests go red;
     - delete the 1.5 entry from `PI_DOCS_SECTION_ANCHORS`: the 1.5 docs test and the 1.5 mid-conversation docs update go red;
     - delete the 1.5 entry from `PI_TOOLS_FILLER_ANCHORS`: the 1.5 filler test and the 1.5 mid-conversation tools update go red;
     - make `removeParagraphContaining` use only `anchors[0]`: the 1.4 filler tests go red.
   - Commit: `fix: strip Pi 1.5's reworded identity, docs, and tool filler from OAuth prompts`.
5. **Warn on an unrecognized preamble.**
   - Red tests, in a `describe("shapeSystemBlocks")`:
     1. A block with an unknown preamble plus `tools`, `rules`, and `docs` is returned unchanged, and two calls emit exactly one warning naming `PI_DEFAULT_PROMPT_PREFIXES`.
     2. A custom preamble with only `tools` and `rules` (the pi-permission-system shape) is unchanged, with no warning.
     3. The Claude Code identity block gives no warning.
     4. A `PI_WORDING_1_4` default prompt gives no warning.
   - In `test/upstream-prompt-drift.test.ts`, shape through `shapeSystemBlocks([{ type: "text", text }])` and assert `console.warn` was never called.
   - Green: `warnIfPiPromptUnrecognized` and its latch, set on emit, read before emitting, and cleared by `_resetShapingWarnings`.
   - Killing mutations:
     - delete the `warnIfPiPromptUnrecognized` call: test (1) goes red;
     - change `every` to `some` over `PI_OWNED_SECTIONS`: test (2) goes red;
     - remove the latch check: test (1) goes red (two warnings);
     - remove the latch reset from `_resetShapingWarnings`: a second test that expects a warning goes red (order-dependent, so give test (1) a sibling that also expects one warning).
   - Commit: `feat: warn when Pi's default prompt opens with a preamble shaping does not recognize`.
6. **Raise the pin.**
   - Re-read `npm view @anthropic-ai/claude-code dist-tags` and set `CLAUDE_CODE_VERSION` to `latest` (2.1.323 at planning; must be >= 2.1.322).
   - No new test: the existing floor test stays green, and `claude-code-version-drift` reds without it after step 7 (measured in the scratch run).
   - Live check: one `pi -ne -e ./src/index.ts --model anthropic/claude-haiku-4-5 -p "reply with exactly: PONG"` on the operator's pi returns `PONG`.
   - Commit: `fix: report Claude Code 2.1.323 in the OAuth billing header`, with the subject naming the version actually set.
7. **Bump the Pi devDeps.**
   - `pnpm add -D @earendil-works/pi-ai@1.5.2 @earendil-works/pi-coding-agent@1.5.2`.
   - Confirm `git diff package.json` touches only those two lines.
   - Run `pnpm run lint`, `pnpm run check`, and `pnpm test`: all green, 246 + new tests.
   - Run the live repro from AGENTS.md (`-ne -e src/index.ts`) to confirm loading under jiti.
   - Commit: `chore: bump pi-ai and pi-coding-agent devDependencies to 1.5.2`, with `pnpm-lock.yaml` in the same commit.
8. **Drop the local `MessageThreadOptOut` type.**
   - Type `MESSAGE_THREAD_OPT_OUT` as `Pick<SimpleStreamOptions, "disableContinuation">`, remove the export, and update `test/oauth-transport.test.ts`'s import and three uses in the same commit.
   - Type-only, so `pnpm run check && pnpm test test/oauth-transport.test.ts`.
   - Probe: temporarily rename the key to `disableContinuations` and confirm `tsc` rejects it.
     That rejection is the compile-time alarm this step buys.
   - Commit: `refactor: type the message-thread opt-out with pi-ai's own option`.
9. **Real-transport thread alarm.**
   - New `test/message-thread-drift.test.ts`, three tests:
     1. Control (an invariant pin; it proves the fixture reaches the thread path): pi's bare transport with an OAuth stub sends turn 2 as `thread: { type: "continue", previous_message_id: "msg_1" }` with no `system`.
     2. Through `createAnthropicOAuthStreamSimple` with an `sk-ant-oat` stub, neither turn carries `thread`, and turn 2's `system[0]` contains `BILLING_HEADER_MARKER`.
     3. Through the wrapper with an API-key stub, turn 2 is still a `continue` (the opt-out is OAuth-only).
   - Use a distinct `sessionId` per test.
   - Killing mutations:
     - set `MESSAGE_THREAD_OPT_OUT` to `disableContinuation: false`: test (2) goes red (measured in the spike);
     - spread the opt-out unconditionally (drop the `isOAuthRequest` guard): test (3) goes red.
   - Commit: `test: alarm when Pi's message threads would drop the OAuth billing header`.
10. **Docs.**
    - Update `AGENTS.md`, `docs/architecture.md`, `.pi/skills/upstream-watch/SKILL.md`, and `.pi/skills/anthropic/SKILL.md` as listed in Module-Level Changes.
    - Run `pnpm run lint:md` and `pnpm exec rumdl check .pi`.
    - Commit: `docs: document both Pi prompt wordings, the preamble warning, and the thread alarm`.

## Risks and Mitigations

- **A future wording overlaps an old anchor and shapes the wrong paragraph.**
  The filler anchor matches only inside Pi's `tools` section, and the docs anchor only inside a section named `docs`, as today.
  The test "keeps the filler sentence when an extension quotes it downstream" stays.
- **The warning fires spuriously in some stack.**
  It requires all three Pi-owned section names under a non-Pi preamble.
  pi-permission-system, the one known writer of Pi-owned names under a custom prompt, writes two of them.
  The warning is latched once per process and changes no output.
- **The pin moves again before implementation.**
  Step 6 re-reads `npm view` rather than trusting this plan's number.
- **The devDep bump pulls other devDeps forward.**
  The scratch `pnpm add` of exact versions changed only the two Pi entries plus transitive lockfile entries.
  Step 7 still runs `pnpm run lint`, per AGENTS.md.
- **pi-ai's module-global thread state leaks between tests.**
  Each test uses a unique `sessionId`.
- **The <=1.4 entries are no longer verified against a real Pi.**
  The text is frozen in released tags, and the hand fixtures were verified against 0.86.0 when written.
  Floor-version CI is [#56].

## Open Questions

- Whether `/anthropic-auth:status` should surface the unrecognized-preamble state as well as stderr.
  Defer until a user reports missing the warning.

[#56]: https://github.com/gotgenes/pi-anthropic-auth/issues/56
[#69]: https://github.com/gotgenes/pi-anthropic-auth/issues/69
[#74]: https://github.com/gotgenes/pi-anthropic-auth/issues/74
[#86]: https://github.com/gotgenes/pi-anthropic-auth/issues/86
[#90]: https://github.com/gotgenes/pi-anthropic-auth/issues/90
