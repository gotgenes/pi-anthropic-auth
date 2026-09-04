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

## Stage: Planning (2026-09-05T01:30:00Z)

### Session summary

Wrote `docs/plans/0064-anthropic-extra-usage-warning-docs.md`, a docs-only plan for a README Troubleshooting subsection explaining Pi's Anthropic extra-usage warning.
Re-verified the mechanism against the installed `@earendil-works/pi-coding-agent@0.84.0` rather than trusting the PR-review notes: the warning is a module constant at `interactive-mode.js:101`, and `maybeWarnAboutAnthropicSubscriptionAuth` gates on `warnings.anthropicExtraUsage !== false` → not-yet-shown → `model.provider === "anthropic"` → `checkAuth("anthropic")?.type === "oauth"`.
The plan is `Release: ship independently` and hands off to `/build-plan`.

### Observations

The `model.provider === "anthropic"` guard is a detail the earlier PR-review entry did not record — the gate is not only `checkAuth`, and the method lives in interactive mode, so headless `-p` runs never emit the warning.
Both facts made it into the drafted README text.

Three presentation choices went to `ask_user`, and the operator chose: subsection under Troubleshooting **plus** a one-line pointer from "What It Does" (narrowed to "mention it doesn't suppress the warning, then link"), prose-plus-link rather than an inline coverage table, and an explicit one-sentence contrast between the startup warning and the `You're out of extra usage.` HTTP 400.
The inline-table option was rejected to keep `docs/architecture.md` the single source of truth for call-path coverage.

Measured, not assumed: `rumdl` enforces MD051, so a stale in-page anchor fails lint rather than review.
Probed with a throwaway file — `#nope` fails, the exact slug passes.
That is the plan's pin for the two anchors (`#pi-warns-about-extra-usage-on-every-oauth-session`, `#verify-the-extension-is-loaded`).

Grepped `AGENTS.md`, `.pi/` (with `--hidden`, which plain `rg .` would have skipped), and `README.md` for the mechanism: the only hits are three in `.pi/skills/anthropic/SKILL.md`, all about the HTTP 400 rather than the startup warning, so no skill or AGENTS edit is needed.
Recorded as a Non-Goal so the next stage does not re-litigate it.

