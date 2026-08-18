---
issue: 54
issue_title: "Remove the unreachable streamSimpleAnthropic fallback in pickAnthropicStreamSimple"
---

# Remove the unreachable `streamSimpleAnthropic` fallback

## Release Recommendation

**Release:** ship independently

`docs/architecture.md` carries no `Release:` annotations and no numbered roadmap step references this issue, so it is not part of any release batch.
The change is self-contained — one unreachable branch, its tests, and the prose that describes it — with no dependency on Issue [#53] or Issue [#56].

## Problem Statement

`pickAnthropicStreamSimple` in `src/host-transport.ts` reads the built-in Anthropic transport off the pi-ai compat namespace in two steps: it prefers `anthropicMessagesApi().streamSimple`, then falls back to the deprecated `streamSimpleAnthropic` alias, then throws.

The fallback's docstring justifies itself as support for "older hosts that predate the factory on the compat entrypoint."
No such supported host exists.
`anthropicMessagesApi` first shipped in pi v0.80.0, below this package's `>=0.80.8` peer floor, so the fallback branch cannot be reached by any host the package claims to support.

The docstring is therefore not merely redundant — it describes a compatibility target that cannot exist, which is worse than no comment at all.
Three of the six tests in `test/host-transport.test.ts` exist only to exercise that branch, and two more identifiers elsewhere in the codebase are named after the alias.

## Goals

- Remove the `streamSimpleAnthropic` branch from `pickAnthropicStreamSimple`, leaving factory-or-throw.
- Keep the throw, and keep its message accurate — it is what surfaces the `compat`-removal cliff (Issue [#35]) loudly instead of mis-resolving.
- Replace the three fallback tests with tests that pin the new contract, including one that pins the removal as intentional.
- Rename the two identifiers still named after the removed alias: the `src/index.ts` delegate local and the `test/index-registration.test.ts` mock.
- Correct the prose in `AGENTS.md`, `docs/architecture.md`, and `docs/builtin-transport-seam-gap.md` that describes a two-step preference.

This change is **not breaking**.
Behavior differs only on a host that exports `streamSimpleAnthropic` without exporting `anthropicMessagesApi`, and no pi `>=0.80.0` is such a host.

## Non-Goals

- Verifying the peer floor in CI.
  The reachability argument rests on the floor being real, and nothing in the build resolves the floor version — that gap is already filed as Issue [#56] and stays there.
  This plan does not add a floor job.
- Re-examining the compat-dispatch gap (Issue [#53]) or the background-agent coverage gap (Issue [#46]).
  `src/oauth-transport.ts` is not edited by this plan.
- Changing the import specifier, the `/compat` subpath choice, or anything else about how the namespace is obtained (Issue [#31], Issue [#35]).
  Only the read *off* the namespace changes.
- Raising or lowering the `>=0.80.8` peer floor.
- Editing `docs/builtin-transport-seam-gap.md` line 79 or `docs/builtin-transport-seam-upstream-request.md` line 67.
  Those table rows describe pi-ai's own exports (both handles do exist upstream, both are deprecated), not this package's resolution logic, and remain accurate.

## Background

### The code as it stands

`src/host-transport.ts` exports two functions:

1. `resolveBuiltinAnthropicStreamSimple()` — `await import("@earendil-works/pi-ai/compat")`, then delegates to the picker.
   Untouched by this plan except for one docstring sentence.
2. `pickAnthropicStreamSimple(namespace)` — the pure, unit-testable read.
   The `PiAiNamespace = Record<string, unknown>` parameter type exists precisely so this can be driven with a plain object; that stays.

The split is what makes the change cheap: the branch being removed lives entirely in the pure function.

### Upstream verification

Confirmed directly against the `~/development/pi/pi` clone at both ends of the supported range:

```console
$ git show v0.80.8:packages/ai/src/compat.ts | rg 'anthropic-messages.lazy'
export * from "./api/anthropic-messages.lazy.ts";

$ git show v0.80.8:packages/ai/src/api/anthropic-messages.lazy.ts
export const anthropicMessagesApi = (): ProviderStreams => lazyApi(() => import("./anthropic-messages.ts"));
```

`v0.84.2` produces byte-identical output for both commands.
The compat entrypoint re-exports the factory at every supported version, so the fallback is dead across the whole range.

### Constraints from `AGENTS.md`

- "Isolate compatibility logic" — the picker is the isolation point, and shrinking it does not dilute that.
- "Verify each loader mode" — this change does not touch the import path, so the three loader modes resolve the same namespace they did before.
  A live `pi -e` repro is still run as a verification gate (below), because `AGENTS.md` requires one before treating any change to extension resolution as done, and green `check`/`lint`/`test` can pass while `jiti` fails.
- Conventional Commits, one sentence per line, `#src/` aliases in tests.

## Design Overview

### The new picker

```typescript
export function pickAnthropicStreamSimple(
  namespace: PiAiNamespace,
): AnthropicStreamSimpleDelegate {
  const factory = namespace.anthropicMessagesApi;
  if (typeof factory === "function") {
    const transport = (factory as AnthropicMessagesApi)().streamSimple;
    if (typeof transport === "function") {
      return transport as AnthropicStreamSimpleDelegate;
    }
  }

  throw new Error(
    "Could not resolve the built-in Anthropic streamSimple transport: " +
      "@earendil-works/pi-ai/compat exported no callable " +
      "`anthropicMessagesApi` factory returning a `streamSimple` function.",
  );
}
```

Nothing else about the function changes: same signature, same parameter type, same return type, same two-level `typeof` guard on the factory path.

### Why the throw is the valuable half

The removed branch and the retained throw guard opposite directions in time.

The branch guards *backwards*, against a host older than the factory — a host the peer floor excludes.
The throw guards *forwards*, against the `compat` entrypoint being reshuffled or removed (Issue [#35]), which is a live risk with an open watch.
Removing one does not weaken the other.

The issue's counter-argument — that the branch would catch a future compat reshuffle the way v0.75.0 reshuffled the system prompt — does not hold, because both handles are re-exported from the same `compat.ts` line group.
A reshuffle that drops `anthropicMessagesApi` drops `streamSimpleAnthropic` with it, and the fallback would then throw one line later than the factory path already does.

### Error-message scope

The message currently names both handles.
After the change it names only `anthropicMessagesApi`, and it must stay specific enough to be actionable: it names the entrypoint (`@earendil-works/pi-ai/compat`), the export (`anthropicMessagesApi`), and what was expected of it (a callable factory returning a `streamSimple` function).
That third clause matters because the factory-present-but-empty case is a distinct failure from the factory-absent case, and the single message covers both.

### Identifier renames

Two bindings are named after the removed alias and resolve to nothing in the codebase after this change:

1. `src/index.ts:61` — `const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple()`, passed to `createAnthropicOAuthStreamSimple`.
   Becomes `builtinAnthropicStreamSimple`, matching the resolver's own name and the `AnthropicStreamSimpleDelegate` type it holds.
2. `test/index-registration.test.ts` — the `vi.hoisted` `streamSimpleAnthropicMock` and its ~8 references.
   Becomes `builtinTransportMock`, and the two comments describing it as "the bare built-in `streamSimpleAnthropic`" are reworded to "the built-in Anthropic transport."

Both are local bindings, not exports, so neither rename crosses a module boundary.

## Module-Level Changes

### `src/host-transport.ts`

1. Delete the `const legacy = namespace.streamSimpleAnthropic` block (lines 63–66).
2. Rewrite the `pickAnthropicStreamSimple` docstring: drop the "falls back to the deprecated `streamSimpleAnthropic` legacy alias for older hosts that predate the factory" sentence, and state instead that the factory is the only handle read, that it is the non-deprecated public factory pi's own `custom-provider-gitlab-duo` example delegates through, and that a host predating it is below the `>=0.80.8` peer floor.
   Keep the existing paragraph explaining why the delegate is not read from the api registry (Issue [#28], Issue [#46]) — that reasoning is unaffected.
3. Update the `@throws` tag: `when `anthropicMessagesApi` does not resolve to a usable transport`.
4. Narrow the thrown `Error` message per Design Overview.
5. In the `resolveBuiltinAnthropicStreamSimple` docstring (line 85), change "The compat entrypoint re-exports the forward `anthropicMessagesApi` factory and the deprecated `streamSimpleAnthropic` alias" to name only the factory.

No private function loses its sole call site; `AnthropicMessagesApi`, `PiAiNamespace`, and `AnthropicStreamSimpleDelegate` all remain in use.

### `test/host-transport.test.ts`

Rewrite the `describe` block from 5 cases to 4 (the file-level integration test above it is untouched):

1. Keep, renamed — "prefers `anthropicMessagesApi().streamSimple` (the forward primitive)" becomes "returns `anthropicMessagesApi().streamSimple`", and the `legacyTransport` decoy in its namespace is dropped (with the fallback gone there is nothing for the decoy to lose to).
2. Replace — "falls back to `streamSimpleAnthropic` when the factory is absent" becomes "throws when the factory is absent", asserting the message names `anthropicMessagesApi`.
3. Replace — "falls back to `streamSimpleAnthropic` when the factory yields no transport" becomes "throws when the factory yields no `streamSimple`".
4. Merge — the two existing throw cases ("no usable transport present" and "`streamSimpleAnthropic` present but not a function") collapse into one: "throws when only the deprecated `streamSimpleAnthropic` alias is present".
   This case is the regression pin for the decision: it fails loudly if anyone reinstates the branch.

Measured baseline: 60 tests across 8 files, 6 of them in this file.
Predicted after: 59 tests, 5 in this file.

### `src/index.ts`

Rename the line-61 local `streamSimpleAnthropic` to `builtinAnthropicStreamSimple` and update its single use at line 86.
The line-46 comment block ("`anthropicMessagesApi()` is the direct, non-deprecated handle…") is accurate as written and is not edited.

### `test/index-registration.test.ts`

Rename `streamSimpleAnthropicMock` to `builtinTransportMock` throughout (the `vi.hoisted` return, the `vi.mock` factory, the fake provider object at lines 98–101, and the three `mockClear()` calls).
Reword the two comments at lines 34 and 80 that describe the stub as "the bare built-in `streamSimpleAnthropic`".

### `AGENTS.md`

1. Line 96 (Local Files list) — "preferring the `anthropicMessagesApi()` factory over the deprecated `streamSimpleAnthropic` alias" becomes "reading the `anthropicMessagesApi()` factory off the compat namespace".
2. Line 433 (Registering `streamSimple` gotcha) — "It prefers the non-deprecated `anthropicMessagesApi().streamSimple` factory and falls back to the deprecated `streamSimpleAnthropic` alias for older hosts" becomes a single-handle statement, with a clause noting the throw is what surfaces the compat cliff.

`.pi/skills/anthropic/SKILL.md` was grepped for `streamSimpleAnthropic`, `anthropicMessagesApi`, and "falls back" — it describes the resolution only as "resolved from the installed pi-ai layout" and needs no edit.
`README.md` was grepped for the same terms with no hits; the change adds, removes, and renames no slash command or user-facing feature.

### `docs/architecture.md`

1. Line 73 — "prefers the non-deprecated `anthropicMessagesApi().streamSimple` factory, falling back to the deprecated `streamSimpleAnthropic` alias for older hosts" becomes a single-handle statement.
   The following sentence about the residual compat-removal watch (line 77) stays as-is.
2. Line 183 (module layout list) — "preferring the `anthropicMessagesApi()` factory" becomes "reading the `anthropicMessagesApi()` factory".

The Mermaid node at line 54 (`built-in anthropicMessagesApi().streamSimple`) is already accurate.
No module is added, removed, or moved, so the layout listing, complexity table, and health metrics need no other update, and there is no roadmap step-mark to flip.

### `docs/builtin-transport-seam-gap.md`

Line 127, inside the "Near-term decision" record — drop the "and falling back to the deprecated `streamSimpleAnthropic` alias for older hosts" clause.
The surrounding paragraph is a historical record of what landed in `fdced2f`, but this sentence is written in the present tense about current behavior, so leaving it would make the record wrong rather than historical.
Add a short sentence noting the fallback was removed as unreachable at the `>=0.80.8` floor, with the issue reference.

## Test Impact Analysis

1. **New tests the change enables.**
   None that were previously impossible — the picker was already pure and fully unit-testable.
   What the change enables is a *negative* pin that could not exist before: "throws when only the deprecated `streamSimpleAnthropic` alias is present" asserts the removal is deliberate, which is not expressible while the branch exists.
2. **Tests that become redundant.**
   Three: the two fallback cases and the "`streamSimpleAnthropic` present but not a function" throw case.
   The first two describe behavior that is being deleted; the third is subsumed by the merged case above.
3. **Tests that must stay as-is.**
   The file-level integration test ("the pi-ai compat entrypoint exposes a resolvable Anthropic transport") is the only check that the *real* installed pi-ai still satisfies the picker, and it becomes strictly more load-bearing once the fallback is gone — it is now the sole test that would fail if the factory disappeared from compat.
   `test/index-registration.test.ts`'s assertion that registration leaves the built-in `anthropic-messages` api-registry entry untouched must stay unchanged in substance (identifier renames only); it pins the Issue [#28] / Issue [#46] boundary, which this change does not touch.

## Invariants at Risk

1. **The compat-removal cliff fails loudly, not silently (Issue [#35]).**
   Pinned by the three throw-path tests in `test/host-transport.test.ts` after the rewrite, and by the integration test against the installed pi-ai.
   The retained throw is the mechanism; the merged negative case is what stops it being softened back into a silent fallback.
2. **The delegate is never read from the api registry (Issue [#28], Issue [#46]).**
   Pinned by `test/index-registration.test.ts`'s api-registry assertion, which this plan touches only to rename a mock binding.
3. **The `/compat` subpath import survives all three loader modes (Issue [#31]).**
   Not pinned by any unit test — vitest resolves the specifier differently from `jiti`.
   Verified by the live `pi -e` repro in the TDD order below, which `AGENTS.md` requires for any change to extension resolution.
4. **Test count.**
   Measured baseline 60; predicted 59 after the rewrite (six cases in `test/host-transport.test.ts` become five).
   Verified by running `pnpm test` in step 1, not asserted.

## TDD Order

1. **Remove the branch and rewrite its tests.**
   Test surface: `test/host-transport.test.ts`.
   Covers: factory read returns the transport; throw when the factory is absent; throw when the factory yields no `streamSimple`; throw when only the deprecated alias is present.
   Source: delete the legacy block, narrow the throw message, rewrite both docstrings in `src/host-transport.ts`.
   Test and source land in **one commit** deliberately: the new negative case is red by construction against the current source, so committing the test alone would poison `git bisect` — the same deviation the Issue [#47] retro recorded and the reviewer accepted.
   Verify: `pnpm test` reports 59 passing; `pnpm run check` and `pnpm run lint` green.
   Commit: `refactor: drop the unreachable streamSimpleAnthropic fallback (#54)`.

2. **Rename the delegate bindings.**
   Test surface: `test/index-registration.test.ts` (rename only — no assertion changes).
   Source: `src/index.ts` local at line 61 and its use at line 86.
   Both files land in one commit; the `src` local and the test mock are independent bindings, but splitting them produces two commits neither of which is meaningful alone.
   Verify: `pnpm test` still 59 passing; `pnpm run check` green.
   Commit: `refactor: rename the built-in transport delegate bindings (#54)`.

3. **Correct the resolution prose.**
   No test surface.
   Files: `AGENTS.md` (lines 96, 433), `docs/architecture.md` (lines 73, 183), `docs/builtin-transport-seam-gap.md` (line 127).
   Verify: `pnpm run lint:md` green.
   Commit: `docs: describe host-transport resolution as factory-or-throw (#54)`.

4. **Live repro gate (no commit).**
   Run the `AGENTS.md` repro against a single isolated copy before declaring done:

   ```bash
   pi \
     --model anthropic/claude-haiku-4-5 \
     --no-session \
     --no-extensions \
     --tools read,grep,find,ls \
     -e /Users/chris/development/pi/pi-anthropic-auth/src/index.ts \
     -p "How many lines are in @AGENTS.md ?"
   ```

   Then `/anthropic-auth:status` to confirm the transport still resolves.
   A green unit suite does not establish this: `jiti` resolves module specifiers differently from vitest (Issue [#31]).

5. **Fallow gate (no commit).**
   Run `pnpm fallow:dead-code` — the removal should not orphan any export, and this confirms it.

## Risks and Mitigations

1. **Risk: the reachability argument depends on an unverified peer floor.**
   CI pins pi-ai at 0.84.0 and never installs 0.80.8, so "the factory exists at the floor" is asserted by a manual `git show`, not a build (Issue [#56]).
   Mitigation: the claim was verified by hand against both `v0.80.8` and `v0.84.2` during planning, and the exact commands are recorded in Background so a future reader can re-run them.
   Closing the gap properly stays with Issue [#56].

2. **Risk: a user on an out-of-range host loses a working fallback.**
   A pi below 0.80.0 would now throw where it previously fell back.
   Mitigation: that host is already unsupported by the `>=0.80.8` peer range, and pi 0.79.x has a separate, worse failure mode — the lazy-registration clobber (Issue [#28], Issue [#40]) — so the fallback was not actually rescuing it.
   The throw's message names the entrypoint and export, which is a more useful diagnostic than a silent bind to a deprecated alias.

3. **Risk: prose drifts back out of sync.**
   Five prose locations describe the two-step preference, and a missed one leaves the docs contradicting the code.
   Mitigation: every location was enumerated by grepping `streamSimpleAnthropic`, `anthropicMessagesApi`, and "falls back" across `src/`, `test/`, `AGENTS.md`, `README.md`, `.pi/skills/`, and `docs/`, and each is listed with its line number in Module-Level Changes.
   `docs/retro/` and `docs/plans/` hits are historical records of past sessions and are deliberately left alone.

4. **Risk: the rename churns a test file for no behavioral reason.**
   Mitigation: it is isolated in its own commit with no assertion changes, so the diff is trivially reviewable and step 1 stays behavioral.

## Open Questions

1. Should the throw be a named error class rather than a bare `Error`?
   Deferred until a caller needs to discriminate it — `src/index.ts` currently lets it propagate, and `src/diagnostics.ts` reports resolution as a boolean.
2. Should the file-level integration test assert something stronger than `typeof transport === "function"` now that it is the sole real-host check?
   Deferred: any stronger assertion would couple the test to pi-ai internals, which the testing conventions discourage.
3. No follow-up issues are filed by this plan.
   Both adjacent concerns already have open issues — Issue [#56] for the unverified floor and Issue [#53] for the compat-dispatch re-examination — and neither is created or widened here.

[#28]: https://github.com/gotgenes/pi-anthropic-auth/issues/28
[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#35]: https://github.com/gotgenes/pi-anthropic-auth/issues/35
[#40]: https://github.com/gotgenes/pi-anthropic-auth/issues/40
[#46]: https://github.com/gotgenes/pi-anthropic-auth/issues/46
[#47]: https://github.com/gotgenes/pi-anthropic-auth/issues/47
[#53]: https://github.com/gotgenes/pi-anthropic-auth/issues/53
[#56]: https://github.com/gotgenes/pi-anthropic-auth/issues/56
