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
