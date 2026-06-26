---
issue: 31
issue_title: "import.meta.resolve(\"@earendil-works/pi-ai\") fails when installed via pi install"
---

# Retro: #31 — import.meta.resolve("@earendil-works/pi-ai") fails when installed via pi install

## Stage: Planning (2026-06-26T17:08:43Z)

### Session summary

Planned the near-term fix for the third-party Issue #31: switch `src/host-transport.ts` from `import.meta.resolve("@earendil-works/pi-ai")` + filesystem-path derivation + subpath-file import to a bare-root `await import("@earendil-works/pi-ai")`, reading `streamSimpleAnthropic` off the host-aliased `compat` namespace.
This implements the near-term recommendation committed in the Issue #35 decision record.
Wrote `docs/plans/0031-bare-root-host-transport-import.md` and committed it.

### Observations

- Root cause verified against the pi workspace (pi-ai 0.80.2) and the installed devDependency (0.79.1): the host loader (`packages/coding-agent/src/core/extensions/loader.ts`) aliases the bare `@earendil-works/pi-ai` specifier to `ai/dist/compat.js` (Node) / a `virtualModules` entry (Bun binary), but jiti consults those maps only on the import path, not the `resolve` path — so `import.meta.resolve` falls through and a bare-root `import` does not.
- Confirmed both environments expose `streamSimpleAnthropic`: 0.79.1 root `dist/index.js` directly, 0.80.2 `compat.ts` via the `@deprecated` `legacy-api-aliases.ts` alias.
- Operator asked whether the bare-root import raises the peer floor to pi 0.80.0 (where `compat.ts` was introduced). Verified it does **not**: the fix imports the *bare* `@earendil-works/pi-ai` specifier, not the `/compat` subpath. Confirmed via `npm pack` of pi-coding-agent 0.79.10 that its loader aliases the bare specifier to `ai/dist/index.js` (root, which exports `streamSimpleAnthropic`), while 0.80.2 aliases it to `ai/dist/compat.js`. Each host version maps the bare specifier to its own entrypoint, so the `>=0.79.1` floor stays. Importing `/compat` directly is what would force a 0.80.0 floor — deliberately avoided. Corrected the plan's Background/Goals to be version-accurate.
- Confirmed the #28 invariant survives: `compat`'s `streamSimpleAnthropic` is a `lazyApi` wrapper (`packages/ai/src/api/lazy.ts`) that lazily imports the real impl and never calls `registerApiProvider`, so capturing it does not re-enter the API registry.
- `ask_user` (third-party issue + genuine design ambiguity): operator chose the **thin** selector shape — read `streamSimpleAnthropic`, throw if absent — over keeping the injectable candidate-list selector or adding an `anthropicMessagesApi()` factory fallback.
  Kept one tiny pure helper (`pickAnthropicStreamSimple`) only so the throw path stays unit-testable.
- This supersedes the Issue #33 dual-layout candidate machinery (`selectAnthropicStreamSimple`, `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`) — the plan removes it and folds the source rewrite + test rewrite into one commit because the export removals break the test imports at the type level.
- Key risk flagged: vitest resolves the bare-root import only against installed 0.79.1, never the host `compat` alias or Bun `virtualModules` path, so the green suite does not prove the fix — the live `pi -e` repro is the real validation (per the AGENTS.md import-resolution rule).
- Release: ship independently (not in any roadmap batch). Not breaking — `fix:`.
- The `compat`-removal cliff remains tracked in Issue #35; this plan documents it as a known limitation rather than fixing it.

## Stage: Implementation — TDD (2026-06-26T17:25:48Z)

### Session summary

Executed the 2-step plan: rewrote `src/host-transport.ts` to use a bare-root `await import("@earendil-works/pi-ai")` + the pure `pickAnthropicStreamSimple` helper (removing the dual-layout candidate machinery), rewrote `test/host-transport.test.ts` accordingly, then updated `docs/architecture.md` and `AGENTS.md`.
Both steps landed as planned (`fix:` then `docs:`).
Test count went 55 → 53 (removed 5 `selectAnthropicStreamSimple` candidate tests, added 3 `pickAnthropicStreamSimple` tests; the integration test stayed).

### Observations

