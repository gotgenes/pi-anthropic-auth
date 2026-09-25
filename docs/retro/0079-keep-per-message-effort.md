---
issue: 79
issue_title: "fix: keep Pi's per-message effort on Opus 5.5, Opus 5, and Fable 5.1"
pr: 79
---

# PR #79: keep Pi's per-message effort on Opus 5.5, Opus 5, and Fable 5.1

## Stage: PR Review (2026-09-24T18:06:19Z)

### Session summary

PR #79 from @AizenvoltPrime keeps content-less `role: "system"` messages that carry `output_config`, which `shapeSystemRoleMessages` drops on every OAuth request, so the effort chosen on managed-effort models (Fable 5.1, Opus 5, Opus 5.5) silently never reaches Anthropic.
The defect is real, has shipped since v3.0.0, and was reproduced offline and live on current `main`.
The operator chose to adopt the PR mostly as-is, keeping its `output_config` predicate, and to add follow-ups as commits pushed directly to the PR branch (`maintainerCanModify: true`).

### Evaluation

Verify gate (all against current `main`, `2fe3355`):

1. Upstream shape confirmed in the `~/development/pi/pi` clone: `insertThinkingLevelMessages` in `packages/ai/src/api/anthropic-messages.ts` (commit `4e69b0c28`, first in v0.85.0) pins top-level `output_config.effort` to `"high"` for `compat.supportsMidConvoEffort` models and emits `{ role: "system", content: [], output_config: { effort } }` before each historical assistant turn and at the tail.
   The installed pi-ai 0.86.0 catalog sets that flag on `claude-fable-5-1`.
2. Offline repro: a scratch test drove `anthropicMessagesApi().streamSimple` wrapped in `createAnthropicOAuthStreamSimple` for `claude-fable-5-1` with `reasoning: "low"` and a capturing `fetch`.
   Pi alone sent `messages: [user, system{content:[], effort:low}]`; with the extension, `messages: [user]`.
   The scratch file was deleted.
3. Live repro, pi 0.87.1, `--thinking low`, `PI_ANTHROPIC_AUTH_DEBUG=all`, `-ne`: `main` logged `systemMessagesBefore: 1`, `systemMessagesAfter: 0`; the PR branch logged `1 → 1` and Anthropic answered `PONG` (200), so the OAuth path accepts the empty-content effort message.
4. Boundary: the drop happens in `shapeSystemRoleMessages` (`src/request-shaping.ts`), added in `2817a54` for Issue #69 and first released in v3.0.0.
   The PR patches exactly that line.
5. Regression direction: messages our shaping empties that carry nothing else are still dropped; API-key requests never reach shaping.
   No degradation found.

