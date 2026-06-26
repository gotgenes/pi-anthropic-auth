---
issue: 31
issue_title: "import.meta.resolve(\"@earendil-works/pi-ai\") fails when installed via pi install"
---

# Resolve the built-in Anthropic transport via a bare-root import

## Release Recommendation

**Release:** ship independently

Issue #31 is a reactive install-compatibility fix.
It is not referenced in any `docs/architecture.md` roadmap step and carries no `Release:` batch tag, so it stands alone and ships on its own once green.

## Problem Statement

`src/host-transport.ts` resolves Pi's built-in Anthropic transport with `import.meta.resolve("@earendil-works/pi-ai")`, derives the package directory, and dynamic-imports a concrete subpath file (`dist/api/anthropic-messages.js` or `dist/providers/anthropic.js`).
This works in local dev (`pi -e ...`) because pi-ai is a devDependency present in the extension's own `node_modules`.
It fails when the extension is installed via `pi install` (which runs `npm install --omit=dev`, and pi-ai is only a peer/dev dependency) and in the Bun-compiled standalone binary.
The reason is that `import.meta.resolve` bypasses the host loader's module indirection: the host resolves the bare `@earendil-works/pi-ai` specifier through a jiti `alias` (Node) or `virtualModules` entry (Bun binary), but jiti consults neither on the `resolve` path — so `import.meta.resolve` falls through to filesystem resolution from the extension's own directory and finds nothing.

The fix is to stop deriving a filesystem path at all and instead let the host's indirection do the resolution: a bare-root `await import("@earendil-works/pi-ai")` goes through jiti's *import* path, which the host aliases (Node) / virtualizes (Bun) to its own bundled pi-ai entrypoint, and read the transport off that namespace.
Note this imports the *bare* specifier, not the `@earendil-works/pi-ai/compat` subpath: each host version maps the bare specifier to whatever entrypoint it bundles (`dist/index.js` on pi 0.79.x, `dist/compat.js` on pi 0.80.x), so the fix needs no peer-floor bump even though `compat.ts` only exists from 0.80.0.