- No deviations from the plan. The `src/index.ts` call site needed no change (resolver signature preserved), as predicted.
- One transient lint failure during Step 1: biome wanted the `{ streamSimpleAnthropic: "not a function" }` object literal reflowed onto multiple lines. Fixed with `biome check --write` before committing — no logic impact.
- Live `pi -e` repro (the real validation vitest can't provide) passed under the jiti loader: extension loaded via the bare-root import → host `compat` alias → `streamSimpleAnthropic`; the `before-provider-request` debug line showed `systemBlockCount` 2→3 (billing header injected), the `Read` tool fired, and the model returned the correct line count. This confirms the bare-root import resolves correctly through Pi's loader indirection.
- Post-checks all green: `pnpm test` (53), `pnpm run check`, `pnpm run lint`, `pnpm fallow:dead-code` (removed exports left no orphans), no `pnpm-lock.yaml` changes.
- Module-Level Changes matched the actual diff exactly (4 files; `.pi/skills/anthropic/SKILL.md` correctly untouched). Not a numbered roadmap step, so no architecture `✅` to flip.
- Pre-completion reviewer: **PASS** — ready for `/ship-issue`. No WARN findings.

## Stage: Final Retrospective (2026-06-26T17:35:46Z)

### Session summary

Shipped the bare-root `@earendil-works/pi-ai` import fix for #31 across the full lifecycle: a deep loader investigation (which also spawned tracking issue #35), planning, a clean 2-step TDD cycle, and a release (`v0.6.5`).
The arc spanned several model handoffs (`opus-4-8` for investigation/planning/TDD, `sonnet-4-6` for the mechanical ship) and two well-timed user redirections that reshaped the fix's framing without forcing code rework.

### Observations

#### What went well

- The live `pi -e` repro proved its worth as the real validation gate: vitest only exercises the installed `0.79.1` root, never the host's jiti `alias`/`virtualModules` path, so the repro (extension loaded, `systemBlockCount` 2→3 billing-header shaping, tool use, correct answer) was the only check that actually exercised the fix. The AGENTS.md import-resolution rule (Refs #28) paid off concretely.
- Plan→execution fidelity was high: test-count delta (55→53), `src/index.ts` untouched (resolver signature preserved), and Module-Level Changes matched the diff exactly — including the correct prediction that `.pi/skills/anthropic/SKILL.md` needed no change.
- Incremental verification throughout TDD: Red/Green per step, `pnpm run check` right after the type-affecting rewrite, full suite + lint + `fallow:dead-code` before handoff. No end-of-session verification pile-up.
- Model tiering was appropriate: the high-capability model did the judgment-heavy loader spelunking and planning; the mechanical release orchestration ran on a cheaper model.

#### What caused friction (agent side)

- `premature-convergence` — during investigation (turns 34-39) proposed a breaking floor-bump-to-`0.80.0` fix built on `anthropicMessagesApi()` / `streamSimpleAnthropic`, framing it as a clean durable solution, despite having already read `compat.ts`'s "deleted with the coding-agent ModelManager migration" docstring (turn 13). The deprecation context was in-hand but not applied to the proposal.
  Impact: user-caught (turn 40, "isn't compat.ts a stopgap"); triggered ~8 tool calls of forward-API re-investigation (turns 41-48) — but that work produced tracking issue #35, so it was net-valuable, not pure rework. No shipped-code rework.
- `missing-context` — the committed plan's Background asserted the bare import resolves "to compat in both modes," true only for `0.80.x` hosts; the `0.79.x` loader aliases the bare specifier to `dist/index.js`. The claim extrapolated from the currently-installed host without checking the older one.
  Impact: user-caught (turn 78); one correction commit (`f061fa6`) to the plan + retro after verifying via `npm pack @earendil-works/pi-coding-agent@0.79.10`. No implementation rework — the fix was already correct; only the explanation was version-inaccurate.
- `other` (tool hygiene) — two `edit` calls (turns 85, 108) included a stray `newText_dummy` property and were rejected, each needing a clean retry.
  Impact: two wasted tool calls; self-corrected immediately.

#### Recurring pattern

- Both user-catches are the same underlying shape: a claim about behavior across multiple pi/pi-ai **versions** or loader **modes** asserted after verifying only one of them. This is the third consecutive issue (#28, #33, #31) centered on cross-version pi-ai resolution, so the theme is durable, not incidental.

#### What caused friction (user side)

- None — the opposite. Both interventions (turn 40 compat-is-a-stopgap; turn 78 peer-floor question) were lightweight redirecting questions that surfaced unverified assumptions early, before they reached shipped code. This is the model bidirectional-feedback case: a one-sentence question is cheaper than a wrong direction.

### Diagnostic details

1. Model-performance correlation: investigation + planning + TDD ran on `anthropic/claude-opus-4-8` (judgment-heavy, appropriate); ship ran on `anthropic/claude-sonnet-4-6` (mechanical release steps, appropriately cheaper). The one subagent dispatch (`pre-completion-reviewer`, turn 118) handled judgment-heavy code review and returned a thorough PASS — no model/task mismatch flagged.
2. Escalation-delay tracking: no `rabbit-hole` points; no error-loop sequences. The longest single-thread investigation (forward-API mapping, turns 41-48) was deliberate research that produced #35, not thrashing.
3. Unused-tool detection: the `missing-context` peer-floor slip could have been pre-empted during planning by the same `npm pack` check used reactively at turn 80 — no missing tool, just an un-run verification.
4. Feedback-loop gap analysis: no gaps — verification ran incrementally after each change, not only at the end.

### Proposals considered

- Add an AGENTS.md gotcha: verify each pi/pi-ai version and loader mode independently when making a cross-version/cross-mode claim — do not extrapolate from the installed host.
- Considered but rejected: a `/plan-issue` prompt change (the rule is pi-ai-domain knowledge, better sited with the existing version-drift gotchas than in the already-long generic planning prompt); an edit-tool-hygiene note (self-correcting agent behavior, not a doc-rule candidate).

### Changes made

1. `AGENTS.md` — added the `### Verify Each pi Version And Loader Mode` gotcha (rule + one-line example + Refs #31, #33) after `### Model ID Alias Drift`.
2. `docs/retro/0031-bare-root-host-transport-import.md` — added this Final Retrospective stage entry.
