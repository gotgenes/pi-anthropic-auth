---
issue: 33
issue_title: "compat: adapt host-transport resolution to upstream pi-ai breaking changes"
---

# Dual-layout host-transport resolution for the upstream pi-ai API split

## Release Recommendation

**Release:** ship independently

This issue is a reactive compatibility fix and is not part of any roadmap batch in `docs/architecture.md` (no `#33` reference, no `Release:` tag).
It stands alone and should ship on its own once green.

## Problem Statement

Upstream `@earendil-works/pi-ai` has announced (currently unreleased) breaking changes that move the API implementation modules from `dist/providers/*` to `dist/api/*` and drop the per-impl export names.
Our runtime resolver in `src/host-transport.ts` hard-codes `dist/providers/anthropic.js` and looks for a `streamSimpleAnthropic` export.
Under the new layout the streaming implementation lives at `dist/api/anthropic-messages.js` and exports `streamSimple`; the old `dist/providers/anthropic.js` file still exists but exports the provider factory (`anthropicProvider`), so our lookup returns `undefined` and `resolveBuiltinAnthropicStreamSimple` throws.

The wrinkle the issue body did not account for: the breaking changes are not released yet, the installed version is `0.79.1`, and our peer floor is `>=0.79.1`.
A literal path/export swap would break every current `0.79.x` install immediately — the live `host-transport.test.ts` would fail and the extension would stop loading — with no newer pi-ai to upgrade to.
The operator confirmed (Decide gate) the resolver should span both layouts rather than hard-swapping.

## Goals

- Resolve Pi's built-in Anthropic `streamSimple` transport across both the legacy layout (`dist/providers/anthropic.js` → `streamSimpleAnthropic`) and the new layout (`dist/api/anthropic-messages.js` → `streamSimple`).
- Keep the change non-breaking: it must work against the installed `0.79.1` today and the future API-split layout, with no peer-floor bump.
- Preserve the Issue #28 invariant: the delegate is resolved from a concrete module export, never from the lazy API-registry stub.
- Add deterministic unit coverage for the new-layout branch we cannot install yet, via an injected module importer.

## Non-Goals

- Solving Issue #31 (`import.meta.resolve` fails when the package is installed via `pi install` without pi-ai in its own `node_modules`).
  That is a separate resolution-strategy problem and is not touched here.
- Bumping the `@earendil-works/pi-ai` devDependency or peer floor to the unreleased version.
- Migrating `test/index-registration.test.ts`'s registry imports (`registerApiProvider`, `getApiProvider`, `clearApiProviders`, `registerBuiltInApiProviders`) to `@earendil-works/pi-ai/compat`.
  Those symbols still live at the package root in `0.79.1`; the migration only becomes necessary when we bump the devDependency to the new layout (see Open Questions).
- Changing `src/oauth-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, or `src/anthropic-oauth.ts` — their pi-ai imports (types, `loginAnthropic`, `refreshAnthropicToken`) remain valid under both layouts.

## Background

`src/host-transport.ts` exposes `resolveBuiltinAnthropicStreamSimple()`.
It resolves the root package URL with `import.meta.resolve("@earendil-works/pi-ai")`, derives the package directory (`dirname(dirname(rootFile))`), joins a single hard-coded relative path, dynamic-imports that module file URL, and returns its `streamSimpleAnthropic` export (throwing if it is not a function).

`src/index.ts` is the sole caller: it `await`s the resolver and hands the delegate to `createAnthropicOAuthStreamSimple`, then registers it as the provider's `streamSimple`.
The resolver's contract (a `Promise<AnthropicStreamSimpleDelegate>`) does not change, so `index.ts` is untouched.

Why direct resolution (not the registry): Pi loads extensions with `jiti`, whose alias map covers the bare `@earendil-works/pi-ai` specifier but not the `./anthropic` subpath, so a subpath import or `import.meta.resolve("@earendil-works/pi-ai/anthropic")` fails.
Resolving the concrete file from the root URL also dodges pi-ai 0.79.8's lazy-registration clobber (Issue #28): reading the delegate from the registry would capture a stub that re-registers the bare built-in on first call and overwrite our wrapper.

Relevant constraint from AGENTS.md and the `code-design` skill: keep helpers small and pure, keep IO at the edges, and inject non-trivial dependencies (DIP) so units are testable.
The current resolver mixes the IO edge (`import.meta.resolve`, dynamic `import`) with the selection logic, which is why the new-layout branch is untestable without a matching install.

The verified upstream facts (from `~/development/pi/pi/packages/ai`): `package.json` maps `./anthropic` → `dist/api/anthropic-messages.js`; `src/api/anthropic-messages.ts` exports `stream` and `streamSimple`; `streamSimpleAnthropic`/`streamAnthropic` are gone from the source entirely; `src/providers/anthropic.ts` now exports `anthropicProvider()`.
The `StreamFunction<"anthropic-messages", SimpleStreamOptions>` signature is unchanged, so the delegate type alias stays valid for both export names.

## Design Overview

Split the resolver into an IO edge and a pure, injectable selector, and replace the single relative-path constant with an ordered candidate list (new layout first, legacy second).

```typescript
interface AnthropicTransportCandidate {
  readonly relativePath: string;
  readonly exportName: string;
}

