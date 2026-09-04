---
issue: 64
issue_title: "Document Pi's Anthropic extra-usage warning and its accuracy limits in the README"
---

# Document Pi's Anthropic extra-usage warning in the README

## Release Recommendation

**Release:** ship independently

`docs/architecture.md` carries no roadmap step for this issue and no `Release:` annotation, so there is no batch to wait on.
The change touches `README.md`, which is inside the release scope (only `docs/plans/**` and `docs/retro/**` are excluded), so the `docs:` commit will cut a patch release on its own.

## Problem Statement

Pi prints a warning once per interactive session whenever Anthropic subscription (OAuth) auth is active.
Installing this extension does not silence it, because Pi's check never looks at provider registration.
Users read the persistent warning as evidence that `pi-anthropic-auth` is not working, which is not what it means.

The warning is also not wholly false: the call paths this extension does not cover (Issue [#46]) really do send unshaped third-party requests, and for those the warning is literally accurate.
Nothing in the repository documents any of this today.

PR [#45] proposed having the extension write `warnings.anthropicExtraUsage: false` into the user's global settings on load.
That mechanism was declined — it silently overwrites a billing preference the user owns, and it hides a warning that is still partly true.
The salvageable part is documentation.

## Goals

- Add a README Troubleshooting subsection explaining the warning: what it is, when Pi emits it, and why installing this extension does not remove it.
- State plainly which call paths this extension shapes (interactive turns, compaction) and which it does not (background agents, direct `compat.streamSimple` callers), with a pointer to `docs/architecture.md` for the full table.
- Distinguish the startup warning from the superficially similar `You're out of extra usage.` HTTP 400, which is a real failure with a different diagnosis path.
- Point users at Pi's own opt-out, `warnings.anthropicExtraUsage`, and state that toggling it is the user's call.
- Add a one-sentence pointer from "What It Does" to the new subsection, so the reader meets the caveat before the warning surprises them.

This change is not breaking.
It is documentation only: no source, no configuration, no observable runtime behavior changes.

## Non-Goals

- The extension must never write `warnings.anthropicExtraUsage`, automatically or otherwise. This is the explicit non-goal from the issue and the reason PR [#45] was declined.
- No source changes. `src/index.ts`, `src/oauth-transport.ts`, and the rest of `src/` are untouched.
- No test changes. There is no test surface for README prose.
- Not closing the coverage gap itself. Issue [#46] is closed as documented-not-fixed, and Issue [#53] tracks re-examining it; this plan only describes the gap's user-visible consequence.
- Not restructuring `docs/architecture.md`. Its call-path table is already correct and stays the single source of truth.
- Not editing `.pi/skills/anthropic/SKILL.md`. Its three "extra usage" mentions all concern the HTTP 400, not this startup warning, and remain accurate (verified by grep).

## Background

### What Pi actually does

Verified against the installed `@earendil-works/pi-coding-agent@0.84.0`.

The warning string is a module constant in `dist/modes/interactive/interactive-mode.js:101`:

> Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at <https://claude.ai/settings/usage>. Disable this warning in `/settings`.

`maybeWarnAboutAnthropicSubscriptionAuth` (line 3845) gates in this order:

1. `getWarnings().anthropicExtraUsage === false` → return
2. already shown this session → return
3. `model.provider !== "anthropic"` → return
4. `(await checkAuth("anthropic"))?.type === "oauth"` → show the warning

Nothing in that chain consults `extensionProviders`, `modelRuntime.registerProvider`, or anything else this extension participates in.
The method lives in the interactive mode component, so headless `-p` runs never emit it.

### Pi already owns the opt-out

`warnings.anthropicExtraUsage` is a first-class Pi setting, documented at `@earendil-works/pi-coding-agent/docs/settings.md:101` with default `true`, and surfaced through `/settings` → Warnings → "Anthropic extra usage" (`dist/modes/interactive/components/settings-selector.js:37-47`).
The warning text itself names the toggle's location.

### The accuracy limit

`docs/architecture.md` already documents the coverage boundary in its "Call paths covered" table and the "The remaining gap: pi-ai compat dispatch" section.
Interactive turns and compaction reach the wrapper through `modelRuntime`; `agentLoop` background agents and extensions calling pi-ai's `compat.streamSimple` do not, on every pi version at or above the `>=0.80.8` peer floor.
Those requests are genuinely unshaped third-party usage.

### Constraints from AGENTS.md

- Markdown is enforced by `rumdl` (`pnpm run lint:md` covers `*.md`), one sentence per line, fenced blocks always language-tagged.
- MD051 is active: an in-page anchor link must match a real heading slug. Verified by a throwaway probe — `#nope` against a document with no such heading fails, and the exact slug passes.
- Commit messages follow Conventional Commits; this is a `docs:` change.

## Design Overview

### Placement

Two edits to `README.md`, no new files.

1. A new `###` subsection under `## Troubleshooting`, inserted **after** `### Verify the extension is loaded` and **before** `### ANTHROPIC_API_KEY is ignored when OAuth credentials exist`.
   "Verify the extension is loaded" stays first because it is the general diagnostic every other entry can refer back to.
2. A one-sentence pointer appended to the "What It Does" paragraph that already discusses the background-agent exception, linking down to the new subsection.

### Heading and anchor

Heading: `### Pi warns about extra usage on every OAuth session`.
Anchor: `#pi-warns-about-extra-usage-on-every-oauth-session`.
The back-reference to the existing section uses `#verify-the-extension-is-loaded`.
Both must match exactly or `rumdl`'s MD051 fails the lint.

### Section content

The subsection answers four questions in order, matching the issue's scope list:

1. What the warning says and when Pi emits it — quoted verbatim, with the gate described in plain terms (Anthropic model selected + stored credential is OAuth), and the fact that it fires once per interactive session.
2. Why installing this extension does not remove it — Pi's check cannot see provider registration.
3. What is and is not shaped — one prose sentence naming the covered paths (interactive turns, compaction) and the uncovered ones (background agents running their own agent loop), plus a link to `docs/architecture.md` for the table. The warning is accurate for the uncovered lane.
4. How to turn it off — `/settings` → Warnings → "Anthropic extra usage", or the settings-file form, framed as the user's decision because it concerns real billing.

Between (3) and (4), one sentence separates this startup notice from the `You're out of extra usage.` HTTP 400, pointing a reader with an actual request failure back to "Verify the extension is loaded".

### Drafted text

The Troubleshooting subsection:

````markdown
### Pi warns about extra usage on every OAuth session

Pi prints this warning once per interactive session whenever an Anthropic model is selected and your stored Anthropic credentials are OAuth:

> Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at <https://claude.ai/settings/usage>. Disable this warning in `/settings`.

Installing this extension does not silence it, and that is not a sign the extension is broken.
Pi's check looks only at which provider the selected model belongs to and whether the stored credential is an OAuth token.
It has no way to see that a provider registration is in place, so no extension can suppress it.

The warning is also not entirely wrong.
Interactive turns and compaction go through this extension's request shaping; requests from background agents that run their own agent loop do not, and for those the warning describes exactly what happens.
See [docs/architecture.md](docs/architecture.md) for the full call-path table.

This is a startup notice, not a failure.
A request that actually fails with an HTTP 400 saying `You're out of extra usage.` is a different problem — start with [Verify the extension is loaded](#verify-the-extension-is-loaded).

Pi owns the switch for this warning, so the extension leaves it alone.
Turn it off yourself with `/settings` → Warnings → "Anthropic extra usage", or set it in `~/.pi/agent/settings.json`:

```json
{
  "warnings": {
    "anthropicExtraUsage": false
  }
}
```

Because the warning concerns real billing on paths this extension does not cover, that call is yours to make; the extension will never write the setting for you.
````

The "What It Does" pointer, appended after the existing sentence about background agents:

```markdown
Pi's own extra-usage warning still appears on every Anthropic OAuth session and is not suppressed by this extension — see [Pi warns about extra usage on every OAuth session](#pi-warns-about-extra-usage-on-every-oauth-session).
```

### Attribution

Credit for the observation goes to @Hmenez3s via a commit trailer, as decided during the PR [#45] review:

```text
Co-authored-by: J.Henrique <joaohenrique145@outlook.com.br>
```

The commit body references the PR as `Refs #45`, never `Closes #45` — the PR is already closed and its mechanism was declined.
`README.md`'s Acknowledgments section is not modified; the trailer is the agreed credit mechanism.

## Module-Level Changes

### `README.md`

1. "What It Does" — one sentence appended to the paragraph beginning "Shaping runs in a thin transport wrapper", linking to the new Troubleshooting anchor.
2. "Troubleshooting" — one new `###` subsection, `Pi warns about extra usage on every OAuth session`, inserted between `### Verify the extension is loaded` and `### ANTHROPIC_API_KEY is ignored when OAuth credentials exist`.

Measured baseline: `README.md` is 160 lines.
Estimated post-change: roughly 195 lines.

### Greps run at planning time

- `rg -i --hidden "extra.usage|anthropicExtraUsage|subscription auth" AGENTS.md .pi/ README.md` — three hits, all in `.pi/skills/anthropic/SKILL.md`, all describing the `You're out of extra usage.` HTTP 400 rather than the startup warning. No edit needed; the plan's Non-Goals record this.
- `rg -i "extra usage|extra-usage"` across the repo — `docs/architecture.md`, `docs/comparison-to-similar-projects.md`, and `src/*` comments all describe the 400. `docs/architecture.md` needs no change: its call-path table is what the new README section links to.
- `rg "anthropicExtraUsage"` in `src/` and `test/` — no hits. The declined PR's code never landed, so there is nothing to remove.

### Files explicitly unchanged

`src/**`, `test/**`, `docs/architecture.md`, `.pi/skills/anthropic/SKILL.md`, `AGENTS.md`, `package.json`.

## Test Impact Analysis

1. **New tests enabled:** none. README prose has no test surface, and this repository does not assert on documentation content.
2. **Tests made redundant:** none. No behavior is added, removed, or altered.
3. **Tests that must stay as-is:** the whole suite, unchanged. `test/index-registration.test.ts` in particular still pins that registration leaves the built-in `anthropic-messages` api-registry entry untouched — the boundary the new prose describes.

The verification gate for this change is `pnpm run lint:md` (specifically `rumdl`'s MD051 anchor check and the one-sentence-per-line rules), plus `pnpm test` and `pnpm run check` as an unchanged-baseline confirmation.

## Invariants at Risk

This change touches no code, so no runtime invariant is at risk.
Two documentation invariants are:

1. **`docs/architecture.md` stays the single source of truth for call-path coverage.**
   Pinned by design: the README states the boundary in one prose sentence and links out rather than duplicating the table.
   A future coverage change then edits one table, not two.
2. **In-page anchors resolve.**
   Pinned by `rumdl` MD051, which runs in `pnpm run lint` and therefore in CI.
   Measured at planning time: a link to a non-existent `#nope` anchor fails with `[MD051] Link anchor '#nope' does not exist in document headings`; a link matching the exact heading slug passes.
   So a heading reword that orphans either anchor is caught by lint, not by review.

## Build Order

Docs-only; no test cycles.
Execute with `/build-plan`.

1. **Add the Troubleshooting subsection.**
   Insert `### Pi warns about extra usage on every OAuth session` into `README.md` between `### Verify the extension is loaded` and `### ANTHROPIC_API_KEY is ignored when OAuth credentials exist`, using the drafted text above.
   Read the whole Troubleshooting section first and confirm the insertion does not reparent the `ANTHROPIC_API_KEY` content.
   Verify: `pnpm exec rumdl check README.md` is clean, and the `#verify-the-extension-is-loaded` back-reference resolves.

2. **Add the "What It Does" pointer.**
   Append the drafted sentence to the paragraph about the transport wrapper and background agents.
   Verify: `pnpm exec rumdl check README.md` is clean — this is where a slug mismatch on `#pi-warns-about-extra-usage-on-every-oauth-session` surfaces.

3. **Run the full gate and commit.**
   `pnpm run lint && pnpm run check && pnpm test` — all three must be green and unchanged from baseline.
   Commit both edits together:

   ```text
   docs: explain Pi's Anthropic extra-usage warning in the README (#64)

   Pi emits its extra-usage warning for any Anthropic OAuth session and
   cannot see that an extension has registered a provider, so installing
   this extension does not silence it. Document what the warning means,
   which call paths this extension actually shapes, and that the opt-out
   is Pi's own warnings.anthropicExtraUsage setting.

   Refs #45

   Co-authored-by: J.Henrique <joaohenrique145@outlook.com.br>
   ```

Steps 1 and 2 may be squashed into a single commit; they are one coherent documentation change and TypeScript is not involved.

## Risks and Mitigations

1. **Risk: the quoted warning text drifts upstream.**
   Pi could reword the constant, leaving the README quoting a string users never see.
   Mitigation: quote it as a blockquote attributed to Pi rather than presenting it as canonical, and lead the section with the *situation* ("Pi prints this warning ... whenever an Anthropic model is selected and your stored credentials are OAuth") so the section still finds its reader after a reword.
   Accepted residual: there is no drift test for README prose, unlike `test/upstream-prompt-drift.test.ts` for the system preamble.

2. **Risk: a reader takes "turn the warning off" as advice.**
   Suppressing a warning about real money on paths that remain unshaped would be a disservice.
   Mitigation: the closing sentence states explicitly that the call is the user's because it concerns billing on paths this extension does not cover, and the paragraph above it names those paths.

3. **Risk: the anchor slugs go stale.**
   Mitigation: `rumdl` MD051 runs in `pnpm run lint` and CI; measured at planning time to reject a bad anchor.

4. **Risk: the coverage description duplicates `docs/architecture.md` and drifts from it.**
   Mitigation: the README carries one sentence and a link, not a copy of the table — the deliberate outcome of the direction chosen for this plan.

5. **Risk: the `/settings` navigation path changes.**
   The submenu label "Anthropic extra usage" is a UI string in `settings-selector.js`.
   Mitigation: the README also gives the settings-file form (`warnings.anthropicExtraUsage`), which is the documented, stable key, so the section survives a UI relabel.

## Open Questions

None.
Nothing in this plan defers concrete work, so no follow-up issue is filed.
Issue [#53] already tracks the only adjacent open question — whether the compat-dispatch gap can be closed now that pi exposes `ModelRegistry.getProvider` — and is out of scope here.

[#45]: https://github.com/gotgenes/pi-anthropic-auth/pull/45
[#46]: https://github.com/gotgenes/pi-anthropic-auth/issues/46
[#53]: https://github.com/gotgenes/pi-anthropic-auth/issues/53
