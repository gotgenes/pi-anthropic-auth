---
issue: 28
issue_title: "Root cause: pi-ai 0.79.8 lazy provider registration clobbers our streamSimple wrapper (#26)"
---

# Retro: #28 — Fix pi-ai 0.79.8 Lazy Registration Clobbering Our `streamSimple` Wrapper

## Stage: Planning (2026-06-19T00:00:00Z)

### Session summary

Investigated the pi-ai 0.79.7→0.79.8 diff in `~/development/pi/pi`, traced the regression to the lazy provider registration change ([#5348](https://github.com/earendil-works/pi/pull/5348)), and wrote `docs/plans/0028-lazy-registration-clobber.md` committing to the direct-import fix direction.
Verified the `@earendil-works/pi-ai/anthropic` subpath exports the real `streamSimpleAnthropic` across the whole supported range (0.79.1, 0.79.7, 0.79.8), so the fix needs no peer dependency bump and is non-breaking.

### Observations

- Root cause: 0.79.8 registers a lazy stub for `anthropic-messages` whose first call runs `anthropic.ts`'s new `register()`, and `registerApiProvider` is a `Map.set` overwrite.
  Our wrapper captures that stub at load and delegates to it, so the first call clobbers our registry entry; the second and later calls resolve the bare built-in with no `onPayload` shaping → Anthropic 400 "extra usage".
- Chosen fix (confirmed with operator via `ask_user`): import `streamSimpleAnthropic` directly from `@earendil-works/pi-ai/anthropic` as the delegate, instead of capturing `getApiProvider("anthropic-messages").streamSimple`.
  The wrapper stays registered (preserving Issue [#18] coverage of compaction and background agents); only the delegate source changes.
- Rejected direction "re-register after lazy load" as racy (async window can leak un-shaped calls); rejected "hybrid direct import + registry fallback" as dead code across the supported range that reintroduces a Law-of-Demeter reach-through.
- The operator asked whether this undoes the prior move to `streamSimple` (Issue [#18]); confirmed it does not — that move was about which registry entry shapes requests (coverage), while this fix is about what the wrapper delegates to (transport source).
- `resetApiProviders()` is called at runtime by `AgentSession.reload()` and `ModelRegistry.refresh()`, but both re-apply our provider config afterward, restoring the wrapper; the only non-restoring overwrite was the lazy stub's first call, which the fix eliminates.
- `docs/architecture.md` line "The wrapper must capture the built-in transport via `getApiProvider("anthropic-messages")` before registering itself" is the assumption 0.79.8 broke and is slated for update in the plan's TDD order.
- PR [#27] (`usesCallbackServer`) is unrelated and does not fix this regression; called out in the issue and the plan's Non-Goals.

## Stage: Implementation — TDD (2026-06-19T00:00:00Z)

### Session summary

Implemented the direct-import fix across 4 TDD cycles (red regression test, fix, JSDoc reword, architecture/skill doc pass) plus 2 review-fixup commits.
Added `test/index-registration.test.ts`, which simulates the pi-ai 0.79.8 lazy-stub clobber against the real pi-ai registry and asserts both the first and second OAuth calls are shaped.
Test count went from 47 to 48 (5 → 6 files); all gates (`check`, `lint`, `test`, `fallow:dead-code`) green.

### Observations

- Deviation from the plan's Test Impact Analysis: the regression test imports registry functions from the root `@earendil-works/pi-ai`, not `@earendil-works/pi-ai/base`.
  The `./base` subpath was only added in 0.79.8 and does not exist in the installed devDependency floor (0.79.1); the root exports the same functions across the whole supported range.
- Deviation from the plan's Module-Level Changes: `src/oauth-transport.ts` changed beyond JSDoc.
  The `createAnthropicOAuthStreamSimple` delegate param was narrowed from the wide `AnthropicStreamSimple` (`Model<Api>`) to `StreamFunction<"anthropic-messages", SimpleStreamOptions>` so the directly-imported `streamSimpleAnthropic` typechecks under function-parameter contravariance.
  The wide return type is preserved so `ProviderConfig.streamSimple` registration still typechecks; a single `model as Model<"anthropic-messages">` downcast inside the wrapper is justified by the registry's `wrapStreamSimple` api guard.
- Deviation from the plan's Step 4 grep scope: `AGENTS.md` (root-level, not under `docs/`) carried two stale registry-capture passages that were reworded in the docs commit.
- The regression test's first draft asserted on the `onPayload` result synchronously; the helper had to be made `async` because `onPayload` returns a Promise — the existing `test/oauth-transport.test.ts` awaits it the same way.
- `onTestFinished` must be called inside the test body, not at describe scope (vitest throws `Hook onTestFinished() can only be called inside a test`).
- Pre-completion reviewer: WARN (no blocking failures), with two findings both addressed in follow-up commits: (1) `docs/architecture.md` Related-files line still said `src/index.ts` "captures the built-in transport" — the Step-4 grep missed it because it searched "capture the built-in" without the trailing `s`; (2) `AnthropicStreamSimpleDelegate` was a speculative export with no external consumer (shielded from fallow by `ignoreExportsUsedInFile: true`) — unexported in a `refactor:` commit.
- `vi.mock("@earendil-works/pi-ai/anthropic")` with a `vi.hoisted` stub is the clean way to fake the built-in transport without network I/O; the lazy-stub simulation mirrors `anthropic.ts`'s `register()` overwrite and `createLazySimpleStream`'s options-forwarding.

[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[#27]: https://github.com/gotgenes/pi-anthropic-auth/pull/27
