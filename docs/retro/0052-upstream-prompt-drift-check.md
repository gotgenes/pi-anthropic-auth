---
issue: 52
issue_title: "Verify PI_DEFAULT_PROMPT_TERMINATOR against the installed pi at build time, not at request time"
---

# Retro: #52 — Verify the preamble anchors against the installed pi at build time

## Stage: Planning (2026-08-17T20:43:00Z)

### Session summary

Planned the build-time drift check for the five constants `src/system-prompt-shaping.ts` copies out of pi's default system prompt.
Spiked the upstream import, the resolver behavior, and two candidate designs before writing anything, then wrote `docs/plans/0052-upstream-prompt-drift-check.md` with three commit cycles and filed one follow-up issue ([#56]).
The plan touches no file under `src/` — it is a test-and-docs change that adds an earlier signal without replacing the existing request-time `console.warn`.

### Observations

- The decisive finding was a negative one, and it inverted an option the issue implied.
  I spiked replacing the hand-written `PI_UPSTREAM_SYSTEM_PROMPT` fixture with a generated `buildSystemPrompt` call, on the theory that a generated fixture cannot rot.
  It cannot — but it also catches nothing.
  Since [#47] landed, the terminator-miss fallback sanitizes the whole remainder with the same anchors, and for a generated prompt no appended section contains an anchor, so shaped output is byte-identical whether the terminator matches or not.
  The only observable difference is the warning.
  That is why the plan asserts the constants against upstream directly rather than letting the check fall out of shaping assertions.
- The skill's own instructions were wrong and the spike caught it.
  `.pi/skills/anthropic/SKILL.md` line 90 tells you to import `buildSystemPrompt` from the bare specifier `@earendil-works/pi-coding-agent/dist/core/system-prompt.js`.
  That fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` under Node and with a `builtin:vite-resolve` error under vitest — the package `exports` map declares only `.`, `./rpc-entry`, and `./client`.
  A relative path bypasses the map in both.
  Corrected in the plan as a doc change rather than left for the implementer to rediscover.
- Ran `pnpm run check` and `pnpm run lint` against a throwaway spike file before committing to the import strategy, not after.
  `tsc` accepts the deep relative import (the sibling `.d.ts` resolves under `moduleResolution: "Bundler"`); Biome's only complaint was import ordering, which the plan records so the implementer does not treat it as a blocker.
- The issue framed the deep import as needing "the same care as `src/host-transport.ts`."
  It does not, and the plan says why: `host-transport` has to survive pi's `jiti` alias and virtual-module maps, which is what forces a bare `/compat` specifier there.
  This test runs under vitest only and never under pi's loader, so a filesystem path is both correct and simpler.
- Both `ask_user` decisions went to the recommended option — the check rides `pnpm test` as a blocking test, and the hand-written fixture stays.
  The rendered-artifact rule from the [#47] retro was applied: the shaped output of the generated fixture went into the message preceding the widget, not into the widget.
- Decided against generating the fixture for a second reason worth recording: the generated prompt embeds absolute `node_modules/.pnpm/@earendil-works+pi-coding-agent@0.84.0_.../` doc paths, which makes it useless as a readable reference artifact even where it is correct.
- Baseline measured at planning time rather than estimated: 56 tests, 782 ms vitest duration, 2.07 s wall.
  A two-test spike file measured ~40 ms of added time.
  The plan labels the post-change number as estimated, since the final file does not exist yet.
- Filed [#56] for a gap this plan inherits rather than causes: CI runs one job on a frozen lockfile pinned at 0.84.0, so the `>=0.80.8` peer floor is an assertion no build verifies, and the new drift check will only ever verify constants against 0.84.0.
  The [#47] peer-floor review noted this but did not file it.
  The issue includes a kill criterion so it does not become permanent CI cost for no signal.
- Every cycle in this plan is an invariant pin that passes when written, since all five constants currently match.
  The plan requires demonstrating non-vacuity by mutating each constant and recording the observed failure output in the commit body, rather than asserting the tests are meaningful.

## Stage: Implementation — TDD (2026-08-17T20:55:00Z)

### Session summary

Completed all three planned cycles exactly as written: two `test:` commits adding `test/upstream-prompt-drift.test.ts`, then one `docs:` commit for the AGENTS.md carve-out and the `anthropic` skill corrections.
No file under `src/` was touched.
Tests went from 56 to 60 — precisely the plan's predicted count.

### Observations

- The Tidy-First assessor returned **no preparatory commits**, and its reasoning held up.
  It specifically considered extracting `assertPreambleReplaced` from `test/system-prompt-shaping.test.ts` into a shared support module and rejected it: the helper is two assertions, the new file would be its only additional consumer, and the adjacency between the two files is superficial since the new one builds its prompt from `buildSystemPrompt` rather than from the shared `PI_PREAMBLE` fixture.
- Every test in this change passes the moment it is written, so the whole plan is invariant pins rather than red→green.
  Non-vacuity was demonstrated with six independent probes rather than asserted: each of the five constants mutated in turn, plus a sixth where `PI_DEFAULT_PROMPT_TERMINATOR` was set to an *earlier* preamble bullet — present in the output but no longer terminal.
  That sixth probe is the one that proves the `startsWith` boundary assertion is doing work; mutating the constant to something absent only exercises the `indexOf` check.
  All six failure messages are recorded in the commit bodies.
- Deviation (additive): also added `test/upstream-prompt-drift.test.ts` to the `anthropic` skill's Useful References list.
  The plan named only the two prose corrections in that file.
- Deviation (measurement): the plan predicted roughly 820 ms of suite duration from a 782 ms baseline reading.
  The actual is 463 ms against a 455 ms baseline — the planning-time baseline sample was simply a noisy run, and both numbers moved together.
  The test-count prediction (60) was exact.
  The lesson is narrow: a single timing sample is not a baseline, whereas a count is.
- Chose `vi.spyOn(console, "warn")` with `onTestFinished` cleanup over the `try`/`finally` `console.warn` swap the neighbouring `test/system-prompt-shaping.test.ts` uses in four places.
  Both patterns exist in the repo; `onTestFinished` is the one AGENTS.md documents and `test/index-registration.test.ts` already uses for a console spy.
- The `_resetShapingWarnings()` call in the new test is load-bearing rather than ceremonial, and the comment says so: the warning latch is module-global, so a future test added earlier in this file that trips it would silently false-green the fallback assertion.
- Correcting the `anthropic` skill was not cosmetic.
  Its before/after-shaping recipe gave the bare `@earendil-works/pi-coding-agent/dist/core/system-prompt.js` specifier, which cannot work — that subpath is absent from the package's `exports` map, so Node rejects it with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Anyone following the skill literally would have hit a wall.
  Caught at planning time by spiking rather than at implementation time by failing.
- Pre-completion reviewer: **PASS**, no warnings.
  It independently confirmed that the `PI_UPSTREAM_SYSTEM_PROMPT` staleness the issue flagged was already resolved by [#47]'s fixture refresh, so nothing remained to do there.

## Stage: Final Retrospective (2026-08-17T21:05:00Z)

### Session summary

One continuous session took this issue from a self-filed report through planning, three TDD cycles, and a shipped release (`v2.0.5`).
The five preamble constants in `src/constants.ts` are now checked against the installed pi's own `buildSystemPrompt` on every `pnpm test`, and two documentation defects found along the way were corrected.
Every gate passed on the first attempt — Tidy-First returned no preparatory work, the pre-completion reviewer returned PASS, and both CI runs were green — but the ship stage produced the session's one real failure.

### Observations

#### What went well

- Spiking the **rejected** option, not just the chosen one, produced the decisive finding.
  The obvious design was to generate `PI_UPSTREAM_SYSTEM_PROMPT` from `buildSystemPrompt` so it could not rot.
  Building that spike showed it catches nothing: since [#47] the terminator-miss fallback sanitizes the whole remainder with the same anchors, so for a generated prompt the shaped output is byte-identical whether the terminator matches or not.
  A plan written from the issue's framing alone would have shipped a check that verified nothing.
- The non-vacuity protocol earned its cost, and the sixth probe is why.
  Five probes (one per constant) all passed through `indexOf`-style assertions.
  Only the sixth — `PI_DEFAULT_PROMPT_TERMINATOR` set to an *earlier* preamble bullet, present but no longer terminal — exercised the `startsWith` boundary clause.
  The generalizable lesson is one probe per assertion *clause*, not one per input.
- The `anthropic` skill's own debugging recipe was broken and the spike caught it.
  It instructed importing `buildSystemPrompt` from the bare `@earendil-works/pi-coding-agent/dist/core/system-prompt.js`, which cannot resolve — that subpath is absent from the package's `exports` map.
  Anyone following the skill literally would have hit `ERR_PACKAGE_PATH_NOT_EXPORTED`.
  Corrected in `a94c593`.
- Verification ran *earlier* than the workflow requires.
  `pnpm run check` and `pnpm run lint` were run against a throwaway spike file at planning time to validate the import strategy before it was written into the plan, rather than discovering Biome's import-ordering complaint during implementation.

#### What caused friction (agent side)

- `other` (tool-argument composition) — the session's one real failure.
  Composing the `issue_close` comment, I wrote "Implemented in `ad15b606…` and `2a11fb6d`", realized mid-sentence that `2a11fb6d` was a short hash and that the prompt forbids hand-extending one, and then typed the self-correction *into the tool argument* — "Actually, to be safe let me get the second SHA precisely" — and submitted it.
  The near-miss on the SHA rule was caught correctly; the failure was continuing to reason inside an argument instead of aborting the call.
  Self-identified immediately.
  Impact: a draft fragment published as a public comment that also closed the issue, then six recovery tool calls (a corrected comment, two comment-list queries, a failed delete, a successful delete, a verification), and an apology comment now permanently in the thread.
  The root trigger is mechanical and removable: only one of the three SHAs had been resolved before drafting began.
- `missing-context` — used `repos/{owner}/{repo}/issues/{number}/comments/{id}` to delete the stray comment; GitHub's actual route is `repos/{owner}/{repo}/issues/comments/{id}`, so it 404'd.
  Impact: two extra tool calls, no rework.
- `other` (fabricated data) — the Planning and TDD stage headers were stamped `2026-08-18T13:55Z` and `2026-08-18T14:05Z`.
  Both are wrong: `date -u` was never run, so the local wall-clock hour was written with a `Z` suffix and the date was off by a day.
  Git records the real commits at `2026-08-17T20:43Z`–`20:55Z`.
  Caught only at retro time, one stage late.
  Impact: two committed files carried a wrong timestamp until this commit corrected them.
- `other` (measurement) — the plan predicted ~820 ms of suite duration from a single 782 ms baseline reading; the actual was 463 ms against a 455 ms baseline.
  Both numbers moved together, so the prediction was directionally fine and nothing depended on it, but a sub-second suite varies far too much for one sample to be a baseline.
  Impact: a wrong number in a committed plan, no rework.
  The test-count prediction from the same plan (60) was exact.

#### What caused friction (user side)

- Nothing to report.
  The operator ran the four stage prompts back-to-back without intervention, which is the correct posture when every gate is passing — and the one failure that did occur was self-identified and self-repaired before it reached them.
  The only observation worth surfacing is a routing one, in Diagnostic details below: the stage that failed was the stage running the cheaper model, and the specific step that failed was the only prose-composition step inside an otherwise mechanical checklist.

### Diagnostic details

1. **Model-performance correlation** — one finding, weakly evidenced but worth watching.
   Planning and TDD ran on `anthropic/claude-opus-5` (judgment-heavy: a rejected-option spike, a negative result that inverted the issue's framing, designing the six-probe protocol) — appropriate, and clean.
   Ship ran on `anthropic/claude-sonnet-5` — appropriate for a checklist, and it handled the non-obvious branches correctly (`merge_state: UNSTABLE` with an empty `statusCheckRollup`, the `gh pr merge --rebase` fallback).
   But the session's only real error landed there, on the one ship step that requires composing prose rather than running a command.
   The [#47] retro recorded the same routing with no errors, so this is `n=2` with one failure — not a conclusion, and not a reason to change routing.
   The actionable response is to make that step mechanical (resolve all SHAs first), not to move it to a larger model.
   Both subagents ran on their `.pi/agents/` frontmatter pin, `anthropic/claude-sonnet-4-6`, and both produced real judgment: the Tidy-First assessor explicitly considered and rejected extracting `assertPreambleReplaced`, and the pre-completion reviewer independently verified that the fixture staleness the issue flagged was already resolved by [#47].
2. **Escalation-delay tracking** — no sequence exceeded the five-call threshold.
   The longest same-topic run was four calls cleaning up the stray comment, which is bounded recovery rather than strategy thrash.
3. **Unused-tool detection** — one gap.
   The 404 on the delete-comment endpoint was a documented-API question, and `web_search` was available and never used; guessing the route cost two calls where one lookup would have cost one.
   `colgrep` going unused was correct — every search targeted an exact known symbol (`PI_DEFAULT_PROMPT_TERMINATOR`, `buildSystemPrompt`, `onTestFinished`), which the `colgrep` skill's own decision table assigns to grep.
   `Explore` was correctly not dispatched: the issue supplied named files and a numbered source trace, which the `/plan-issue` prompt explicitly excludes from the Explore-dispatch rule.
4. **Feedback-loop gap analysis** — no gaps; verification was front-loaded rather than end-loaded.
   `pnpm run check` and `pnpm run lint` ran against a disposable spike at planning time, before the import strategy was committed to the plan.
   During implementation the affected test file ran after every edit, the full suite plus `check` and `lint` ran before each commit, and `fallow:dead-code` was verified at both the baseline and the final gate.

### Changes made

1. `.pi/prompts/ship-issue.md` — appended two rules to the "Implemented in <sha>" bullet in step 5: resolve every SHA the comment will cite before drafting any of it, and abort a tool call whose argument turns out wrong rather than revising inside it.
   The prompt already covered SHA *correctness* in two places; what it lacked was ordering, which is what actually failed.
2. `.pi/prompts/plan-issue.md` — appended two sentences to the quantitative-invariant bullet: take the median of three runs for a timing baseline, and note that counts need only one run.
3. `.pi/skills/testing/SKILL.md` — appended two sentences to the "invariant pin or a broken probe" bullet under § Test assertions, giving the mutation procedure and the one-probe-per-clause rule the bullet previously left unstated.
4. `docs/retro/0052-upstream-prompt-drift-check.md` — corrected the Planning and TDD stage timestamps from the fabricated `2026-08-18T13:55Z` / `14:05Z` to the git-verified `2026-08-17T20:43Z` / `20:55Z`, and added this Final Retrospective entry.

All three prompt and skill edits were tightened under the Step 7 verbosity check before landing — each dropped a rationale clause that belongs here rather than in the rule.

[#47]: https://github.com/gotgenes/pi-anthropic-auth/issues/47
[#56]: https://github.com/gotgenes/pi-anthropic-auth/issues/56
