---
issue: 37
issue_title: "Pi Coding Agent inside the container is failing after Login"
---

# Add an `/anthropic-auth-status` diagnostics command and document container auth precedence

## Release Recommendation

**Release:** ship independently

Issue [#37] has no reference in `docs/architecture.md` and belongs to no `Release:` batch, so it stands alone and ships on its own once CI is green.

## Problem Statement

A third-party reporter (`yatindrarao`) runs Pi in a Docker container, logs in to Anthropic (Claude Pro/Max), and then every request fails with the Anthropic HTTP 400 "Third-party apps now draw from your extra usage, not your plan limits."
This is the exact rejection this extension exists to suppress, so the report reduces to a single question the reporter cannot currently answer: is the extension actually loaded and shaping requests in that container, and which auth is the request even using?

Two mechanics confirmed during planning explain the failure without any extension code defect.

1. Auth precedence (pi 0.80.2, `packages/ai/src/auth/resolve.ts`): "A stored credential owns the provider: ambient/env is consulted only when nothing is stored."
   The container mounts a persistent `-v pi-agent-home:/root/.pi/agent` volume whose `auth.json` holds Anthropic OAuth credentials, so the stored OAuth credential wins and the `-e ANTHROPIC_API_KEY` the reporter also passes is silently ignored.
   The reporter believes they are on API-key billing; they are on OAuth subscription billing.
2. The yellow "Anthropic subscription auth is active…" line is Pi's own built-in warning (`interactive-mode.js`), not ours, so its presence does not confirm our extension is loaded.
   A named volume mounted over `~/.pi/agent` can also mask a build-time `pi install` (Docker seeds a named volume only on first creation), so the extension may not be loaded at all — which would fully explain why shaping never suppressed the error.

This is a configuration problem, not an extension code defect.
Because Issue [#37] is third-party, the operator confirmed the response direction with `ask_user` before planning: ship a documentation section plus an on-demand diagnostics command so a container user can self-diagnose whether the extension is loaded, which version, and from where.

## Goals

- Add an on-demand `/anthropic-auth-status` command that prints three diagnostics: the loaded extension version, the loaded module's filesystem path, and the built-in transport resolution result.
- Add a README troubleshooting section covering the auth-precedence rule (stored OAuth wins over `ANTHROPIC_API_KEY`) and the Docker named-volume masking gotcha, and pointing users at the new command.
- Keep the change additive and thin: no change to OAuth shaping, transport resolution, or `registerProvider` wiring.

## Non-Goals

- Reporting the per-request OAuth-vs-API-key auth mode.
  The operator deselected this signal; it is inherently per-request (no startup credential-read API on `ExtensionAPI`), and the README precedence section covers the user-facing confusion instead.
- Changing the auth-precedence behavior itself.
  Stored-credential precedence is Pi's built-in auth resolution, outside this extension's scope.
- Making host-transport resolution non-fatal so the command can report a resolution failure.
  Resolution failure currently aborts extension load by design; reworking that is out of scope and tracked separately by the seam-gap work (Issue [#35]).
- Changing `src/oauth-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, `src/host-transport.ts`, or `src/anthropic-oauth.ts`.

## Background

The extension entry is `src/index.ts`, registered as the Pi extension via the `pi.extensions` field in `package.json` and loaded as source through Pi's jiti loader (there is no `dist` build).
The factory currently resolves the built-in transport (`resolveBuiltinAnthropicStreamSimple`) and calls `pi.registerProvider("anthropic", …)` once.
No command is registered today (`grep registerCommand src/` returns nothing).

Relevant Pi surfaces, confirmed against `~/development/pi/pi` at 0.80.2:

1. `ExtensionAPI.registerCommand(name, { description?, handler })`, where `handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>` (`packages/coding-agent/src/core/extensions/types.ts`).
2. `ctx.ui.notify(message, type?: "info" | "warning" | "error")` accepts multi-line text and renders a transient toast in TUI; `ctx.hasUI` guards whether dialog-capable UI exists.
   `@gotgenes/pi-autoformat` uses exactly this dual routing — `ctx.ui.notify` on TUI, `console.log`/`console.warn` otherwise.

Two feasibility facts verified by a live `pi -e` probe on pi 0.80.2 (the issue's exact version), because AGENTS.md warns that green `check`/`test` can still fail under Pi's jiti loader:

1. `import.meta.url` resolves correctly under jiti (`file:///…/probe.ts`).
   The Issue [#31] breakage was strictly `import.meta.resolve()` resolving a bare specifier — jiti consults its alias map on the import path but not the resolve path; `import.meta.url` (the executing module's own URL) is a different mechanism and is unaffected.
2. A dynamic JSON import with import attributes (`await import("./pkg.json", { with: { type: "json" } })`) returns the parsed JSON under jiti, so reading the version from `package.json` works at runtime.

Constraint from AGENTS.md: keep the override thin and preserve built-in behavior by default.
The diagnostics command is additive and never touches the OAuth call paths, so it satisfies this.
Constraint from the `markdown-conventions` skill: one-sentence-per-line, compact tables, sequential numbering per heading, reference-style issue links in long-lived docs.

This change introduces one small new collaborator (the diagnostics module) consumed only by `src/index.ts`; it adds no shared interface and rewires no layer, so the `design-review` structural checklist is light-touch and folded into the Design Overview below.

## Design Overview

A new `src/diagnostics.ts` module owns a small value object and two pure-ish functions; `src/index.ts` gathers the facts and wires the command.

Data shape:

```typescript
export interface ExtensionDiagnostics {
  version: string;
  modulePath: string;
  transportResolved: boolean;
}
```

The module exposes a pure formatter and a handler factory.
The handler reads only two fields of the command context, so its parameter type is a narrow structural interface rather than the full `ExtensionCommandContext` — this follows ISP and keeps the handler unit-testable with a plain fake.

```typescript
interface StatusCommandContext {
  hasUI: boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

export function formatDiagnosticsReport(d: ExtensionDiagnostics): string;

export function createStatusCommandHandler(
  diagnostics: ExtensionDiagnostics,
): (args: string, ctx: StatusCommandContext) => Promise<void>;
```

The real `ExtensionCommandContext` is structurally assignable to `StatusCommandContext`, so `pi.registerCommand` accepts the handler without a cast.

Consumer call site sketch (`src/index.ts`, after the transport resolves):

```typescript
import { fileURLToPath } from "node:url";
import { createStatusCommandHandler, type ExtensionDiagnostics } from "./diagnostics";

const pkg = (await import("../package.json", { with: { type: "json" } })) as {
  default: { version: string };
};
const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple();
const diagnostics: ExtensionDiagnostics = {
  version: pkg.default.version,
  modulePath: fileURLToPath(import.meta.url),
  transportResolved: true,
};
pi.registerProvider("anthropic", { /* unchanged */ });
pi.registerCommand("anthropic-auth-status", {
  description:
    "Show pi-anthropic-auth diagnostics: version, loaded module path, and transport status.",
  handler: createStatusCommandHandler(diagnostics),
});
```

Tell-Don't-Ask and Law of Demeter check: `index.ts` gathers facts and hands a finished value object to the factory; the handler tells `ctx.ui` to notify and reads only `ctx.hasUI` — one level of access, no reverse-search, no output arguments.

Report text (one example):

```text
pi-anthropic-auth diagnostics
  version: 0.6.5
  module:  /root/.pi/agent/.../src/index.ts
  built-in Anthropic transport: resolved
```

Handler routing and edge cases:

1. When `ctx.hasUI` is true, the handler calls `ctx.ui.notify(report, "info")`.
2. When `ctx.hasUI` is false (headless `-p`, RPC), it falls back to `console.log(report)`, so the diagnostics still surface.
3. `transportResolved` is `true` whenever the command is reachable, because a resolution failure aborts extension load before `registerCommand` runs.
   The field is reported honestly and kept future-proof; the limitation is recorded in Open Questions.
4. Module path comes from `import.meta.url` evaluated in `src/index.ts` (the entry), revealing which copy of the extension loaded — the signal that distinguishes a build-time install from a masking volume.

Why `import.meta.url` lives in `index.ts`, not `diagnostics.ts`: the value reveals which file loaded, and the entry module is the canonical, stable place to capture it; the diagnostics module stays free of `import.meta` so its functions are trivially unit-testable.

## Module-Level Changes

- `src/diagnostics.ts` (new) — `ExtensionDiagnostics` interface, the `StatusCommandContext` narrow type, `formatDiagnosticsReport`, and `createStatusCommandHandler`.
- `src/index.ts` (edit) — import `node:url` `fileURLToPath` and the diagnostics module; read the version via a dynamic JSON import of `../package.json`; capture `modulePath` from `import.meta.url`; register the `anthropic-auth-status` command after the existing `registerProvider` call.
  The `registerProvider` wiring is unchanged.
- `test/diagnostics.test.ts` (new) — unit tests for the formatter and the handler routing.
- `test/index-registration.test.ts` (edit) — extend `createFakePi()` with a `registerCommand` capture; assert the command registers under `anthropic-auth-status` and that invoking its handler emits the version, module path, and transport-resolved markers.
  The existing Issue [#28] clobber assertions stay intact.
- `README.md` (edit) — add a `## Troubleshooting` section (after `## Usage`) with three subsections: verifying the extension is loaded via `/anthropic-auth-status`, the OAuth-over-`ANTHROPIC_API_KEY` precedence rule, and the Docker named-volume masking gotcha.
- `docs/architecture.md` (edit) — add a `src/diagnostics.ts` bullet to the `## Related files` list and note that `src/index.ts` also registers the diagnostics command.
- `AGENTS.md` (edit) — add `src/diagnostics.ts` to the "Local Files" list and a one-line note that the extension registers an `/anthropic-auth-status` diagnostics command.
- `.pi/skills/anthropic/SKILL.md` (edit) — add a one-line "confirm the extension is loaded with `/anthropic-auth-status`" step to the Fast Debugging Workflow and list `src/diagnostics.ts` in Useful References.

No symbol is removed or renamed, so no removed-symbol grep is required.
No file in Module-Level Changes is also claimed unchanged in Non-Goals (the Non-Goals name only the OAuth/transport modules, none of which appear above).

## Test Impact Analysis

1. New tests enabled: `formatDiagnosticsReport` (pure string formatting) and `createStatusCommandHandler` routing (TUI vs. headless) — both previously nonexistent and now unit-covered with a plain fake context.
2. No existing test becomes redundant; the diagnostics surface is new.
3. `test/index-registration.test.ts` is extended, not replaced — its existing assertions genuinely exercise the `registerProvider`/clobber wiring this change must not disturb, so they stay as-is.

## Invariants at risk

The change touches `src/index.ts`, which the Issue [#28] lazy-registration-clobber invariant lives in: the wrapper must delegate to the directly-resolved built-in transport, never the registry stub.
That invariant is pinned by `test/index-registration.test.ts` (the `lazyStubStreamSimple` clobber-survival assertions).
The new `registerCommand` call is additive and leaves `registerProvider` untouched, so the existing assertions must continue to pass unchanged after the fake-pi extension; the step adds a `registerCommand` capture without altering the `registerProvider` branch.

## TDD Order

1. Diagnostics formatter — red→green.
   Add `test/diagnostics.test.ts` asserting `formatDiagnosticsReport` includes the version, module path, and a transport-resolved marker (pin with regex markers, not deep-equal).
   Add `src/diagnostics.ts` with the `ExtensionDiagnostics` interface and `formatDiagnosticsReport`.
   Commit: `feat: add diagnostics report formatter (#37)`.
2. Status command handler routing — red→green.
   Extend `test/diagnostics.test.ts`: with a fake context where `hasUI` is true, assert `ctx.ui.notify` is called with the report and `"info"`; with `hasUI` false, assert `console.log` receives the report.
   Add `StatusCommandContext` and `createStatusCommandHandler` to `src/diagnostics.ts`.
   Commit: `feat: add anthropic-auth-status command handler (#37)`.
3. Register the command in the entry — red→green, then live repro.
   Extend `test/index-registration.test.ts`: add a `registerCommand` capture to `createFakePi()`; assert the command registers under `anthropic-auth-status` and that its handler, invoked with a fake context, emits the version, module path, and transport-resolved markers.
   Wire `src/index.ts`: read the version via the dynamic JSON import, capture `modulePath` from `import.meta.url`, and register the command after `registerProvider`.
   Run the live `pi -e` repro from AGENTS.md to confirm the JSON import and `import.meta.url` resolve under jiti and that `/anthropic-auth-status` prints the expected report; this is the only check that covers the loader path.
   Commit: `feat: register /anthropic-auth-status diagnostics command (#37)`.
4. Documentation — no test cycle.
   Add the README `## Troubleshooting` section; update `docs/architecture.md`, `AGENTS.md`, and `.pi/skills/anthropic/SKILL.md` per Module-Level Changes.
   Run `pnpm run lint:md`.
   Commit: `docs: document container auth precedence and the diagnostics command (#37)`.

## Risks and Mitigations

- Risk: the dynamic JSON import or `import.meta.url` behaves differently under Pi's jiti loader than under vitest, repeating the Issue [#31] class of loader surprise.
  Mitigation: both mechanisms were verified by a live `pi -e` probe on pi 0.80.2 during planning, and TDD step 3 re-runs the live repro before the change is considered done.
- Risk: `../package.json` is not present in the published tarball, so the version read fails at runtime.
  Mitigation: npm always publishes `package.json` at the package root regardless of the `files` field, and `../package.json` from `src/index.ts` resolves to that root file; the live repro confirms it.
- Risk: a multi-line `ctx.ui.notify` toast is truncated or hard to read in TUI.
  Mitigation: the report is three short lines; `@gotgenes/pi-autoformat` already sends multi-line text through `ctx.ui.notify`, and the headless path uses `console.log` where wrapping is a non-issue.
- Risk: the new `registerCommand` call perturbs the Issue [#28] clobber-survival behavior.
  Mitigation: the call is additive and leaves `registerProvider` untouched; the existing `index-registration` clobber assertions must pass unchanged.

## Open Questions

- Whether to later make host-transport resolution non-fatal so `/anthropic-auth-status` can report a `transportResolved: false` failure rather than the extension failing to load.
  Deferred — it changes load semantics and overlaps the seam-gap work in Issue [#35].
- Whether a future iteration should add the per-request auth-mode signal (OAuth-shaped vs. API-key passthrough) once a startup credential-read path exists.
  Deferred — the operator deselected it for this change.

[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#35]: https://github.com/gotgenes/pi-anthropic-auth/issues/35
[#37]: https://github.com/gotgenes/pi-anthropic-auth/issues/37
