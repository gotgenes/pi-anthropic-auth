---
issue: 35
issue_title: "Wrapping the built-in Anthropic transport has no durable, loader-safe seam"
---

# Document the built-in transport seam gap and source the upstream request

## Release Recommendation

**Release:** ship independently

This is a docs-only tracking issue.
It has no reference in `docs/architecture.md`'s roadmap and belongs to no `Release:` batch, so it stands alone and ships on its own once the markdown lints green.

## Problem Statement

There is no durable, loader-safe way for this extension to obtain pi's built-in Anthropic `streamSimple` transport so it can wrap it.
Every handle the extension can reach is either loader-fragile — `import.meta.resolve` and a parent-`node_modules` walk both break in at least one real environment (the Bun-compiled standalone binary, and some `pi install` layouts behind Issue [#31]) — or lives on pi-ai's `compat` surface, which upstream has explicitly marked for deletion.
The durable fixes all require an upstream pi change, and the near-term repo options are all non-durable.
This issue is a tracking issue: the operator wants to land on a deliberate direction — and to understand the mechanics thoroughly enough to author an upstream pi issue in their own voice — before touching `src/host-transport.ts` again.

The operator confirmed the direction during planning (`ask_user`):

1. The plan is docs-only.
   It produces a decision record plus an operator-facing upstream request brief; no `src/host-transport.ts` change lands here.
2. The committed near-term repo recommendation is to switch to the bare-root `compat` import (to fix Issue [#31] across loader modes for the current pi generation), with the implementation deferred to a separate follow-up issue.
3. The upstream ask is **not** pre-selected.
   The brief must first establish what is happening, why our wrapper needs what it needs, and what alternatives exist given what pi-ai's API actually provides — so the operator can choose and write the ask.
   The brief is source material the operator uses to compose the upstream issue, not an AI-composed issue body to paste (the pi project rejects AI-composed issues).

## Goals

- Produce a decision record that explains the seam gap thoroughly: the loader mechanics, the handle inventory, the `compat` removal cliff, and the alternatives available from pi-ai's actual API surface.
- Commit, in that record, to the bare-root `compat` import as the near-term repo recommendation, with implementation deferred to a follow-up issue.
- Produce an operator-facing upstream request brief: organized facts, the handle table, and the candidate upstream directions ranked with rationale, framed as source material the operator authors from — not a paste-ready issue body.
- Keep `docs/architecture.md` consistent with the new decision record (cross-reference, no contradiction).

## Non-Goals

- Changing `src/host-transport.ts`, `src/oauth-transport.ts`, `src/index.ts`, or any other source file.
  The near-term code switch is deferred to a follow-up issue.
- Selecting a single upstream ask on the operator's behalf.
  The brief ranks options; the operator decides and writes the issue.
- Filing the upstream pi issue.
  The pi project rejects AI-composed issues; the operator authors it from the brief.
- Resolving Issue [#31], Issue [#32], or Issue [#33].
  Those remain their own tracked work; this plan only documents how they relate to the seam gap and which near-term path supersedes the Issue [#32] walk.
- Adding tests.
  There is no code change to cover.

## Background

`src/host-transport.ts` exposes `resolveBuiltinAnthropicStreamSimple()`.
It resolves the package root with `import.meta.resolve("@earendil-works/pi-ai")`, derives the package directory, and dynamic-imports a concrete implementation file (`dist/api/anthropic-messages.js` → `streamSimple`, with a legacy fallback to `dist/providers/anthropic.js` → `streamSimpleAnthropic`, per Issue [#33]).
`src/index.ts` is the sole caller: it `await`s the resolver and hands the delegate to `createAnthropicOAuthStreamSimple`, then registers it as the provider's `streamSimple`.

This direct-resolution approach exists because of two constraints already documented in the codebase:

1. pi-coding-agent's `registerProvider` extension API is override-only — it registers our `streamSimple` into the singleton api-registry but offers no seam to retrieve the built-in transport we are wrapping.
2. Reading the delegate from the api-registry instead caused the lazy-registration clobber in Issue [#28] (the registry's `anthropic-messages` entry is a stub whose first call re-registers the bare built-in and overwrites our wrapper).

The loader mechanics (verified in the issue body against the pi workspace at `~/development/pi/pi`, pi-ai 0.80.2):

1. pi loads extensions with jiti (`packages/coding-agent/src/core/extensions/loader.ts`).
2. Node install: a jiti `alias` map points the bare specifier `@earendil-works/pi-ai` at the host's on-disk `ai/dist/compat.js`, and jiti 2.7 rewrites `import.meta.resolve(...)` to its alias-aware resolver, so the bare specifier resolves.
3. Bun-compiled standalone binary: `virtualModules` with no alias map, and jiti consults `virtualModules` only on the import/require path, not the resolve path — so `import.meta.resolve(...)` falls through to filesystem resolution from the extension's own directory and finds nothing (the Issue [#31] error).
4. A parent-`node_modules` walk (the Issue [#32] proposal) bypasses the host indirection the same way, so it also breaks in at least one real environment.
5. The forward, non-`compat` handles all live at subpaths (`/api/*`, `/providers/*`) the loader never aliases or virtualizes, so a bare import of them is not loader-safe either.

The `compat` removal cliff: `compat.ts`'s own header states it is a temporary entrypoint preserving the old global pi-ai API surface, deleted with the coding-agent ModelManager migration.
Every handle reachable via a bare root import today (the compat alias, the api-registry accessors) is defined in `compat.ts` and disappears with it.

The handle inventory traced in the issue (against pi-ai 0.80.2):

| Handle | Bare-root reachable (Node + Bun)? | Durable past compat removal? |
| --- | --- | --- |
| `anthropicMessagesApi()`, `streamSimpleAnthropic` | Yes (via the compat alias) | No — exported from `compat.ts` / `legacy-api-aliases.ts`, both deprecated |
| api-registry `getApiProvider("anthropic-messages")` | Yes (compat) | No — the whole registry is defined in `compat.ts` |
| `anthropicProvider()`, `@earendil-works/pi-ai/api/anthropic-messages` `streamSimple` | No — subpaths the host loader does not alias/virtualize | Yes |
| `createModels()` (core barrel) | Yes | Yes, but it constructs an empty registry — seeding anthropic still needs the non-aliased subpath factory |
| pi-coding-agent `registerProvider` | Yes | Yes, but override-only — no retrieve-builtin seam |

Constraint from AGENTS.md and the `markdown-conventions` skill: docs use one-sentence-per-line, compact tables, sequential numbering restarting under each heading, and reference-style issue links in long-lived `docs/` files.
The repo's `docs/` layout is flat (`docs/architecture.md`, `docs/comparison-to-similar-projects.md`); this plan keeps that flat convention rather than introducing an ADR subtree for a single record.

This plan is docs-only and introduces no new code collaborator, shared interface, or layer wiring, so the `design-review` structural checklist does not apply.

## Design Overview

Two new flat docs, each with a distinct audience, plus a cross-reference from `docs/architecture.md`.

Doc 1 — decision record (`docs/builtin-transport-seam-gap.md`), audience: this repo's maintainers.
It is the durable internal record of why the seam gap exists and what near-term path we committed to.
Structure:

1. Context — what `resolveBuiltinAnthropicStreamSimple` does and why the wrapper must reach into pi-ai internals at all (override-only `registerProvider`, the Issue [#28] reason for not reading the registry).
2. The mechanics — the five-point loader-mode analysis (jiti alias vs. `virtualModules`, why `import.meta.resolve` and the parent-walk both break in Bun-binary mode) and the `compat` removal cliff.
3. Handle inventory — the table above, each row annotated with how it was verified against the pi workspace.
4. Alternatives given the actual API — `createModels()` (empty registry), the non-aliased subpath factory, the override-only `registerProvider`, and why none is durable-and-reachable on its own today.
5. Decision — commit to the bare-root `compat` import as the near-term path (fixes Issue [#31] across loader modes for the current pi generation), explicitly non-durable, with a compat-removal-cliff TODO and the implementation deferred to a follow-up issue.
   Record why the Issue [#32] parent-walk is not adopted (breaks in Bun-binary mode) and why the status quo is not held (leaves Issue [#31] unfixed).
6. Cross-references — Issue [#18], Issue [#28], Issue [#31], Issue [#32], Issue [#33].

Doc 2 — upstream request brief (`docs/builtin-transport-seam-upstream-request.md`), audience: the operator authoring an upstream pi issue.
It is source material, explicitly framed so the operator writes the issue in their own voice; the build step must not phrase it as a paste-ready issue body.
Structure:

1. One-paragraph framing of the gap in pi's terms (extensions cannot wrap a built-in transport durably and loader-safely).
2. The verified mechanics and the handle table, presented as evidence the operator can cite.
3. Candidate upstream directions, ranked with rationale rather than pre-selected:
   - an extension seam to retrieve/wrap a built-in provider's transport (most durable — removes the resolution problem entirely);
   - aliasing/virtualizing the `/api/*` (or `/providers/*`) subpaths for extensions (smaller change — keeps the wrap-by-resolution pattern);
   - a stable, core-exported transport handle that survives the `compat` removal.
4. Open framing questions the operator may want pi maintainers to answer — including whether there is an intended supported path the extension has missed given what the API already provides.

The two docs share the mechanics and the handle table.
To avoid a maintenance fork, the decision record is the canonical source for the mechanics narrative, and the upstream brief restates the table and the loader-mode facts in evidence framing while linking to the decision record for the full internal reasoning.

`docs/architecture.md` gets a single cross-reference (in the host-transport related-files area) pointing at the decision record as the rationale for the resolution strategy and the open seam gap.
No architecture claim is rewritten — the resolver behavior is unchanged by this plan — so the existing Issue [#28] / Issue [#33] descriptions stay intact.

## Module-Level Changes

- `docs/builtin-transport-seam-gap.md` (new) — the decision record: context, loader mechanics, annotated handle inventory, API-surface alternatives, the committed near-term recommendation (bare-root `compat` import, deferred), and cross-references.
- `docs/builtin-transport-seam-upstream-request.md` (new) — the operator-facing upstream request brief: framing, evidence (mechanics + handle table), ranked candidate directions, and open framing questions; links to the decision record for full reasoning.
- `docs/architecture.md` (edit) — add one cross-reference to the decision record near the `src/host-transport.ts` related-files bullet / resolution paragraph.
  No existing sentence about the resolver, Issue [#28], or Issue [#33] is reworded, because no resolver behavior changes here.

No source file, no `AGENTS.md` symbol, and no `.pi/skills/anthropic/SKILL.md` mechanism description changes — this plan removes or renames nothing and reworks no documented mechanism behavior.
The bare-root `compat` import switch, when it lands in the follow-up issue, is what will update `host-transport.ts`, `docs/architecture.md`'s resolution paragraph, and the SKILL.md `streamSimple` wrapper notes; that doc churn is explicitly deferred with the code.

## Test Impact Analysis

Not applicable.
This plan changes only Markdown documentation and adds no code, so it enables no new unit tests, makes no existing test redundant, and exercises no extracted layer.
Validation is `pnpm run lint:md` (rumdl) on the new and edited docs.

## Invariants at risk

This plan touches no code surface, so it cannot regress a code invariant.
The two code invariants adjacent to this area — the Issue [#28] lazy-registration clobber guard (the wrapper must delegate to the directly-resolved built-in, never the registry stub) and the Issue [#33] dual-layout resolution — remain pinned by `test/index-registration.test.ts` and `test/host-transport.test.ts` and are unaffected.
The one documentation invariant to protect: the decision record's near-term recommendation must not contradict `docs/architecture.md`'s current resolver description; the build step adds only a cross-reference and rewords no resolver sentence, so the two stay consistent.

## Build Order

No test cycles — this is a docs-only `/build-plan`.
Numbered steps, each ending in a `docs:` commit.

1. Write the decision record.
   Create `docs/builtin-transport-seam-gap.md` with the six-part structure from Design Overview (context, mechanics, annotated handle inventory, API-surface alternatives, the committed bare-root-`compat`-import recommendation with the deferral and compat-cliff TODO, cross-references).
   Verify the loader-mode claims and the handle table against the pi workspace at `~/development/pi/pi` before asserting them; cite the files inspected.
   Run `pnpm run lint:md`.
   Commit: `docs: record the built-in transport seam gap and near-term direction (#35)`.
2. Write the upstream request brief.
   Create `docs/builtin-transport-seam-upstream-request.md` with the four-part evidence/ranked-directions structure, framed as operator source material (not a paste-ready issue body), linking to the decision record for full reasoning.
   Run `pnpm run lint:md`.
   Commit: `docs: add upstream request brief for the transport seam gap (#35)`.
3. Cross-reference from architecture.
   Add one pointer from `docs/architecture.md` (near the host-transport related-files bullet) to the decision record; reword no existing resolver sentence.
   Run `pnpm run lint:md`.
   Commit: `docs: cross-reference the transport seam decision record from architecture (#35)`.

## Risks and Mitigations

- Risk: the upstream brief reads as an AI-composed issue body and gets rejected by the pi project, or pre-empts the operator's framing.
  Mitigation: the brief is structured as ranked evidence and open questions, explicitly source material; the build step must not write a paste-ready issue body, and the operator authors the final issue.
- Risk: the mechanics narrative drifts from pi-ai reality (the issue cites 0.80.2; the installed devDependency is 0.79.1).
  Mitigation: the decision record verifies each loader-mode and handle-table claim against the `~/development/pi/pi` workspace and records the pi-ai version each fact was checked against, rather than restating the issue body verbatim.
- Risk: the decision record and `docs/architecture.md` give conflicting accounts of the resolver.
  Mitigation: this plan rewords no architecture resolver sentence; it only adds a cross-reference, and the bare-root-`compat` switch (with its architecture/SKILL doc churn) is deferred to the follow-up issue.
- Risk: duplicated mechanics across the two docs fork over time.
  Mitigation: the decision record is the canonical mechanics source; the upstream brief restates the table in evidence framing and links back rather than maintaining a second narrative.

## Open Questions

- Which upstream ask the operator ultimately leads with (extension seam vs. subpath aliasing vs. stable core handle) is intentionally left to the operator after reading the brief; the brief ranks them but does not decide.
- Whether the follow-up issue that implements the bare-root `compat` import should also pin a regression test for the Bun-binary loader mode is deferred to that issue's planning.
- Whether `docs/architecture.md` should later gain a short "known limitations" subsection (rather than only a cross-reference) is deferred until the near-term code switch lands and changes the resolver story.

[#18]: https://github.com/gotgenes/pi-anthropic-auth/issues/18
[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#32]: https://github.com/gotgenes/pi-anthropic-auth/issues/32
[#33]: https://github.com/gotgenes/pi-anthropic-auth/issues/33
