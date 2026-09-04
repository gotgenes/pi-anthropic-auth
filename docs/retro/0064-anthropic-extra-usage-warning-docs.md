---
issue: 64
issue_title: "Document Pi's Anthropic extra-usage warning and its accuracy limits in the README"
pr: 45
---

# Retro: #64 — Document Pi's Anthropic extra-usage warning and its accuracy limits in the README

## Stage: PR Review (2026-09-05T00:12:00Z)

### Session summary

PR [#45] from @Hmenez3s has the extension write `warnings.anthropicExtraUsage: false` into the user's global Pi settings on every load, to silence Pi's generic Anthropic OAuth extra-usage warning.
The underlying observation is real — the warning fires for any Anthropic OAuth session regardless of whether this extension is loaded, so users read it as evidence that the extension is not working.
The operator's decision is to **decline the mechanism and adopt a docs-only note**, tracked as new Issue #64: the extension must not silently overwrite a billing preference the user owns, especially when the warning remains accurate for the paths our wrapper does not cover.

### Evaluation

#### Verification

The PR body is a claim; I checked the behaviour against current `main` and against the installed pi 0.84.0 before reading the diff for design.

The warning is real and does fire with the extension loaded.
`maybeWarnAboutAnthropicSubscriptionAuth` in `packages/coding-agent/src/modes/interactive/interactive-mode.ts:4855-4882` gates only on `(await this.session.modelRuntime.checkAuth("anthropic"))?.type === "oauth"`.
It has no knowledge of provider registration, so `registerProvider("anthropic", …)` cannot suppress it.
The text (`interactive-mode.ts:239`) is:

> Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at <https://claude.ai/settings/usage>. Disable this warning in `/settings`.

Pi already ships a first-class, user-owned opt-out for exactly this: `warnings.anthropicExtraUsage` (`packages/coding-agent/src/core/settings-manager.ts:70`, documented at `packages/coding-agent/docs/settings.md:104`), surfaced through the `/settings` warnings submenu (`components/settings-selector.ts:146`).
The warning text itself tells the user where the toggle is.

I probed the write path with a throwaway script against the installed `@earendil-works/pi-coding-agent@0.84.0`, using a temp `agentDir` + `cwd` (deleted afterward).
Results:

1. `setWarnings` assigns `this.globalSettings.warnings` and `save()`s, so the write lands in `~/.pi/agent/settings.json` — **global** scope, every project, persisting after the extension is uninstalled.
2. Seeding an explicit `{"warnings": {"anthropicExtraUsage": true}}` (a user who deliberately re-enabled the warning in `/settings`) and running the PR's code path overwrote it to `false`.
   The user cannot keep their preference: the flip repeats on every Pi start with the extension loaded.
3. `getWarnings()` returns `deepMergeSettings(globalSettings, projectSettings)` while `setWarnings()` writes the global scope, so a project-scoped value is read back and promoted into global settings.
   `WarningSettings` has one field today, so the blast radius is currently small; it grows the moment upstream adds a second.

#### The warning is not wholly false

Per Issue #46, `agentLoop` background agents and extensions calling pi-ai's `compat.streamSimple` directly bypass our `streamSimple` wrapper on pi >=0.80.8, and that gap is deliberately not closed here.
Those requests reach Anthropic unshaped and genuinely are third-party harness usage.
Suppressing a warning about real money on paths where it is still accurate is a regression wearing a fix's clothing.

#### Implementation issues

Beyond the premise, the diff has concrete defects:

1. **Silent, durable, global mutation of a user preference.**
   An extension flipping a billing-related setting behind the user's back is an overreach independent of whether the value is "right".
2. **Out-of-band `SettingsManager` instance.**
   `src/index.ts` calls `SettingsManager.create(process.cwd())`, constructing a second manager separate from Pi's live one.
   That is why the README has to say the change takes effect "on the next Pi startup" — it does not fix the session the user is actually in, and Pi's live instance is left stale.
3. **The `try`/`catch` guards almost nothing.**
   `save()` enqueues an async write via `enqueueWrite` and routes failures into `recordError`/`drainErrors()`; it does not throw.
   Nothing `await`s `flush()`, so the write is fire-and-forget and `debugLog("disable-anthropic-extra-usage-warning-failed", …)` will effectively never fire.
4. **Fragile test seam.**
   `test/index-registration.test.ts` adds `vi.mock("@earendil-works/pi-coding-agent", () => ({ SettingsManager: … }))`, replacing the entire host module with a one-key stub.
   It breaks silently the moment `src/index.ts` imports anything else from that module.
5. **Does not apply to `main`.**
   Base is `2288351` (2.0.1); `main` is 2.0.7.
   Merging conflicts in `test/index-registration.test.ts`, and `src/index.ts` was rewritten since (`streamSimpleAnthropic` → `resolveBuiltinAnthropicStreamSimple`).

#### Gate results

Checked out in a scratch worktree at `53bce71`, against the PR's own lockfile:

1. `pnpm run check` — clean.
2. `pnpm run lint` — clean (biome, eslint, rumdl).
3. `pnpm test` — 54 passed, 8 files.

The PR's own validation claim holds on its base.
The failure is design, not hygiene.

#### What is valuable

The observation that this warning is noisy and confusing for users of this extension, and that we have never documented it.
The PR's README section is the salvageable part, inverted: rather than claiming the warning is obsolete, explain what it means, what we shape, what we do not shape (#46), and point at `/settings` so the user makes the billing call themselves.

### Decision and attribution

**Direction: decline the mechanism, adopt a docs-only note.**

Filed Issue #64 for the README work.
Agreed scope for that issue:

1. Explain that the warning fires for any Anthropic OAuth session, extension or not.
2. State what this extension shapes — everything reaching `provider-composer`: the interactive loop and compaction.
3. State what it does not shape — `agentLoop` background agents and direct `compat.streamSimple` callers (#46) — and that the warning is accurate for those.
4. Point at `warnings.anthropicExtraUsage` in `/settings` as the user's own opt-out.

Non-goal: the extension must never write that setting itself, automatically or otherwise.

PR #45 is closed with credit to @Hmenez3s, the evidence above, and a link to Issue #64.
Any commit implementing Issue #64 carries the trailer:

```text
Co-authored-by: J.Henrique <joaohenrique145@outlook.com.br>
```

Reference the PR as `Refs #45`, never `Closes #45`.

[#45]: https://github.com/gotgenes/pi-anthropic-auth/pull/45