Checks on the PR branch: `pnpm run check`, `pnpm run lint` clean, `pnpm test` 159/159.
Merged onto current `main` (the PR base `857b976` lags it by the #70/#53 work): 196/196, no conflicts.
Both new tests in `test/request-shaping.test.ts` fail with `main`'s `src/request-shaping.ts` restored.

Design: right-sized — a three-line predicate change at the exact boundary, with a doc-comment note and two focused tests.
The `output_config !== undefined` predicate names Pi's actual shape; the more general "any field besides `role`/`content`" rule was considered and not chosen.
Behavior: restores Pi's own request shape, so `fix:`, not breaking.
Surface: no token or auth handling touched.

What is stale around it: the `shapeSystemRoleMessages` docstring still asserts "Anthropic rejects an empty `content` array", which is now only true of messages without `output_config`; and `docs/architecture.md` "What the wrapper does" item 2 does not mention that effort-carrying system messages survive shaping.

### Decision and attribution

Direction: adopt the PR mostly as-is, keeping its `output_config` predicate.
Follow-ups, pushed as our own commits to the PR branch `AizenvoltPrime:fix/keep-per-message-effort` (fall back to follow-up commits on `main` if the push is refused):

1. Correct the empty-`content` claim in the `shapeSystemRoleMessages` docstring.
2. Note in `docs/architecture.md` (and the matching `AGENTS.md` Current Status item 5, if it reads as incomplete) that effort-carrying system messages survive shaping.
3. Add an offline drift test that drives Pi's own transport for a `supportsMidConvoEffort` model through the wrapper and asserts the `output_config` system messages survive — a third sanctioned exception to the no-Pi-internals test rule, to be listed beside `test/upstream-prompt-drift.test.ts` and `test/claude-code-version-drift.test.ts` in `AGENTS.md` Testing Guidance.
4. Any further design improvements to production code or tests are welcome.

Non-goals: generalizing the keep rule beyond `output_config`; touching top-level `output_config`.

Attribution: every follow-up commit carries the trailer (blank line before it, at the end of the body):

```text
Co-authored-by: AizenvoltPrime <alex11737@gmail.com>
```

The PR close/merge comment thanks @AizenvoltPrime by name and links the implementing SHA(s).
Reference the PR as `Refs #79` / `(#79)`, never `Closes #79`.

## Stage: Implementation — TDD (2026-09-24T18:38:45Z)

### Session summary

Rebased the contributor's commit onto `main` (`a741507` → `65b14d2`, authorship kept), wrote a short plan inline (`docs/plans/0079-keep-per-message-effort.md`) since the PR review skipped `/plan-issue`, and completed its three follow-up steps: the drift suite, the `carriesEffort` refactor, and the docs.
Tests went from 196 (rebased baseline, already including the contributor's two) to 199.
Pre-completion reviewer: PASS.

### Observations

- `/tdd-plan` with no argument picked the newest plan, `0053-*`, which had already shipped; the adopt-as-is path in `/pr-review` produces no plan, so the operator chose to have one written inline before executing.
- The operator chose to rebase the PR branch onto `main` rather than merge, keeping history linear; `/ship-issue` must force-push `pr-79` to `AizenvoltPrime:fix/keep-per-message-effort` (`maintainerCanModify: true`) before merging.
  The branch also carries the triage commit `6138bbb` and the plan commit `277a6f1`, which ride along with the PR.
- The `#69` doc comment's "Anthropic rejects an empty `content` array" was never measured: `2817a54` asserted it without a probe, and Pi's own effort messages are accepted with `content: []`.
  The rewrite gives the real reason for the drop (an emptied update has nothing left to say).
- The drift suite passed on arrival because the fix was already in the branch; it was proven by three mutations, each red on a distinct test: removing the keep clause, changing the expected historical effort, and giving the wrapped path an API-key token.
  The last one motivated two vacuous-pass guards in the comparison test (non-empty effort list, billing header present on the shaped body).
- ESLint rejected `String(init?.body)` (`no-base-to-string`) and a redundant `model.api` check in the model finder (`no-unnecessary-condition`); both were fixed before the test commit.
- The upstream-watch row "`messages[]` carries only `user`/`assistant` roles" had been stale since Pi 0.85/0.86; it was replaced alongside the new effort-carrier row.
- Live re-check on the rebased tree (pi 0.87.1, `claude-fable-5-1`, `--thinking low`): `systemMessagesAfter: 1`, `PONG`.
- Reviewer (non-blocking): the plan commit `277a6f1` has no `Co-authored-by` trailer; the three follow-up commits do.

## Stage: Final Retrospective (2026-09-24T22:45:08Z)

### Session summary

One session ran `/pr-review` → `/tdd-plan` → `/ship-issue` on PR #79 from @AizenvoltPrime: the defect was confirmed offline and live, the contributor's fix was adopted unchanged, and three follow-up commits (drift suite, `carriesEffort` refactor, docs) were added on top.
Everything reached `main` by a fast-forward push and shipped as `v3.3.2`; PR #79 was closed with a credit comment rather than merged.
Tests went from 196 to 199.

### Observations

#### What went well

- The Verify-gate probe became the deliverable.
  The PR-review repro (Pi's own `anthropicMessagesApi().streamSimple`, bare and wrapped in `createAnthropicOAuthStreamSimple`, with a throwing capturing `fetch`) was the same shape as `test/claude-code-version-drift.test.ts`, and it turned almost directly into `test/managed-effort-drift.test.ts`.
  Offline repro, live `PI_ANTHROPIC_AUTH_DEBUG=all` counts (`systemMessagesAfter` 0 vs 1), and the drift suite all read the same signal.
- Mutation-proving an invariant pin caught a vacuous pass the design had missed.
  Of the three mutations, giving the wrapped path an API-key token showed the comparison test would pass on an unshaped body; the billing-header and non-empty guards came from that.
- The contributor's fix exposed an unmeasured premise: `2817a54` (#69) asserted "Anthropic rejects an empty `content` array" without a probe, and Pi's own effort messages disprove it.
  This is the #66 pattern again (a cited claim is not a verified one); the existing `AGENTS.md` rule covers it, and the doc comment was corrected.

#### What caused friction (agent side)

- `missing-context` — At the `/tdd-plan` base question I recommended "Rebase onto main" and noted "ship stage force-pushes the fork branch" without checking `.pi/prompts/ship-issue.md`, which says "Never force-push" and already expects adopted PRs to be closed, not merged.
  Impact: a second `ask_user` at ship time, and the operator's original preference ("directly add commits to the PR") was not met: PR #79 shows closed rather than merged.
  Self-identified at ship time.
- `other` (workflow gap) — `/pr-review`'s adopt-as-is handoff ("request changes or proceed to merge") has no path for maintainer follow-up commits: it writes no plan and does not name how the branch lands.
  `/tdd-plan` with no argument then chose the newest plan, `0053-*`, for an issue that had already shipped.
  Impact: one `ask_user` and an inline plan written inside `/tdd-plan`; no rework.
- `instruction-violation` — The TDD-stage retro `Edit` wrote `\u2014` and `\u2192` into its `newText`, despite `AGENTS.md` Editing Conventions item 4.
  The failure mode was double escaping (`\\u2014` in the JSON) rather than a single `\u2014`, which the `src/request-shaping.ts` edit got away with; it recurred twice more in the retro session (this entry, and the `pr-review.md` edit below), after the operator had declined the `AGENTS.md` wording tweak.
  The `Edit`-based repair of the third one took one call, against three for the `perl` repair.
  Self-identified right away with `rg '\\u20'`; impact: one extra `Edit` each time.
- `instruction-violation` — The second repair used `perl` substitutions, which the `edit-tool` skill forbids for exactly this case ("re-edit the region with the character typed literally, never a `perl` substitution").
  The skill was never loaded this session, although the `AGENTS.md` Skill Index maps multi-entry `Edit` batches and scripted substitutions to it.
  Impact: three calls to get the backslash levels right, including one that wrote the wrong number of backslashes.
  Self-identified while checking the repair.
- `missing-context` — In the PR review the scratch test's `console.log` was run with `--silent=false`, which prints nothing; the `testing` skill says to use `--reporter=verbose`, but it was not loaded until `/tdd-plan`.
  Impact: one wasted call.
- `missing-context` — Two small path and lint misses: grepping `packages/ai/src/providers/anthropic-messages.ts` when the `upstream-watch` watchlist names `packages/ai/src/api/anthropic-messages.ts`, and committing the drift suite with `String(init?.body)` and a redundant `model.api` check, which the pre-commit ESLint hook rejected.
  Impact: two extra calls; the commit was retried once with no rework.

#### What caused friction (user side)

- The landing preference ("directly add commits to the PR") arrived as free text on the second question; stating it at the direction question would have put it next to the rebase decision it constrained.
  Opportunity, not a fault: the prompts did not ask for it.

### Diagnostic details

- Model-performance correlation: one subagent, `pre-completion-reviewer` on `anthropic/claude-sonnet-5` (pinned in its frontmatter), about 5.5 minutes and 45 tool uses for a judgment-heavy re-derivation of four invariants.
  A good fit; it caught the one real attribution gap (plan commit without a trailer).
- Feedback-loop gaps: `check` and the single test file ran after every change; `lint` ran only through the pre-commit hook for the drift suite, and that is where its two ESLint errors surfaced.
  Running `pnpm run lint` with the Green check would have caught them one call earlier.

### Changes made

1. `.pi/prompts/pr-review.md`: the adopt-as-is handoff now separates merging (no follow-ups) from follow-up commits, which hand off to `/plan-issue` and land by rebase plus fast-forward, with the PR closed with credit and never force-pushed.
2. `.pi/prompts/tdd-plan.md`: with no argument, the newest plan is used only if its issue is open; otherwise the prompt stops and asks.
3. Declined by the operator: naming the double-escaped `\\uXXXX` form and the `Edit`-not-`perl` repair in `AGENTS.md` Editing Conventions item 4.
   The failure recurred once more after that decision; revisit if it shows up in another session.
