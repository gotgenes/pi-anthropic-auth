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
