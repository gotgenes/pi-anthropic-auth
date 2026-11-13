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
