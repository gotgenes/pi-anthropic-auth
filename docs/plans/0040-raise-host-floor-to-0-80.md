---
issue: 40
issue_title: 'Regression since v0.6.5 - Error 400: "You''re out of extra usage" on second model response'
---

# Raise the host floor to pi-ai 0.80.0 to fix the "out of extra usage" regression

## Release Recommendation

**Release:** ship independently

Issue #40 is a standalone regression fix.
It does not appear in any `docs/architecture.md` roadmap step and carries no `Release:` batch annotation, so it ships on its own.

## Problem Statement

On a host running pi 0.79.x, extension versions 0.6.5 and later fail with an Anthropic HTTP 400 — `You're out of extra usage. Add more at claude.ai/settings/usage and keep going.` — on the **second** model turn of a session.
The reporter's `pi hello ping /anthropic-auth:status` is a single session: turn 1 (`hello`) succeeds, turn 2 (`ping`) 400s.
Downgrading to 0.6.3 fixes it.
The reporter is on pi 0.79.8.

## Goals

- Stop the second-turn "out of extra usage" 400 for supported hosts.
- Raise the peer floor for `@earendil-works/pi-ai` and `@earendil-works/pi-coding-agent` from `>=0.79.1` to `>=0.80.0`, so the extension only runs against the host pi-ai generation whose lazy `streamSimpleAnthropic` no longer re-registers (and thus no longer clobbers our wrapper out of the registry after the first turn).
- This is a **breaking** change: it drops support for hosts on pi 0.79.x.
  Commit with `fix!:` and a `BREAKING CHANGE:` footer.
- Realign the dev toolchain (pinned dev dependencies, tests, typecheck) to a 0.80.x pi-ai.
- Remove the now-dead dual-version (0.79.x vs 0.80.x) handling and prose that the floor makes obsolete.

## Non-Goals

- Reworking the transport-wrapper architecture, the OAuth refresh fallback, or the system-prompt shaping.
- Switching the resolved export off the (now-`@deprecated`-on-0.80) `streamSimpleAnthropic` alias — tracked as an Open Question below.
- Reopening Issue #35's "compat-removal cliff" direction; the floor bump does not resolve it, it only narrows the supported range.
- Adding a runtime version guard or a friendlier "please upgrade pi" message — peer-dependency resolution already surfaces the mismatch.

## Background

### Why the regression exists (code-verified across tags)

