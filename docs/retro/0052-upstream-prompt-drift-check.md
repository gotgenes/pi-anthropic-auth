---
issue: 52
issue_title: "Verify PI_DEFAULT_PROMPT_TERMINATOR against the installed pi at build time, not at request time"
---

# Retro: #52 — Verify the preamble anchors against the installed pi at build time

## Stage: Planning (2026-08-18T13:55:00Z)

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

## Stage: Implementation — TDD (2026-08-18T14:05:00Z)

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

[#47]: https://github.com/gotgenes/pi-anthropic-auth/issues/47
[#56]: https://github.com/gotgenes/pi-anthropic-auth/issues/56