Attribution decided in the PR-review stage carries forward: a `Co-authored-by` trailer for @Hmenez3s and `Refs #45`, with `README.md`'s Acknowledgments left alone.
No follow-up issues filed — the plan defers no concrete work, and Issue [#53] already covers the adjacent compat-dispatch question.

[#53]: https://github.com/gotgenes/pi-anthropic-auth/issues/53

## Stage: Implementation — Build (2026-09-05T02:05:00Z)

### Session summary

Executed the docs-only plan in one commit: a new `### Pi warns about extra usage on every OAuth session` subsection under `README.md`'s Troubleshooting, plus a one-sentence pointer to it from "What It Does".
No `src/` or `test/` changes, so Tidy First was skipped per its applicability gate.
`README.md` went from 160 to 192 lines, against the plan's ~195 estimate.

### Observations

No deviations.
The drafted text in the plan's Design Overview was applied verbatim, including both in-page anchors (`#pi-warns-about-extra-usage-on-every-oauth-session` and the back-reference to `#verify-the-extension-is-loaded`), which `rumdl`'s MD051 confirmed resolve.
Plan steps 1 and 2 were squashed into a single commit, as the plan's Build Order explicitly permitted.

Re-read the whole Troubleshooting section after inserting to confirm the new `###` did not reparent the `ANTHROPIC_API_KEY` subsection that follows it — the `markdown-conventions` insertion check.
It did not.

The commit carries the agreed attribution: `Refs #45` and `Co-authored-by: J.Henrique <joaohenrique145@outlook.com.br>`.

Pre-completion reviewer: PASS.
It independently re-verified the gate order in `maybeWarnAboutAnthropicSubscriptionAuth` and the `warnings.anthropicExtraUsage` default against the installed pi 0.84.0, and confirmed `.pi/skills/anthropic/SKILL.md`'s three "extra usage" mentions are all about the HTTP 400 and correctly untouched.
No warnings.

## Stage: Final Retrospective (2026-09-05T02:40:00Z)

### Session summary

One session carried Issue #64 from planning through build to ship: plan `docs/plans/0064-anthropic-extra-usage-warning-docs.md`, implementation `ebb91ef`, release `v2.0.8`.
The deliverable is a `README.md` Troubleshooting subsection explaining Pi's Anthropic extra-usage warning, plus a pointer from "What It Does".
Across all four stages (PR Review, Planning, Build, Ship) the issue went from a declined third-party PR mechanism to shipped documentation without rework.

### Observations

#### What went well

1. Re-verifying a claim recorded in this file's own PR Review stage caught an error.
   That entry said the warning "is gated only on `checkAuth("anthropic")?.type === "oauth"`".
   Reading `interactive-mode.js:3845` at planning time showed a four-deep gate — settings flag, already-shown flag, `model.provider === "anthropic"`, then auth type — living in the interactive-mode component, so headless `-p` runs never emit it.
   Both corrections shaped the shipped README sentence ("whenever an Anthropic model is selected … once per interactive session").
   A prior retro is a claim, not a source.

2. `rumdl`'s MD051 anchor enforcement was measured, not assumed.
   A throwaway probe confirmed `#nope` fails and an exact heading slug passes, before the plan committed to two in-page anchors.
   That turned "the anchors are pinned by lint" from an assertion into an invariant with evidence behind it.

3. The `ask_user` answer improved the design beyond the options offered.
   The user's note on placement — "All we have to do is mention it doesn't suppress the warning and then link" — sized the "What It Does" pointer down to one sentence, which is what shipped.

#### What caused friction (agent side)

1. `other` (tool hygiene) — two `rg` calls over `node_modules/@earendil-works/pi-coding-agent/dist/` matched `.d.ts.map` files, whose `sourcesContent` field embeds the entire original TypeScript source.
   Both results blew the 50 KB tool-output limit and truncated; a third narrowly-scoped call got the two facts I wanted.
   Impact: large context burn on a docs-only issue, no rework.
   The better source was `~/development/pi/pi` all along — readable TypeScript, `git`-navigable across tags.

2. `instruction-violation` (self-identified) — `AGENTS.md` § "One decision per call" said to make sequential calls for multiple independent decisions; I sent placement, coverage-depth, and 400-vs-warning as three questions in one call.
   Impact: no rework — the bundled call was answered in one round and worked better than three would have.
   The friction was adjudicating a live conflict between that rule and the system prompt's "bundle 2-3 related unresolved decisions" guidance mid-session.
   Resolved by fixing the rule rather than the behavior.

#### What caused friction (user side)

1. The placement option's description did not state how much content the "What It Does" pointer would add, so the user had to supply that constraint in a free-text note.
   Opportunity: when an `ask_user` option adds content to an existing section, size it in the description ("one sentence", "a short paragraph") so the answer does not have to.

2. The steer toward `~/development/pi/pi` arrived at retro time rather than during planning, after the truncated greps had already been paid for.
   Opportunity: a mid-session nudge when a tool result truncates twice would have cost one sentence and saved the third call.

### Diagnostic details

1. Model-performance correlation — one subagent dispatch, `pre-completion-reviewer` on `anthropic/claude-sonnet-5` (locked in `.pi/agents/pre-completion-reviewer.md`), 17 tool calls in 53 s for a judgment-heavy review that independently re-derived the upstream gate order.
   Appropriate pairing; no mismatch.
   `tidy-first-assessor` was correctly skipped — docs-only change, per the skill's own applicability gate.

2. Escalation-delay tracking — no `rabbit-hole` friction points.
   The longest same-target sequence was three calls (the two truncated `dist/` greps plus the scoped retry), below the five-call threshold.

3. Unused-tool detection — `colgrep` and `Explore` went unused, correctly: the change touched no `src/` symbol and the plan named its own files.
   The one genuinely unused resource was the `~/development/pi/pi` clone, which `AGENTS.md` already lists under Related Files but no gotcha steered me toward while grepping `node_modules`.

4. Feedback-loop gap analysis — verification ran incrementally, not just at the end: `rumdl` after the Troubleshooting insertion, full `pnpm run lint` after the "What It Does" pointer, then `check`/`lint`/`test` at the ship gate.
   The green baseline was established before the first edit.
   No gap.

### Changes made

1. `AGENTS.md` — retitled § "One decision per call" to "One decision per question" and rewrote it: the ban now targets combinatorial option sets within a question, and bundling 2-3 questions per call is explicitly allowed when they are facets of one artifact.
   Sequential calls are reserved for answer-dependent questions.
   Resolves the conflict with the system prompt's bundling guidance that cost adjudication time this session.

2. `AGENTS.md` — new § Gotchas entry, "Read Pi's Source From The Clone, Not The Installed `dist/`", placed before "Diagnose Version Regressions From The Tag Source".
   Points at `~/development/pi/pi` first, explains the `.d.ts.map` `sourcesContent` truncation trap, and gives the `--glob '*.js'` scoping for when the installed version is specifically what matters.

3. Considered and not landed: a README-drift test pinning Pi's warning string (a code change, already recorded as an accepted residual in the plan's Risks); an `rg --hidden` rule (self-caught before it cost anything, and does not generalize past `.pi/`).