type ModuleImporter = (url: string) => Promise<Record<string, unknown>>;

const ANTHROPIC_TRANSPORT_CANDIDATES: readonly AnthropicTransportCandidate[] = [
  // New layout (pi-ai api/* split): dist/api/anthropic-messages.js exports streamSimple.
  { relativePath: "dist/api/anthropic-messages.js", exportName: "streamSimple" },
  // Legacy layout (pi-ai <= 0.79.x): dist/providers/anthropic.js exports streamSimpleAnthropic.
  { relativePath: "dist/providers/anthropic.js", exportName: "streamSimpleAnthropic" },
];
```

The selector iterates the candidates, importing each candidate's file URL and returning the first export that is a function.
A failed import (the absent path on a given layout rejects with `ERR_MODULE_NOT_FOUND`) and a present-but-wrong export (the legacy file under the new layout exports `anthropicProvider`, not the looked-for name) both skip to the next candidate.
When nothing matches it throws an aggregated error naming every attempted candidate.

```typescript
export async function selectAnthropicStreamSimple(
  packageDir: string,
  candidates: readonly AnthropicTransportCandidate[],
  importModule: ModuleImporter,
): Promise<AnthropicStreamSimpleDelegate> {
  const attempts: string[] = [];
  for (const { relativePath, exportName } of candidates) {
    const moduleUrl = pathToFileURL(join(packageDir, relativePath)).href;
    let module: Record<string, unknown>;
    try {
      module = await importModule(moduleUrl);
    } catch {
      attempts.push(`${relativePath} (import failed)`);
      continue;
    }
    const transport = module[exportName];
    if (typeof transport === "function") {
      return transport as AnthropicStreamSimpleDelegate;
    }
    attempts.push(`${relativePath} (no ${exportName} export)`);
  }
  throw new Error(
    `Could not resolve the built-in Anthropic streamSimple transport from @earendil-works/pi-ai. Tried: ${attempts.join("; ")}.`,
  );
}
```

The public function stays the IO edge and the sole production wiring point.
It has no `await` of its own, so it is a plain (non-`async`) function returning the selector's promise — `@typescript-eslint/require-await` (enabled for `src/`) would flag an `async` body with no `await`.

```typescript
export function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const rootUrl = import.meta.resolve("@earendil-works/pi-ai");
  const packageDir = dirname(dirname(fileURLToPath(rootUrl)));
  return selectAnthropicStreamSimple(
    packageDir,
    ANTHROPIC_TRANSPORT_CANDIDATES,
    (url) => import(url) as Promise<Record<string, unknown>>,
  );
}
```

Consumer call site (unchanged in `src/index.ts`):

```typescript
const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple();
pi.registerProvider("anthropic", {
  oauth: anthropicOAuthOverride,
  api: "anthropic-messages",
  streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic),
});
```

The extracted selector carries no upstream-API reach-through: it receives `packageDir` and an `importModule` and only reads one named export per candidate.
This is Tell-Don't-Ask-clean and follows ISP — `ModuleImporter` exposes exactly the one capability the selector needs, and `AnthropicTransportCandidate` carries only the two fields the loop reads.

Edge cases handled:

1. Legacy install (`0.79.1`): new-layout import rejects, legacy import resolves with `streamSimpleAnthropic` → returned.
2. New install: new-layout import resolves with `streamSimple` → returned, legacy never tried.
3. New install where the legacy file is reached: it exports `anthropicProvider`, not the looked-for name → skipped (covered by ordering, never reached in practice).
4. Neither candidate yields a function → aggregated `Error` listing both attempts.

## Module-Level Changes

- `src/host-transport.ts`
  - Remove the private `ANTHROPIC_PROVIDER_RELATIVE_PATH` constant (non-exported; its only consumer is the resolver in this file).
  - Add the `AnthropicTransportCandidate` interface, the `ModuleImporter` type, and the `ANTHROPIC_TRANSPORT_CANDIDATES` ordered list (new layout first).
  - Add the exported `selectAnthropicStreamSimple(packageDir, candidates, importModule)` selector.
  - Refactor `resolveBuiltinAnthropicStreamSimple` to derive `packageDir` and delegate to the selector with the real `import()`; drop `async` and return the selector's promise.
  - Rewrite the JSDoc to describe dual-candidate resolution and the aggregated-error contract instead of a single hard-coded path/export.
- `test/host-transport.test.ts`
  - Update the existing integration test's comment: it now exercises the real install resolving through whichever candidate matches, not a fixed `dist/providers/anthropic.js` export.
  - Add a `describe("selectAnthropicStreamSimple (candidate resolution)", ...)` block with a fake `ModuleImporter` covering the four edge cases plus new-first precedence.
- `docs/architecture.md`
  - Update the resolution paragraph (the sentence ending "dynamic-imports the concrete `dist/providers/anthropic.js` the subpath maps to") to describe the ordered new-then-legacy candidate resolution.
  - Update the `src/host-transport.ts` related-files bullet to mention dual-layout resolution alongside the jiti subpath workaround.
  - Soften the version-specific `streamSimpleAnthropic` delegate references (Overview paragraph, the Mermaid `streamSimpleAnthropic delegate` node, the "delegates to Pi's built-in `streamSimpleAnthropic`" sentence, and the `src/index.ts` related-files bullet) to version-neutral phrasing such as "Pi's built-in Anthropic `streamSimple` transport (`streamSimpleAnthropic` in pi-ai ≤ 0.79.x)".
- `.pi/skills/anthropic/SKILL.md`
  - Apply the same version-neutral phrasing to the three `streamSimpleAnthropic` mentions (Repo-Specific Findings bullet, "Shape in the `streamSimple` transport wrapper" sentence, and the "Avoid by default" bullet).

Historical records are intentionally left untouched: `docs/plans/0028-*.md` and `docs/retro/0028-*.md` correctly describe the state at that time, and the vendored copy under `.pi/npm/node_modules/@gotgenes/pi-anthropic-auth/` is not source we edit.

## Test Impact Analysis

1. New unit tests enabled by the extraction: with `selectAnthropicStreamSimple` accepting an injected `ModuleImporter`, we can assert new-layout resolution, legacy fallback, wrong-export skip, new-first precedence, and the aggregated-error failure deterministically — none of which was possible before, because the real resolver could only exercise whatever pi-ai version happened to be installed.
2. Redundant tests: none.
   The existing integration test covers a different surface (the real `import.meta.resolve` + on-disk layout of the installed package); the new unit tests cover branches the install cannot reach.
3. Tests that must stay as-is: the existing `resolveBuiltinAnthropicStreamSimple` integration test, which genuinely exercises the live resolution against the installed package and is the only guard that the candidate list still lands on a real export for the installed version.
   Its assertion (`typeof transport === "function"`) is unchanged; only its comment updates.

## Invariants at risk

- Issue #28 (lazy-registration clobber): the wrapper must delegate to the directly-resolved built-in transport, never the registry stub.
  This change keeps `resolveBuiltinAnthropicStreamSimple` resolving a concrete module export (now from one of two candidate files) and never reads from the API registry, so the invariant holds.
  It is pinned by `test/index-registration.test.ts` ("index registration survives the pi-ai 0.79.8 lazy re-register clobber (#28)"), which mocks `#src/host-transport` and is unaffected by the path change.

