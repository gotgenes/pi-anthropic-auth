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

## Stage: Implementation — runtime resolution fix (2026-06-19T00:00:00Z)

### Session summary

The static `import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic"` shipped in the first TDD pass failed at runtime under the real pi loader with `Cannot find module '.../dist/index.js/anthropic'`.
Diagnosed the cause (pi's `jiti` extension loader aliases the bare `@earendil-works/pi-ai` and `@earendil-works/pi-ai/oauth` but not the `./anthropic` subpath, so the subpath import resolves to `dist/index.js/anthropic`), then replaced the static import with a runtime resolver in a new `src/host-transport.ts` that the operator chose over inlining into `oauth-transport.ts`.
`src/index.ts` is now `async` (Pi's `ExtensionFactory` permits `Promise<void>`).
Live `pi -e src/index.ts` repro confirms the extension loads and the wrapper registers; all gates green.

### Observations

- Root cause of the runtime failure: `jiti`'s alias map in `pi-coding-agent/dist/core/extensions/loader.js` has explicit entries for `@earendil-works/pi-ai` and `@earendil-works/pi-ai/oauth` but no entry for `@earendil-works/pi-ai/anthropic`; jiti's prefix-based alias matching turns the subpath into `<root-alias-target>/anthropic` and ignores the package `exports` map.
- A `createRequire`-based fallback was rejected: the CJS resolver does not honor the `exports` "import" condition for the subpath either, and anchoring `createRequire` inside the package triggers package-self-resolution semantics that reject the subpath.
- Working approach (verified with a throwaway probe extension under the real loader): `import.meta.resolve("@earendil-works/pi-ai")` succeeds (jiti-aliased to the host's `dist/index.js`), so derive the package dir and dynamic-import the concrete `dist/providers/anthropic.js` — the same file the `exports` `./anthropic` subpath maps to across both 0.79.1 and 0.79.8.
- `pi-packages` did not have a prior solution for this exact problem — its packages import only the root `@earendil-works/pi-ai` (jiti-aliased) and never a provider subpath; the `./oauth` alias in pi's loader was added specifically for this repo's prior needs.
- The regression test was reworked to mock `#src/host-transport`'s `resolveBuiltinAnthropicStreamSimple` (returning a capturing stub) instead of `@earendil-works/pi-ai/anthropic`, since `src/index.ts` no longer touches the subpath; this isolates the registration-wiring invariant (the #28 concern) from jiti resolution, which only the live loader exercises.
- The mock is typed `Mock<(...Model<Api>...) => AssistantMessageEventStream>` (wide) so the lazy-stub simulation and fake-`pi` calls typecheck, with a structural-satisfaction comment at the resolver-return site; casting to the narrow `StreamFunction<"anthropic-messages">` erased `.mockClear()` and broke `tsc`.
- `.pi/settings.json` was committed (`51e5bf9`) to load the local dev copy via `"../"` and suppress the global `npm:@gotgenes/pi-anthropic-auth` with empty `extensions`/`skills` (dedupe-by-identity, project wins over user); verified against pi's `package-manager.js` (`getPackageIdentity` ignores npm version, `dedupePackages` keeps project scope).
- Pre-completion reviewer was re-run on the runtime-resolution implementation: WARN, one non-blocking finding — `src/host-transport.ts` used `new URL(join(...), "file:///")`, which mishandles path components containing `#`/`?`; switched to `pathToFileURL(join(...))` (commit `27301da`).
- Post-review polish (operator-selected): added `test/host-transport.test.ts` — a happy-path unit test asserting `resolveBuiltinAnthropicStreamSimple` returns a function against the installed pi-ai, closing the coverage gap on the hardcoded `dist/providers/anthropic.js` assumption (the regression test mocks the resolver out, so this is the only automated guard of the resolution logic).
- Post-review polish: hoisted the duplicated `StreamFunction<"anthropic-messages", SimpleStreamOptions>` into a single exported `AnthropicStreamSimpleDelegate` type owned by `src/host-transport.ts` and imported by `src/oauth-transport.ts`.
- Tracked but deferred: the hardcoded `dist/providers/anthropic.js` couples to pi-ai's internal layout; a future-robust resolver could read pi-ai's `package.json` `exports["./anthropic"]` instead, but both supported versions agree and the new happy-path test guards breakage.

## Stage: Final Retrospective (2026-06-19T15:23:27Z)

### Session summary

Diagnosed the pi v0.79.7→0.79.8 regression, filed [#28] as the root-cause companion to [#26], planned and implemented the fix across TDD, runtime-resolution, ship, and close-out stages, and released v0.6.1.
The arc had one significant rework loop (a fix that passed every automated gate but failed under the real pi loader) and one close-out formatting miss.

### Observations

#### What went well

- The live `pi -e` repro plus a throwaway probe extension nailed the jiti root cause empirically (`import.meta.resolve("@earendil-works/pi-ai")` works, the `./anthropic` subpath does not) instead of guessing — turning an opaque `Cannot find module .../dist/index.js/anthropic` into a precise fix.
- The pre-completion reviewer earned its keep twice: it caught the `pathToFileURL` correctness bug and a speculative export, both on judgment-heavy review a mechanical check would have missed.
- Reading pi's own `package-manager.js` before writing `.pi/settings.json` (confirming `getPackageIdentity` ignores npm version and `dedupePackages` lets project scope win) meant the local-override settings worked first try.

#### What caused friction (agent side)

- `missing-context` (feedback-loop gap) — the first TDD pass shipped a static `import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic"` that passed `check`, `lint`, `test` (48/48), and `fallow` but failed at runtime under pi's `jiti` loader; the failure surfaced only when the operator restarted pi.
  Impact: a full second implementation stage — new `src/host-transport.ts`, an `async` factory, a reworked regression test, and four more commits.
  Root cause of the miss: vitest/esbuild honors `exports` subpaths, but pi's `jiti` loader resolves via an alias map that does not; no test or gate exercised the real loader, so loader-specific resolution was never verified before "done."
- `other` (close-out formatting) — the `issue_close` comment for [#26] used literal `\n` escapes, which rendered as backslash-n instead of newlines.
  Impact: a malformed public comment requiring a follow-up; minor, but user-caught.
- `instruction-violation` (self-inflicted process) — when fixing that comment I posted a *new* comment via `gh issue comment` instead of editing the broken one; the operator corrected "we just need to *edit* the comment."
  Impact: a duplicate comment left on [#26]; user-caught.
  Fix for next time: `gh api repos/<owner>/<repo>/issues/<n>/comments/<id> -X PATCH -f body=...` to edit, and pass real newlines (not `\n`) to comment tools.

#### What caused friction (user side)

- The operator restarted pi to load the local extension copy (the right move), which is exactly what exposed the runtime jiti failure that the local gates had hidden — a reminder that the agent should have driven a live-loader smoke test proactively rather than relying on the operator's restart to surface it.

### Diagnostic details

- Feedback-loop gap: verification ran incrementally and well *within* each stage (`check`/`lint`/`test` after every change), but the entire first stage used only the test-runner loader; the real-loader check (`pi -e src/index.ts`) was absent until after the runtime failure.
  This is the single highest-value lesson — for a Pi extension, green local gates do not imply the extension loads under `jiti`.
- Escalation-delay: the jiti diagnosis was methodical (read `loader.js` → test `createRequire` → test `import.meta.resolve` → probe extension), each step progressing; no single-error loop exceeded the 5-call threshold.
- Unused-tool: `web_search`/`librarian` could have described jiti alias behavior, but reading the installed `loader.js` plus an empirical probe was more authoritative; no real miss.
- Model-performance: the session cycled models (`sonnet-4-6`, `opus-4-8`, with `deepseek-v4-flash`/`glm-5.2` transient selections); the two `pre-completion-reviewer` dispatches ran on the default and handled judgment-heavy review well, so no model/task mismatch is flagged.

### Changes made

1. `AGENTS.md` (Testing § Live Pi repro) — added a one-sentence rule: changes to import specifiers, module resolution, or extension registration must pass a live `pi -e` smoke test before done, because green `check`/`lint`/`test` can still fail under pi's `jiti` loader.
2. Proposal P2 (issue-comment mechanics note) was declined; the lesson is recorded in the observations above only.

[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[#26]: https://github.com/gotgenes/pi-anthropic-auth/issues/26
[#27]: https://github.com/gotgenes/pi-anthropic-auth/pull/27
[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
