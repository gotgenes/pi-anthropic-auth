---
issue: 89
issue_title: "Pi 1.5.0 reworded its default prompt, so OAuth shaping passes Pi's whole prompt through unshaped"
---

# Retro: #89 — Pi 1.5.0 reworded its default prompt, so OAuth shaping passes Pi's whole prompt through unshaped

## Stage: Planning (2026-11-13T01:39:03Z)

### Session summary

Planned a 10-step fix:

- anchor lists that match both Pi's <=1.4 and >=1.5 prompt wording;
- a runtime warning for an unrecognized preamble;
- a `CLAUDE_CODE_VERSION` raise, the devDep bump to pi 1.5.2, and removal of the local `MessageThreadOptOut` type;
- a real-transport thread drift alarm.

The operator chose all three gate options: include the thread alarm now, add the runtime warning in this plan, and record the latest-Pi CI canary as a comment on #56 rather than a new issue (posted).

### Observations

- The issue says shaping "takes the degraded passthrough path".
  It is quieter than that: `shapeSystemBlocks` gates on `includes(PI_DEFAULT_PROMPT_PREFIX)`, so on pi 1.5 the prompt block never reaches the parser, and even the existing "no sections" warning stays silent.
- Measured in a scratch worktree (`/tmp/bump89`, devDeps at 1.5.2):
  - the issue's 6 failures reproduced exactly;
  - an anchor-list prototype shaped pi 1.5.2's real prompt from 2271 to 613 bytes;
  - a two-turn thread spike discriminated: the bare transport continues without `system`, the wrapper sends it in full, and `disableContinuation: false` flips the wrapped result.
- Plain JSON Schema tool literals typecheck on the pinned 1.3.0, so the `Type` fix can land before the bump.
- Enumerating other writers of the prompt changed the warning's design.
  pi-permission-system writes `tools` and `rules` under a subagent's custom prompt, so "any Pi-owned section plus an unknown preamble" would false-warn.
  The warning requires all three sections, and the gate itself stays prefix-based so those prompts are not rewritten.