## TDD Order

1. Extract the injectable selector and make the resolver dual-layout.
   Test surface: `test/host-transport.test.ts` — add the `selectAnthropicStreamSimple` unit `describe` (fake `ModuleImporter`) covering new-layout match, legacy fallback, present-but-wrong-export skip, new-first precedence, and the aggregated-error throw; update the existing integration test's comment.
   Production: in `src/host-transport.ts`, add `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`, and the exported `selectAnthropicStreamSimple`; refactor `resolveBuiltinAnthropicStreamSimple` to delegate (drop `async`); remove `ANTHROPIC_PROVIDER_RELATIVE_PATH`.
   The single call site in `src/index.ts` needs no change (resolver signature is preserved).
   Run `pnpm run check` and `pnpm test` after this step; the existing integration test must still pass against the installed `0.79.1` via the legacy fallback.
   Commit: `fix: resolve built-in Anthropic transport across pi-ai layout change (#33)`.
2. Update documentation to match.
   Edit `docs/architecture.md` and `.pi/skills/anthropic/SKILL.md` per Module-Level Changes (dual-candidate resolution description, host-transport bullet, version-neutral `streamSimpleAnthropic` phrasing).
   Run `pnpm run lint:md`.
   Commit: `docs: describe dual-layout host-transport resolution (#33)`.

## Risks and Mitigations

- A permissive fallback could mask a genuinely broken resolution under a future third layout.
  Mitigation: the selector throws an aggregated `Error` naming every attempted `relativePath` and missing `exportName`, and the live integration test fails at test time (not only at runtime) if the installed version stops matching any candidate.
- Relying on dynamic `import()` to reject for an absent candidate path.
  Mitigation: each candidate import is wrapped in `try/catch`; a rejection is recorded as an attempt and resolution proceeds to the next candidate.
- Accidental cross-layout export collision (legacy export name reappearing in the new module).
  Mitigation: confirmed upstream that `streamSimpleAnthropic` is removed from the source entirely, and the candidate list is ordered new-first so the correct module is selected before the legacy file is ever consulted.

## Open Questions

- When the new pi-ai layout is released and we bump the `@earendil-works/pi-ai` devDependency to it, `test/index-registration.test.ts` will need its registry imports (`registerApiProvider`, `getApiProvider`, `clearApiProviders`, `registerBuiltInApiProviders`) migrated to `@earendil-works/pi-ai/compat`.
  Deferred until that dependency bump.
- Once the peer floor is raised past the API-split cutover version, the legacy candidate can be retired, simplifying the selector back to a single entry.
  Deferred as future cleanup.