The only functional code change between 0.6.3 (works) and 0.6.5 (broken) is `src/host-transport.ts` (Issue #31).
It changed **which** pi-ai object supplies the transport delegate that the `streamSimple` wrapper shapes around — and on a pi 0.79.x host that object has a registry side effect.

The transport *bodies* are not the cause.
Diffing `v0.79.8:packages/ai/src/providers/anthropic.ts` against `v0.80.0:packages/ai/src/api/anthropic-messages.ts` shows the OAuth `buildParams` path — the Claude Code identity system block, headers, and `onPayload` call — is equivalent for a plain Anthropic OAuth request.
So turn 1 and turn 2 build identical payloads; a payload defect is ruled out.

The cause is the **lazy `streamSimpleAnthropic` export's registry side effect on 0.79.x**:

- On `v0.79.8`, the bare-root `streamSimpleAnthropic` is `anthropicProvider.streamSimple`, built by `createLazySimpleStream("anthropic-messages", () => import("./anthropic.ts"))` in `providers/register-builtins.ts`.
  Its first invocation runs `loadAndRegisterProvider`, which calls `module.register()` → `registerApiProvider({ api: "anthropic-messages", ... })`, then returns `getApiProvider(api).streamSimple`.
  `register()` overwrites whatever is registered for `anthropic-messages` — **including our wrapper** — with the bare built-in.
- On `v0.80.0`, the bare-root resolves through compat to `anthropicMessagesApi().streamSimple` = `lazyApi(() => import("./anthropic-messages.ts")).streamSimple`, whose `lazy.ts` body calls `(await load()).streamSimple(...)` **directly**.
  The `register()` / `getApiProvider` dance is gone, so invoking the delegate has no registry side effect.

That produces the exact turn-by-turn symptom on a 0.79.x host:

1. We register `streamSimple: ourWrapper`, so `registry[anthropic-messages] = ourWrapper`.
2. **Turn 1:** the host calls `ourWrapper`; it shapes, then calls the resolved 0.79.x lazy delegate.
   The delegate runs `register()` — clobbering `ourWrapper` out of the registry — but still forwards our `onPayload` to the real transport, so **turn 1 is shaped and succeeds**.
3. **Turn 2:** the host re-reads `registry[anthropic-messages]`, which is now the **bare built-in**; our wrapper is gone, our shaping never runs, and Anthropic returns the **"out of extra usage" 400**.

0.6.3 avoided this because `import.meta.resolve` fell through to the extension's **own co-installed** pi-ai (npm installs the latest peer-satisfying 0.80.x next to the extension, since pi-ai is a peer-only dep) and imported the **real** `streamSimple` directly — which never calls `register()`, so the registry entry (`ourWrapper`) survives every turn.

So the `#28` "resolve the delegate directly to avoid the lazy-registration clobber" fix was **incomplete on 0.79.x**: the clobber fires through the delegate's own first call, regardless of how we resolved the delegate.
Raising the floor to 0.80.0 — where `lazyApi` no longer re-registers — is what actually closes it.

### Confirmed facts

- `package.json` declares pi-ai and pi-coding-agent only as `peerDependencies` at `>=0.79.1`, pinned in `devDependencies` at `0.79.1`.
  The floor has not been raised since the 0.79.1 base (`62696c9`); #31/#33 deliberately avoided a bump.
- On 0.80.x, the host loader aliases bare `@earendil-works/pi-ai` to the **compat** entrypoint (`packages/coding-agent/.../loader.ts`).
  compat re-exports `streamSimpleAnthropic` from `legacy-api-aliases.ts` as a **`@deprecated`** alias of `anthropicMessagesApi().streamSimple`.
  So the extension's current `pickAnthropicStreamSimple` (which reads `namespace.streamSimpleAnthropic`) keeps working on a 0.80.x host without code changes — and, per above, without the 0.79.x clobber.
- 0.80's `registerBuiltInApiProviders` is non-clobbering (`if (!getApiProvider(api))`) and runs once at compat load, before our extension registers.
  Combined with the non-re-registering `lazyApi`, our wrapper stays in the registry for the life of the session.
- The host-transport resolution itself stays necessary on 0.80.x: reading the delegate from the registry would return `ourWrapper` and recurse infinitely, so we must resolve the built-in via the bare-root import.

### AGENTS.md constraints that apply

- "Verify Each pi Version And Loader Mode" — do not extrapolate across versions/loaders.
  This plan narrows the supported set to 0.80.x, which is what removes the need to keep verifying the 0.79.x branch.
- The live `pi -e` repro is mandatory before treating import/resolution/registration changes as done.
  The dev-dependency bump changes what vitest resolves, so a live repro on a 0.80.x host is required.

## Design Overview

The fix is a dependency-floor change plus the cleanup it unlocks; there is no new runtime collaborator and no change to shaping behavior.

### Floor bump

```jsonc
// package.json
"peerDependencies": {
  "@earendil-works/pi-ai": ">=0.80.0",
  "@earendil-works/pi-coding-agent": ">=0.80.0"
},
"devDependencies": {
  // pin both to the latest published 0.80.x (>= the host workspace's 0.80.2)
  "@earendil-works/pi-ai": "0.80.x",
  "@earendil-works/pi-coding-agent": "0.80.x"
}
```

On a pi 0.79.x host the new floor makes the peer requirement unsatisfiable, so `pi install` surfaces the mismatch and steers the user to upgrade pi — instead of silently running the defective 0.79.x transport.
On a pi 0.80.x host nothing about resolution changes: the bare-root import already lands on the working compat transport.

### Resolved export — keep `streamSimpleAnthropic` for now

`pickAnthropicStreamSimple` continues to read `streamSimpleAnthropic` off the resolved namespace.
It is present on the 0.80.x compat entry, so the regression fix needs no resolver change.
It is `@deprecated` on 0.80, which is a durability risk captured in Open Questions; switching to `anthropicMessagesApi().streamSimple` is deferred because it is a resolution-mechanism change that would need its own live-repro pass and is not required to fix #40.

### Cleanup the floor unlocks

With a single supported generation (0.80.x), the dual-version handling and the now-obsolete clobber rationale become dead:

- `src/host-transport.ts` JSDoc describes the resolution as targeting only the 0.80.x compat entrypoint, dropping the "`dist/index.js` on 0.79.x vs `dist/compat.js` on 0.80.x; both export `streamSimpleAnthropic`" branch and the "no peer-floor bump" claim.
  The `pickAnthropicStreamSimple` error path (the `compat`-removal guard) stays — it is version-independent.
- The rationale for resolving the delegate directly narrows from "avoid the lazy-registration clobber (#28)" to **recursion-avoidance only**: on 0.80.x the lazy delegate has no registry side effect, so the sole remaining reason not to read the delegate from the registry is that the registry holds our own wrapper.
  The `#28` clobber is resolved by the floor, not by the resolution handle — the docs should stop crediting the handle for it.
- `test/host-transport.test.ts` header comment is updated off "installed 0.79.1 root".
- `docs/architecture.md`, `AGENTS.md` lose the 0.79.x/0.80.x dual-layout example, the "no peer-floor bump" wording, and the claim that resolving directly is what avoids the clobber.

## Module-Level Changes

1. `package.json`
   - Raise both `peerDependencies` entries to `>=0.80.0`.
   - Repin both `devDependencies` entries to the latest 0.80.x.
   - Run `pnpm install` to refresh the lockfile.

2. `src/host-transport.ts`
   - Rewrite the dual-version JSDoc on `resolveBuiltinAnthropicStreamSimple` and the `PiAiNamespace` / `pickAnthropicStreamSimple` doc comments to describe only the 0.80.x compat entrypoint.
   - Remove the "without a peer-floor bump" and "`dist/index.js` on pi 0.79.x" assertions.
   - Re-scope the "resolve directly" rationale to recursion-avoidance; drop the claim that direct resolution avoids the lazy-registration clobber (the clobber was a 0.79.x `register()` side effect, now removed by the floor).
   - No behavioral code change to the resolution or the error path.

3. `test/host-transport.test.ts`
   - Update the header comment that references "the installed 0.79.1 root" to the 0.80.x compat-aligned root.
   - No assertion changes: the test still asserts `resolveBuiltinAnthropicStreamSimple` yields a function and that `pickAnthropicStreamSimple` reads/guards `streamSimpleAnthropic`.

4. `docs/architecture.md` (lines ~49-53)
   - Line ~51: collapse the dual-layout sentence to the 0.80.x compat entrypoint.
   - Line ~53: drop "with no peer-floor bump"; note the floor is now `>=0.80.0`.
   - Lines ~49-50: re-scope the "Resolving it directly avoids… the pi-ai 0.79.8 lazy-registration clobber" sentence — keep recursion-avoidance, and state the 0.79.x `register()` clobber is now precluded by the `>=0.80.0` floor rather than by the resolution handle.

5. `AGENTS.md`
   - Line ~80 and ~420: re-scope the "delegate is resolved at runtime… so pi-ai 0.79.8's lazy re-register cannot overwrite this wrapper (#28)" prose — on 0.80.x the lazy delegate does not re-register at all, so resolution is for recursion-avoidance; the 0.79.x clobber is closed by the floor.
   - Line ~421: collapse the dual-layout parenthetical to the 0.80.x compat entry.
   - Lines ~429-432 ("Verify Each pi Version And Loader Mode"): drop the 0.79.x-vs-0.80.x `dist/index.js`/`dist/compat.js` example; keep the loader-mode (Node `alias` vs Bun `virtualModules`) guidance.
   - Update the "Upstream Dependencies" / floor mentions to `>=0.80.0`.

Grep sweep before finalizing (mechanism reworded, not a removed symbol — so prose must be searched, not just symbols):

- `0.79`, `dist/index.js`, `both export`, `no peer-floor bump`, `peer-floor`, `lazy-registration`, `clobber`, `re-register` across `src/`, `test/`, `docs/architecture.md`, `AGENTS.md`, `.pi/skills/anthropic/SKILL.md`.
- Leave historical plan/retro files (`docs/plans/0028|0031|0033|0035*`, `docs/retro/*`) untouched: they are dated records of prior decisions, not live documentation.

## Test Impact Analysis

This is a config-and-docs regression fix, not an extraction, so the test surface barely moves.

1. No new unit tests are enabled — the floor bump removes a branch rather than adding a collaborator.
   The existing `test/host-transport.test.ts` is the right guard: after the dev-dependency bump it runs against 0.80.x and still asserts the resolved namespace exposes a callable `streamSimpleAnthropic`, so a 0.80.x that dropped the alias would fail here.
2. No existing tests become redundant.
3. `test/host-transport.test.ts` and `test/index-registration.test.ts` must keep passing unchanged against the bumped dev dependency — they exercise the resolution and registration paths that the floor change re-targets.
   The live `pi -e` repro on a 0.80.x host is the only check that proves the multi-turn 400 is gone, because vitest resolves the dev-dependency root rather than the host's aliased entrypoint.

## Invariants at risk

- The transport wrapper must still resolve a callable delegate and shape every OAuth call path (Issue #18/#28 outcome).
  Pinned by `test/host-transport.test.ts` (delegate resolves to a function) and `test/oauth-transport.test.ts` (`onPayload` composition and `sk-ant-oat` gating).
- API-key and non-Anthropic requests must remain untouched.
  Pinned by `test/oauth-transport.test.ts` token-gating cases.
- Registration must still preserve the built-in model list and OAuth login override.
  Pinned by `test/index-registration.test.ts`.

## Ordered Steps

This is a non-TDD plan (dependency, docs, and comment changes with a live-repro gate); route it to `/build-plan`.

1. **Bump the floor and dev toolchain.**
   Raise both `peerDependencies` to `>=0.80.0` and repin both `devDependencies` to the latest 0.80.x, then `pnpm install`.
   Run `pnpm run check` and `pnpm test` against 0.80.x; confirm `host-transport` and `index-registration` suites pass.
   Commit: `fix!: require pi-ai/pi-coding-agent >=0.80.0 to fix multi-turn OAuth 400` with a `BREAKING CHANGE:` footer noting pi 0.79.x is no longer supported and citing #40.

2. **Live repro on a 0.80.x host.**
   Run the multi-turn `pi -e` repro (at least two model turns, e.g. `pi ... -p` with `hello` then `ping`, or two prompts in one session) using the built `src/index.ts`, confirming no "out of extra usage" 400 on the second turn.
   This is a verification step, not a commit; if it fails, stop and re-open the diagnosis before proceeding.

3. **Drop the dual-version handling prose.**
   Rewrite the `src/host-transport.ts` JSDoc and the `test/host-transport.test.ts` header comment to target only the 0.80.x compat entrypoint; remove the "no peer-floor bump" / `dist/index.js` claims.
   Re-run `pnpm run check` and `pnpm test`.
   Commit: `docs: scope host-transport resolution to the pi-ai 0.80.x compat entry (#40)`.

4. **Update architecture and agent docs.**
   Apply the `docs/architecture.md` and `AGENTS.md` edits from Module-Level Changes, run the grep sweep, and fix any stale `0.79`/`peer-floor` prose it surfaces.
   Commit: `docs: drop pi 0.79.x dual-layout notes after raising the floor (#40)`.

## Risks and Mitigations

- **Risk:** the diagnosis is wrong and the second-turn 400 has another cause, so the floor bump only appears to fix it.
  **Mitigation:** the mechanism is code-verified across `v0.79.8` and `v0.80.0` (the 0.79.x lazy delegate calls `register()` and clobbers the registry; 0.80's `lazyApi` does not), and Step 2's live repro on a 0.80.x host confirms the second turn succeeds end-to-end.
- **Risk:** relying on the `@deprecated` `streamSimpleAnthropic` alias breaks on a future 0.81 that removes it.
  **Mitigation:** the existing `pickAnthropicStreamSimple` error path fails loudly, and `test/host-transport.test.ts` guards the alias's presence; the non-deprecated-accessor switch is captured as an Open Question.
- **Risk:** dropping 0.79.x support strands users who cannot upgrade pi.
  **Mitigation:** this is the operator-chosen, breaking direction; the `fix!:`/`BREAKING CHANGE:` footer documents it, and pinning the prior working release (0.6.3) remains a fallback for 0.79.x users.

## Open Questions

- Should the resolver switch from the `@deprecated` `streamSimpleAnthropic` to the non-deprecated `anthropicMessagesApi().streamSimple` while the floor is being raised?
  Deferred: it is a resolution-mechanism change needing its own live-repro pass and is not required to fix #40.
- `>=0.80.0` is the correct floor on the verified mechanism: the `lazyApi` restructure that removed the `register()` side effect landed at 0.80.0 (the `compat.ts` / `api/*` split).
  Pin `devDependencies` to the latest 0.80.x for the toolchain, but keep the peer floor at the `>=0.80.0` boundary where the fix actually lands.