- Pin: npm `latest` is 2.1.323, `stable` is 2.1.311 (below pi 1.5.2's 2.1.322); the plan re-reads `latest` at implementation time.
- Tidy-First assessor: its three Recommended preparatory steps were adopted:
  - the wording-parameterized fixture;
  - the `Type` literals;
  - the named gate predicate.

  Two of its findings corrected the plan: `MessageThreadOptOut` has 4 references, not 3, and the bump alone reds the drift test until the anchors land, which fixed the step order.

## Stage: Implementation — TDD (2026-11-13T02:12:52Z)

### Session summary

All 10 TDD steps ran as planned, as 10 commits (`016ba19`..`e7b129a`): three Tidy-First preparations, the anchor-list fix, the unrecognized-preamble warning, the 2.1.323 pin, the devDep bump to 1.5.2, the SDK-typed opt-out, the thread drift alarm, and docs.
Tests went from 246 to 268 (+22): 11 from the per-wording fixture and mid-conversation cases, 6 from the warning, 3 from the thread alarm, and 2 from `managed-effort-drift` enumerating pi 1.5.2's new `claude-fable-5-2`.

### Observations

- Every killing mutation the plan named went red, as predicted; deleting the 1.5 prefix also reddened the extra 1.5 mid-conversation preamble-update case added beyond the plan.
- The step-8 `tsc` rename probe first ran as a `sed` that matched nothing, because Biome had re-wrapped the constant; `git diff --stat` caught it, and an `Edit`-applied mutation confirmed `TS2561`.
- Live: on pi 1.4.0 the 2.1.323 pin returned `PONG`; on the devDep's pi 1.5.2 (`./node_modules/.bin/pi`), debug output showed the preamble and tools replaced and `docs` dropped, and the request returned `PONG`.
  The devDep's own `pi` binary is a cheap way to run a live repro on a Pi newer than the one installed globally.
- Pre-completion reviewer: WARN.
  On <=1.4 wording, a tool `promptSnippet` containing the new filler sentence "Additional tools may be available." now drops the whole tool-list paragraph, so the plan's "byte-identical on <=1.4" is slightly overstated.
  The old anchor carried the same hazard; accepted as is.
  The reviewer otherwise re-derived, with its own inputs against real 1.3.0 and 1.5.2 builders, that the gate decision is unchanged on <=1.4 and that the warning never fires for a prompt a supported Pi emits by itself.

## Stage: Final Retrospective (2026-11-13T03:08:11Z)

### Session summary

One session took #89 from planning through the v3.5.0 release.
Shaping now matches both Pi wordings, a reworded preamble warns once at runtime, the pin is 2.1.323, devDeps are at pi 1.5.2, and a real-transport alarm pins the message-thread opt-out.
The latest-Pi CI canary was recorded on #56 instead of a new issue.

### Observations

#### What went well

- A planning-time scratch worktree (`/tmp/bump89`) turned every design input into a measurement before the plan was written:
  - it reproduced the issue's 6 failures;
  - an anchor-list prototype shaped the real 1.5.2 prompt from 2271 to 613 bytes;
  - a two-turn thread spike was shown to discriminate by its own killing mutation.

  TDD then hit no surprises: every planned mutation reddened exactly the tests the plan predicted.
- Enumerating the other writers of the system prompt (the `plan-issue` rule) changed the runtime-warning design before it was written.
  `pi-permission-system` writes `tools` and `rules` under a subagent's custom prompt, so the warning requires all three Pi-owned sections, and the gate stays prefix-based.
- The pre-completion re-derivation mandate earned its cost.
  The reviewer bundled base and HEAD with esbuild, fed both its own inputs plus real 1.3.0 and 1.5.2 `buildSystemPrompt` output, and found the one <=1.4 byte-difference the plan's argument had missed (a tool snippet containing the new filler sentence).
- The devDep's own `./node_modules/.bin/pi` (1.5.2) gave a live repro on a Pi newer than the operator's global 1.4.0, with no throwaway install.

#### What caused friction (agent side)

- `other` (mutation not applied) — in TDD step 8 the rename probe ran as a `sed` that matched nothing, because Biome had re-wrapped the constant.
  `git diff --stat` reported 13 changed lines, but those were the step's own uncommitted refactor, so the check the testing skill prescribes could not see the miss.
  It was caught only because the expected `tsc` error did not appear (self-identified).
  Impact: two extra tool calls, no rework.
- `instruction-violation` (self-identified at review, reviewer-caught) — the plan's Goals claimed "on pi <=1.4 the shaped output is byte-identical" from an argument rather than from enumerating the new anchors' inputs.
  `plan-issue` already says an invariant discharged by argument is unproven.
  Impact: none on the code; the plan text overstates, and the close comment states the exception.
- `other` — two format and lint slips surfaced only at commit time: Biome re-wrapping after a scripted `sed` rename, and `no-unnecessary-condition` on `shaped?.text` for a destructured array element.
  Impact: one re-run each, no rework.

#### What caused friction (user side)

- None.
  The operator answered the three-question planning gate in one pass.
  Choosing "add in this plan" for the runtime warning, over the recommended follow-up, widened scope by one step, which landed cleanly.

### Diagnostic details

- **Model-performance correlation** — the main session ran on `claude-opus-5-5`; the `tidy-first-assessor` and `pre-completion-reviewer` ran on `claude-sonnet-5-5` (per their transcripts), appropriate for read-heavy review.
  The reviewer's esbuild-bundle comparison was judgment-heavy and was done well on sonnet.
- **Feedback-loop gap analysis** — `pnpm run check`, the affected test file, and `pnpm run lint` ran inside every TDD step before its commit; no verification was deferred to the end.

### Changes made

1. `.pi/skills/testing/SKILL.md`: the mutation-applied check now diffs against the saved green copy instead of `git diff --stat`, which also counts the step's uncommitted edits.
2. `.pi/skills/pi-cli-repro/SKILL.md`: when the version under test is the devDep pin, run `./node_modules/.bin/pi` instead of a throwaway install.
