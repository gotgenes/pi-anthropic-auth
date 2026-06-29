---
issue: 40
issue_title: 'Regression since v0.6.5 - Error 400: "You''re out of extra usage" on second model response'
---

# Retro: #40 — Regression since v0.6.5 - Error 400: "You're out of extra usage" on second model response

## Stage: Planning (2026-06-28T23:23:10Z)

### Session summary

Diagnosed the third-party regression (necauqua, pi 0.79.8): the second model turn 400s with "out of extra usage" on extension 0.6.5+, fixed by downgrading to 0.6.3.
After an initial wrong hypothesis (a multi-turn defect in the host transport "fixed" in 0.80.x), an operator nudge to diff the actual pi-ai tags produced the real, code-verified root cause and the chosen fix: raise the peer floor to `>=0.80.0`.
Wrote `docs/plans/0040-raise-host-floor-to-0-80.md` and committed it.

### Observations

- **Root cause (verified across `v0.79.8` and `v0.80.0`):** the only functional change between 0.6.3 and 0.6.5 is `src/host-transport.ts` (#31).
  On 0.79.x the bare-root `streamSimpleAnthropic` is a lazy stub whose first call runs `loadAndRegisterProvider` → `module.register()` → `registerApiProvider(...)`, **clobbering our registered wrapper out of the API registry**.
  Turn 1 still shapes (our `onPayload` is forwarded) but leaves the bare built-in registered; turn 2 reads the registry, gets the bare built-in, skips our billing shaping, and Anthropic returns the 400.
  0.80's `lazyApi` calls `(await load()).streamSimple(...)` directly with no `register()` side effect, so the wrapper survives — which is why the floor bump fixes it.
- **The transport bodies are equivalent.** Diffing `providers/anthropic.ts` (0.79.8) vs `api/anthropic-messages.ts` (0.80.0) shows the OAuth `buildParams` path is the same; the defect is purely the lazy-registration wrapper's side effect, not request shaping.
- **`#28` was incomplete on 0.79.x.** "Resolve the delegate directly to avoid the clobber" does not help, because the clobber fires through the delegate's own first call regardless of how it was resolved. The plan re-scopes the docs: direct resolution is now for recursion-avoidance only; the clobber is closed by the floor.
- **Peer floor was never raised** — it stayed `>=0.79.1` since the 0.79.1 base; #31/#33 intentionally avoided a bump. 0.6.3 only worked by accident, resolving the extension's own co-installed (newer 0.80.x) pi-ai via `import.meta.resolve`.
- **Decisions:** operator chose to raise the floor to `>=0.80.0` (breaking, drops pi 0.79.x; commit `fix!:` with `BREAKING CHANGE:`), plan from the static root cause, and enumerate what the floor lets us drop.
  Kept reading the (now-`@deprecated`-on-0.80) `streamSimpleAnthropic` alias for a surgical fix; deferred switching to `anthropicMessagesApi().streamSimple` as an Open Question.
- **Process note:** the operator's "just double check the code at both tags" was the decisive correction — static greps looked identical, but the full diff plus reading 0.79.8's `register-builtins.ts` exposed the `register()` clobber. Check the tag source before trusting a version-difference hypothesis.
- Routed to `/build-plan` (config + docs + live-repro gate, no new unit-test surface).

## Stage: Implementation — Build (2026-06-29T00:00:37Z)

### Session summary

Executed all 4 plan steps: bumped peer floor and dev pins to >=0.80.0/0.80.2, updated three test files to the 0.80.x API split, confirmed multi-turn live repro passes with no 400, and cleaned up all dual-version and stale clobber-rationale prose in `src/`, `AGENTS.md`, and `docs/architecture.md`.
Pre-completion reviewer returned PASS.

### Observations

- **Plan deviation (step 1 test updates):** the plan said "no assertion changes" for `test/host-transport.test.ts`, but the 0.80.x root barrel no longer exports `streamSimpleAnthropic`, so the integration test calling `resolveBuiltinAnthropicStreamSimple()` directly was replaced with a compat-import test that mirrors the actual host runtime resolution path.
  This was an incorrect assumption in the plan's Test Impact Analysis.
- **API changes in 0.80.x devDep:** `clearApiProviders` is private in compat (replaced with `resetApiProviders`); `getModel` is deprecated (replaced with `getBuiltinModel` from `@earendil-works/pi-ai/providers/all`); `streamSimple`/`getApiProvider`/`registerApiProvider`/`resetApiProviders` moved from root barrel to `/compat`.
- **Grep sweep:** confirmed no residual `0.79`/`dist/index.js`/`both export`/`no peer-floor bump` prose in live docs or src.
  Historical references in plan/retro files and test simulation comments were intentionally left.
- **Live repro:** operator confirmed two-turn session (hello/ping) on a 0.80.x host passed with no "out of extra usage" 400 on the second turn.
- Pre-completion reviewer: PASS.

## Stage: Final Retrospective (2026-06-29T00:20:59Z)

### Session summary

Shipped issue #40 end-to-end across Planning, Build, and Ship as `v1.0.0` (major bump from a `fix!:` / `BREAKING CHANGE:`): raised the pi-ai / pi-coding-agent peer floor to `>=0.80.0` to close the 0.79.x lazy-stub `register()` clobber that displaced the shaping wrapper on the second turn.
The diagnosis was initially wrong (a hypothesised multi-turn transport defect) and was corrected only after the operator pushed for a full source diff at both release tags, which exposed the real `register()`-clobber mechanism.

### Observations

#### What went well

- Clean recovery once redirected: a single full `diff` of `v0.79.8` vs `v0.80.0` source (turns 37-39) exposed the `register()` clobber, and the corrected diagnosis then held unchanged through the live repro, the pre-completion reviewer PASS, and the `v1.0.0` release.
- Incremental verification in Build: green baseline -> dep bump -> immediate `pnpm run check`/`pnpm test` caught the 0.80.x API split instantly (turn 60), then re-verified after each fix and ran lint after each edit. No end-only verification, no wrong commit landed.

#### What caused friction (agent side)

- `instruction-violation` (user-caught) / `missing-context` — During Planning, formed and wrote the *entire* plan (turn 31) around a version-difference hypothesis ("0.79.x transport has a multi-turn defect fixed in 0.80.x") without diffing the actual tag source; extrapolated from the installed 0.79.1 dev copy and eyeball greps that "looked identical."
  This violated the existing `AGENTS.md` gotcha "do not extrapolate from the installed host."
  Impact: operator had to nudge four times (turns 7, 11, 16, 32); after the decisive "check both tags" nudge, 5 `Edit` calls (turns 40-44) rewrote the plan's Background / Goals / Design / Risks / Open-Questions before the commit. Caught pre-commit, but substantial rework.
- `missing-context` — The plan's Test Impact Analysis asserted "the test surface barely moves" and "no assertion changes" for `test/host-transport.test.ts`, reasoning from the host *source tree* (`packages/ai/src`) rather than the published 0.80.2 *dist exports* the devDep resolves.
  In Build the 0.80.x root barrel had dropped `streamSimpleAnthropic`, made `clearApiProviders` private, deprecated `getModel`, and moved registry functions to `/compat`.
  Impact: ~10 investigation tool calls (turns 61-78) to map root vs compat exports and rewrites across 3 test files; caught immediately by the bump-then-verify feedback loop, so no wrong commit.

#### What caused friction (user side)

- The operator's progressive hints (0.79.8 version -> compat.ts -> peer-floor question -> "check both tags") were appropriate scaffolding, not withheld context.
  The opportunity is agent-side: after the first version-specific hint (turn 7), the agent should have escalated straight to a full tag diff rather than continuing ~20 sequential greps that "looked identical."

### Diagnostic details

- **Model-performance correlation:** Planning and Retro ran under `claude-opus-4-8` (judgment-heavy: root-cause diagnosis, the `ask_user` architecture decision, plan synthesis); Build and Ship ran under `claude-sonnet-4-6` (mechanical: dep bump, test/doc edits, push/CI/merge).
  The `pre-completion-reviewer` subagent (turn 106) returned a thorough PASS.
  Allocation was clean — no reasoning-weak-on-judgment or high-cost-on-mechanical mismatch.
- **Escalation-delay:** the wrong-hypothesis stretch ran from turn 8 to the turn-32 nudge — roughly 20 sequential bash greps on the same version-difference approach, including an explicit "looks identical at a glance" (turn 35) before the full diff at turn 37. Well past the 5-call threshold for changing strategy.
- **Unused-tool:** the two-tag transport comparison was parallelizable — an `Explore` subagent over `~/development/pi/pi` at both tags could have produced the diff in one dispatch instead of ~20 in-thread greps.
- **Feedback-loop:** no gap — verification ran incrementally throughout Build, not just at the end.

### Follow-up (not landed)

- **Dependency-bump import probe (P2):** when a plan bumps a dependency's version, probe the new version's *actual published exports* for every symbol the codebase imports from it (across `src/` and `test/`), not just the symbol the fix touches — reasoning from the host source tree under-predicted the 0.80.x dist API split.
  Home would be the shared `.pi/prompts/plan-issue.md` Test Impact Analysis section; deferred because Build's bump-then-verify loop already catches it cleanly and the prompt is synced from `pi-packages`.
  If this recurs across packages, open an issue and run `/plan-issue` on the shared prompt change.

### Changes made

1. `docs/retro/0040-raise-host-floor-to-0-80.md` — added the Final Retrospective stage entry (this section), including diagnostic details and the P2 follow-up note.
2. `AGENTS.md` — added the "Diagnose Version Regressions From The Tag Source" gotcha after "Verify Each Loader Mode" (Proposal 1).
