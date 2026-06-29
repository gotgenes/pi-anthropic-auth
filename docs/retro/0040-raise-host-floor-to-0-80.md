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