The operator confirmed this direction (it is the near-term recommendation committed in the Issue #35 decision record, now being implemented here) and chose the **thin** selector shape during planning (`ask_user`): read `streamSimpleAnthropic` off the namespace and throw if it is absent, removing the dual-layout candidate machinery introduced for Issue #33.

## Goals

- Resolve Pi's built-in Anthropic `streamSimple` transport via a bare-root `import("@earendil-works/pi-ai")` so resolution works under `pi install` and the Bun standalone binary, not only in local dev.
- Keep the change non-breaking and preserve the `resolveBuiltinAnthropicStreamSimple()` contract (a `Promise<AnthropicStreamSimpleDelegate>`), so `src/index.ts` is untouched.
- Keep the peer-dependency floor at `>=0.79.1`.
  The fix imports the bare `@earendil-works/pi-ai` specifier (which each host version maps to its own entrypoint), not the `@earendil-works/pi-ai/compat` subpath (which would require the 0.80.0 floor where `compat.ts` was introduced).
- Preserve the Issue #28 invariant: the delegate is a directly-captured transport function, never read from the lazy API-registry stub.
- Remove the now-obsolete dual-layout candidate selector (`selectAnthropicStreamSimple`, `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`) and its `node:path`/`node:url` dependencies.
- Keep the error path (transport missing or not a function) unit-testable.

## Non-Goals

- Adding `@earendil-works/pi-ai` as a production dependency (Issue #31's fix option 1).
  The bare-root import resolves through the host's bundled pi-ai, so the extension should not ship its own copy — that would risk two pi-ai instances and defeat the host indirection.
- Reading the delegate from the API registry (`getApiProvider("anthropic-messages")`), Issue #31's fix option 3.
  That reintroduces the Issue #28 lazy-registration clobber.
- Adopting the Issue #32 parent-`node_modules` walk.
  It bypasses the host indirection the same way `import.meta.resolve` does and breaks in the Bun-binary layout.
- Solving the `compat`-removal cliff (Issue #35).
  When upstream deletes `compat.ts`, the bare-root `streamSimpleAnthropic` alias disappears and a durable upstream seam is needed; that remains tracked in Issue #35 and is documented here as a known limitation, not fixed.
- Changing `src/oauth-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, or `src/anthropic-oauth.ts`.

## Background

`src/host-transport.ts` currently exposes `resolveBuiltinAnthropicStreamSimple()` plus the Issue #33 selector surface (`selectAnthropicStreamSimple`, `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`).
The resolver calls `import.meta.resolve("@earendil-works/pi-ai")`, derives `packageDir` via `dirname(dirname(fileURLToPath(rootUrl)))`, and delegates to the selector, which tries each candidate file (`dist/api/anthropic-messages.js` → `streamSimple`, then `dist/providers/anthropic.js` → `streamSimpleAnthropic`) by building a `file://` URL and dynamic-importing it.

`src/index.ts` is the sole caller: it `await`s the resolver and hands the delegate to `createAnthropicOAuthStreamSimple`, then registers it as the provider's `streamSimple`.
The resolver's promise contract does not change, so `index.ts` stays as-is.

Verified facts (against the pi workspace at `~/development/pi/pi`, pi-ai 0.80.2, and the installed devDependency 0.79.1):

1. The host loader maps the bare specifier `@earendil-works/pi-ai` to its own bundled pi-ai entrypoint, and the target differs by host version:
   - pi 0.79.10 (`dist/core/extensions/loader.js`, verified via `npm pack`) aliases `@earendil-works/pi-ai` → `ai/dist/index.js` in Node mode and virtualizes it to the bare-root namespace in Bun mode — `compat.ts` did not exist yet.
   - pi 0.80.2 (`packages/coding-agent/src/core/extensions/loader.ts`) aliases `@earendil-works/pi-ai` → `ai/dist/compat.js` in Node mode and virtualizes it to the bundled `compat` module in Bun mode.
   Either way a bare-root import resolves to a namespace that exports `streamSimpleAnthropic`.
2. jiti consults the `alias`/`virtualModules` maps on the import/require path but not on the `resolve` path, which is why `import.meta.resolve` falls through and a bare-root `import` does not.
3. pi-ai 0.79.1's root `dist/index.js` exports `streamSimpleAnthropic` directly.
4. pi-ai 0.80.2 `compat.ts` re-exports `streamSimpleAnthropic` (a `@deprecated` alias from `legacy-api-aliases.ts`, defined as `anthropicMessagesApi().streamSimple`).
   So a bare-root import yields a `streamSimpleAnthropic` function in every current environment: installed 0.79.1 (vitest), live 0.79.x hosts (root `index.js`), and live 0.80.x hosts (`compat`), in both Node and Bun modes — without raising the `>=0.79.1` peer floor.
5. `streamSimpleAnthropic` in 0.80.2 is a `lazyApi` wrapper (`packages/ai/src/api/lazy.ts`) that lazily `import()`s the real `anthropic-messages.ts` implementation on first call.
   `anthropic-messages.ts` contains no `registerApiProvider` side effect, so capturing this delegate does **not** re-enter the API registry — the Issue #28 clobber stays avoided.

Constraint from AGENTS.md: any change to import specifiers or module resolution must be validated with the live `pi -e` repro under jiti, because a green `check`/`lint`/`test` can still fail under pi's loader, which resolves specifiers differently from vitest (Refs #28).
This is central here: vitest exercises the bare-root import only against the installed 0.79.1 root, never against the host's `compat` alias or the Bun `virtualModules` path, so the live repro is the real validation of the fix.

This change removes a collaborator and an injected dependency rather than adding shared wiring, so the `design-review` checklist applies only in the negative sense: it is a net simplification (fewer exports, fewer `node:` imports, one fewer indirection) with no new interface introduced.

## Design Overview

Replace the `import.meta.resolve` + path-derivation + candidate-file import with a bare-root dynamic import, and read `streamSimpleAnthropic` off the resulting namespace.
Keep one tiny pure helper so the validation/throw branch is unit-testable without the real package.

```typescript
/** A pi-ai module namespace as a plain record for property lookup. */
export type PiAiNamespace = Record<string, unknown>;

/**
 * Reads the built-in Anthropic `streamSimple` transport off a pi-ai namespace,
 * throwing a clear error if the export is absent or not a function.
 */
export function pickAnthropicStreamSimple(
  namespace: PiAiNamespace,
): AnthropicStreamSimpleDelegate {
  const transport = namespace.streamSimpleAnthropic;
  if (typeof transport !== "function") {
    throw new Error(
      "Could not resolve the built-in Anthropic streamSimple transport: " +
        "@earendil-works/pi-ai did not export a `streamSimpleAnthropic` function.",
    );
  }
  return transport as AnthropicStreamSimpleDelegate;
}

/**
 * Resolves Pi's built-in Anthropic `streamSimple` transport at runtime via a
 * bare-root import, which the host loader aliases (Node) / virtualizes (Bun)
 * to its own bundled pi-ai entrypoint (`dist/index.js` on pi 0.79.x,
 * `dist/compat.js` on pi 0.80.x). Both expose `streamSimpleAnthropic`.
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const namespace = (await import("@earendil-works/pi-ai")) as PiAiNamespace;
  return pickAnthropicStreamSimple(namespace);
}
```

The IO edge (`resolveBuiltinAnthropicStreamSimple`) does only the dynamic import and delegates validation to the pure `pickAnthropicStreamSimple`.
`pickAnthropicStreamSimple` follows Tell-Don't-Ask and ISP: it receives the namespace it needs and reads exactly one property; `PiAiNamespace` carries no fields beyond the index signature the lookup uses.

Why `streamSimpleAnthropic` and not the generic `streamSimple`: the root/`compat` namespace also exports a generic `streamSimple(model, context, options)` that dispatches by `model.api` through the API registry — using it would route through the Issue #28 clobber surface.
`streamSimpleAnthropic` is the Anthropic-specific transport, which is exactly the delegate the wrapper must shape around.

Edge cases:

1. Installed 0.79.1 (vitest) — root exports `streamSimpleAnthropic` → returned.
2. Live 0.79.x host — bare-root aliased/virtualized to the root `index.js`, which exports `streamSimpleAnthropic` → returned.
3. Live 0.80.x host — bare-root aliased/virtualized to `compat`, which re-exports `streamSimpleAnthropic` → returned (both Node and Bun modes).
4. `streamSimpleAnthropic` absent or not a function (a future `compat` that drops the deprecated alias) → `pickAnthropicStreamSimple` throws a clear error; this is the Issue #35 cliff, surfaced loudly rather than silently mis-resolving.

Consumer call site (unchanged in `src/index.ts`):

```typescript
const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple();
pi.registerProvider("anthropic", {
  oauth: anthropicOAuthOverride,
  api: "anthropic-messages",
  streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic),
});
```

## Module-Level Changes

- `src/host-transport.ts`
  - Remove `import.meta.resolve` usage and the `dirname`, `join` (`node:path`) and `fileURLToPath`, `pathToFileURL` (`node:url`) imports — no filesystem path is derived anymore.
  - Remove `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`, and `selectAnthropicStreamSimple`.
  - Add `PiAiNamespace` and the exported pure `pickAnthropicStreamSimple(namespace)`.
  - Rewrite `resolveBuiltinAnthropicStreamSimple` to bare-root import and delegate to `pickAnthropicStreamSimple`.
  - Rewrite the JSDoc to describe bare-root resolution through the host's alias/`virtualModules` indirection and the single-export contract, replacing the dual-candidate narrative.
  - Keep the `AnthropicStreamSimpleDelegate` type and the type-only `import type { SimpleStreamOptions, StreamFunction } from "@earendil-works/pi-ai"`.
- `test/host-transport.test.ts`
  - Keep the `resolveBuiltinAnthropicStreamSimple` integration test; update its comment to describe the bare-root import (resolving the installed 0.79.1 root under vitest) rather than `import.meta.resolve` + candidate files.
  - Remove the `describe("selectAnthropicStreamSimple (candidate resolution)", ...)` block and the `AnthropicTransportCandidate` import.
  - Add a `describe("pickAnthropicStreamSimple", ...)` block covering: returns the function when `streamSimpleAnthropic` is present, throws a clear error when it is absent, and throws when it is present but not a function — all with plain fake namespace objects.
- `docs/architecture.md`
  - Rewrite the resolution paragraph (lines ~49–52): replace the `import.meta.resolve` + jiti-`./anthropic`-subpath + dual-layout candidate description with the bare-root story (host aliases/virtualizes the bare specifier to `compat`; `import.meta.resolve` bypassed that indirection and failed under `pi install` / Bun, Issue #31), and state the delegate is `streamSimpleAnthropic` read off the namespace.
  - Update the `src/host-transport.ts` related-files bullet (line ~92): replace "dual-layout candidate resolution (Issue #28, Issue #33)" with bare-root resolution through the host indirection (Issue #28, Issue #31), and note the `compat`-removal cliff is tracked in Issue #35.
  - Leave the line ~44 mermaid node ("built-in Anthropic streamSimple delegate") and line ~49's delegate-name phrasing consistent with `streamSimpleAnthropic`.
- `AGENTS.md`
  - Reword the `src/host-transport.ts` entry (line ~96): replace "working around jiti's missing `./anthropic` subpath alias (Issue #28)" with bare-root resolution through the host's aliased/virtualized entrypoint (Issue #28, Issue #31).
  - Reword the "Runtime resolution ... required because Pi loads extensions with jiti, whose alias map covers the bare `@earendil-works/pi-ai` specifier but not the `./anthropic` subpath" paragraph (line ~420): the bare-root import is used precisely because the host aliases/virtualizes the bare specifier to `compat`, while `import.meta.resolve` and subpath imports bypass that indirection (Issue #31).
  - Leave the generic "resolved at runtime by `src/host-transport.ts`" mentions (lines ~79, ~418) as-is; they describe no mechanism detail.

No change to `.pi/skills/anthropic/SKILL.md`: its two `host-transport.ts` mentions (lines ~85, ~109) say only "resolved by `src/host-transport.ts`" and describe no resolution mechanism.
Historical records are intentionally untouched: `docs/plans/0033-*.md`, `docs/plans/0035-*.md`, and the `docs/retro/` files correctly describe state at their time, and `.pi/npm/node_modules/@gotgenes/pi-anthropic-auth/` is a vendored install copy, not source.

## Test Impact Analysis

1. New tests enabled by the change: the `pickAnthropicStreamSimple` unit block tests the validation/throw branch with plain fake namespace objects — no `ModuleImporter` plumbing and no installed-version dependency.
   This is simpler than the removed selector tests and directly pins the single-export contract and the Issue #35-cliff error message.
2. Tests that become redundant: the five `selectAnthropicStreamSimple (candidate resolution)` tests (new-layout match, legacy fallback, wrong-export skip, new-first precedence, aggregated-error throw) — they exercise the dual-candidate file-import machinery being removed, and are deleted with it.
3. Tests that must stay: the `resolveBuiltinAnthropicStreamSimple` integration test, which genuinely exercises the real bare-root import against the installed pi-ai and is the only automated guard that the root namespace still exposes a `streamSimpleAnthropic` function for the installed version.
   Its assertion (`typeof transport === "function"`) is unchanged; only its comment updates.
   Note its limitation (Risks): under vitest it resolves the installed 0.79.1 root, not the host `compat` alias or the Bun `virtualModules` path, so it does not by itself prove the `pi install` / Bun fix — the live `pi -e` repro does.

## Invariants at risk

- Issue #28 (lazy-registration clobber) — the wrapper must delegate to a directly-captured built-in transport, never the registry stub.
  The bare-root `streamSimpleAnthropic` is a `lazyApi` wrapper that lazily imports the real implementation and never calls `registerApiProvider` (verified against pi-ai 0.80.2), so the invariant holds.
  It is pinned by `test/index-registration.test.ts` ("index registration survives the pi-ai 0.79.8 lazy re-register clobber (#28)"), which mocks `#src/host-transport` and is unaffected by this change.
- Issue #33 (dual-layout resolution) — its outcome (resolve across the legacy and api/* layouts) is intentionally *superseded*, not regressed: the bare-root import resolves to `compat`, which re-exports `streamSimpleAnthropic` across both pi-ai generations, so the cross-layout requirement is still met by a simpler mechanism.
  The integration test still pins "resolution yields a function," so a future pi-ai that stops exposing `streamSimpleAnthropic` fails at test time.

## TDD Order

1. Replace the resolver and its tests in one commit.
   The export removals (`selectAnthropicStreamSimple`, `AnthropicTransportCandidate`, `ModuleImporter`, `ANTHROPIC_TRANSPORT_CANDIDATES`) break `test/host-transport.test.ts` at the type level, so the source rewrite and test rewrite must land together.
   Test surface: `test/host-transport.test.ts` — keep and re-comment the integration test; remove the `selectAnthropicStreamSimple` describe and its `AnthropicTransportCandidate` import; add the `pickAnthropicStreamSimple` describe (returns the function when present, throws when absent, throws when not a function).
   Production: rewrite `src/host-transport.ts` per Module-Level Changes (bare-root import, `pickAnthropicStreamSimple`, `PiAiNamespace`; drop the `node:path`/`node:url` imports and the candidate machinery; rewrite JSDoc).
   `src/index.ts` needs no change (resolver signature preserved).
   Run `pnpm run check` and `pnpm test`.
   Then run the live `pi -e` repro from AGENTS.md (Anthropic OAuth, default model) to confirm the extension loads and shapes requests under jiti — the only validation that covers the actual `pi install` / loader-indirection fix.
   Commit: `fix: resolve built-in Anthropic transport via bare-root import (#31)`.
2. Update documentation to match.
   Edit `docs/architecture.md` (resolution paragraph + host-transport related-files bullet) and `AGENTS.md` (the two host-transport rationale mentions) per Module-Level Changes: bare-root resolution through the host indirection, Issue #31, and the Issue #35 `compat`-removal cliff note.
   Run `pnpm run lint:md`.
   Commit: `docs: describe bare-root host-transport resolution (#31)`.

## Risks and Mitigations

- The unit and integration suites cannot reproduce the actual failure (it only manifests under jiti's alias / Bun's `virtualModules`, not vitest's Node resolver), so a green suite does not prove the fix.
  Mitigation: gate "done" on the live `pi -e` repro (Step 1), per the AGENTS.md import-resolution rule, and keep the integration test as the regression guard that the root namespace still exposes the function for the installed version.
- A future `compat` deletion (Issue #35) removes the deprecated `streamSimpleAnthropic` alias, breaking bare-root resolution.
  Mitigation: `pickAnthropicStreamSimple` throws a clear, named error instead of silently mis-resolving; the cliff stays tracked in Issue #35 and is documented in the architecture/host-transport notes as a known limitation.
- Accidentally falling back to the generic `streamSimple` (which dispatches through the API registry) would reintroduce the Issue #28 clobber.
  Mitigation: the resolver reads only `streamSimpleAnthropic`; the generic export is never consulted, and the design note records why.
- The bare-root import could resolve to a second pi-ai instance if the extension ever shipped its own copy.
  Mitigation: pi-ai stays a peer/dev dependency (Non-Goals); resolution relies on the host's single bundled instance via its alias/`virtualModules`.

## Open Questions

- Whether to add a regression test that specifically exercises the Bun-binary / jiti loader path is deferred — there is no in-repo harness for it today, and the live `pi -e` repro plus the integration test cover the practical surface.
  This is the kind of durable guard the Issue #35 upstream-seam work would make possible.
- Whether the legacy/new pi-ai version note in `docs/architecture.md` can be simplified once the peer floor moves past the `compat` cutover is deferred to the Issue #35 follow-up, where the resolver story changes again.
