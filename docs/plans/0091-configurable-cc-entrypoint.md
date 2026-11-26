---
issue: 91
issue_title: "Make the `cc_entrypoint` label configurable"
---

# Configurable `cc_entrypoint` label

## Release Recommendation

**Release:** ship independently

Issue #91 is not part of any `docs/architecture.md` roadmap batch, and the change is a self-contained user-facing feature (a minor bump).

## Problem Statement

The billing header this extension injects hardcodes `cc_entrypoint=sdk-cli` (`CLAUDE_CODE_ENTRYPOINT` in `src/billing-header.ts`).
Users in [anthropics/claude-code#97074] report requests labeled `sdk-cli` or `sdk-ts` drawing down the 5-hour window about twice as fast per token as interactive or custom labels, and one controlled measurement found a smaller weekly gap as well.
Issue [#83] asked to report `cli` instead; that was declined, with `sdk-cli` kept as the current choice until Anthropic answers #97074.

Issue #91 (third-party, `colinperel`) asks for the narrower thing: let each user set the label in the extension's existing `config.json`, keeping `sdk-cli` as the default, so the choice of label is the user's.

## Goals

- An optional `entrypoint` key in `config.json` sets the billing header's `cc_entrypoint` value; with the key absent the header is byte-identical to today's.
- Both config layers can set it: the global file at load, a trusted project's file at `session_start`; the project value overrides the global one.
- A label that would break the header or its JSON encoding is dropped with a config warning, and the next layer (or the default) applies.
- Every request carries one label everywhere the billing header is built: the `onPayload` shaping, the `cc_version` raise, the rejection retry, and the message-thread continuation splice.
- `/anthropic-auth:status` shows the active label and where it came from.
- Not breaking: the default, the header for users without the key, and every existing output stay unchanged; the status report gains one line.

## Non-Goals

- Changing the default label.
  Issue [#83]'s deferral stands: `sdk-cli` stays the default until Anthropic answers [anthropics/claude-code#97074].
- Restricting which labels a user may set beyond header safety.
  The operator chose the proposal as written over a variant that refuses Claude Code's own labels (`cli`, `claude-*`, `remote*`, …; Claude Code 2.1.326 recognizes 27).
  This reverses [#83]'s first Non-Goal ("behind a config file") for user-chosen values only; the extension itself still sends `sdk-cli`.
- An environment-variable override like `PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION`; nobody asked for one.
- Per-provider labels: every shaped provider shares one wrapper instance, and so one label.
- Measuring the metering effect through Pi (as of [#83] the operator's account exposed no 5-hour meter).
- The README terms-of-service section requested in Issue [#92]; a separate issue.
- Moving config-warning ownership out of `ExtraProviderShaping` (see Design Overview, "Warnings").

## Background

### The header and its four builders

`buildBillingHeaderValue(messageText, claudeCodeVersion)` in `src/billing-header.ts` emits:

```text
x-anthropic-billing-header: cc_version=<version>.<suffix>; cc_entrypoint=sdk-cli; cch=<hash>;
```

The label is plain text: it feeds neither the `cch` hash (first user text) nor the version suffix (salt, sampled characters, version).
Four `src/` call sites build the header, all reached from one wrapper request:

1. `src/request-shaping.ts` `prependBillingHeader` (from `onPayload`)
2. `src/billing-version-sync.ts` `rebuildBody`: builds `fromHeader` and `toHeader`, and bails unless `body.includes(fromHeader)` (the `cc_version` raise, Issue [#74]; the retry, Issue [#75])
3. the same `rebuildBody`, second call
4. `src/billing-version-sync.ts` `attachToContinuation` (message-thread continuations, Issue [#90])

Because the raise and the retry match the exact header string shaping emitted, the sync must build with the same label as shaping, or both silently bail and the request goes out at the pin.

### Config file

`src/extension-config.ts` parses `{ "providers": [...] }` and never throws: malformed files and entries become warnings.
`parseExtensionConfig` returns early when `providers` is absent or not an array, so a second key cannot be added after those returns.
`src/extra-provider-shaping.ts` `ExtraProviderShaping.apply(config, layer)` registers named providers and stores `config.warnings` per layer; `src/index.ts` reports them at `session_start` and in the status report.
`ConfigLayer` (`"global" | "project"`) lives in `extra-provider-shaping.ts`, its only user today.

`src/index.ts` creates the wrapper, then loads the global config; the project config is loaded in the `session_start` handler, only when `ctx.isProjectTrusted()`.

### Session lifecycle (verified in `~/development/pi/pi` at `9a4dcacb7`)

Each extension instance sees one `session_start`.
`/new`, `/resume`, and `fork` tear the runtime down (`AgentSessionRuntime.teardownCurrent` disposes the session) and build a new one through `createRuntime`, which loads extensions afresh; `/reload` invalidates the old runner, reloads resources, and emits `session_start` on the new runner.
So the project layer is applied at most once per instance, before the first prompt.

### Precedents the issue cites

All four (t3-code, Paseo #7976, xMatrix #1367, `earendil-works/pi-claude-code` `src/claude-cli.ts` line 585) launch the real `claude` binary and set `CLAUDE_CODE_ENTRYPOINT` on that process; this extension writes the header itself on direct `/v1/messages` calls.
The operator weighed that difference and chose to build the option as proposed.

### Evidence status (labels: measured / reported)

- Reported, #97074 (open, 77 comments, none from Anthropic as of 2026-11-26): `sdk-*` labels use the 5-hour window about 1.8-2.9x faster than `cli` or a custom label.
- Reported, [ricardoraposo's comment](https://github.com/anthropics/claude-code/issues/97074#issuecomment-6612846004) (Max 20x, 2026-11-03): `sdk-ts` used the weekly window 1.14x as fast as a custom label with caching on (95% CI 1.06-1.21) and 1.32x as fast as `cli` uncached.
  This contradicts the README's "The same reports suggest the weekly limit is not affected."
- Measured in [#83] (2026-11-01, Haiku 4.5): `cc_entrypoint=pi` returned 200 three times out of three, but acceptance cannot distinguish labels.
- Measured at planning time: a label containing `"` or `\` is escaped by `JSON.stringify`, so `body.includes(header)` is `false` for it; `pi-agent`, `Paseo`, and `ü` survive.

## Design Overview

### Config shape

```json
{ "providers": ["anthropic-2"], "entrypoint": "pi-agent" }
```

Either key may appear alone.
The key name `entrypoint` follows the issue and Claude Code's `CLAUDE_CODE_ENTRYPOINT` (operator's choice over `ccEntrypoint`).

```ts
export type ConfigLayer = "global" | "project"; // moved here from extra-provider-shaping.ts

export interface LoadedExtensionConfig {
  providers: readonly string[];
  /** The billing label this file sets; absent when unset or invalid. */
  entrypoint?: string;
  warnings: readonly string[];
}
```

The key is omitted, not `undefined`, when unset, so the existing `deepEqual` expectations in `test/extension-config.test.ts` (which use strict equality) stay valid.

### Validation

```ts
/**
 * Labels the header can carry verbatim.  `;` and whitespace would end the
 * field; `"`, `\`, and control characters would be escaped in the JSON body,
 * so billing-version-sync's exact-string rebuild would silently miss them.
 */
const ENTRYPOINT_LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
```

It is the same shape as `PROVIDER_NAME_PATTERN` but kept as its own constant: the reasons differ (a selectable provider id versus a header-safe, escape-free label), and one may change without the other.
Every one of Claude Code 2.1.326's 27 labels, the issue's examples (`pi-agent`, `Paseo`, `xmatrix`, `t3-code`), and `sdk-cli` match.
A non-string or non-matching value produces `${path}: "entrypoint" must be a label of letters, digits, ".", "_", or "-", received <JSON>` and no `entrypoint` key.
An invalid `entrypoint` never discards valid `providers`, and vice versa: the two keys parse independently.

### Layered resolution: `src/entrypoint-setting.ts` (new)

```ts
export type EntrypointSource = "default" | ConfigLayer;

export interface ActiveEntrypoint {
  label: string;
  source: EntrypointSource;
}

export class EntrypointSetting {
  private readonly byLayer = new Map<ConfigLayer, string>();

  /** Replaces this layer's label: sets it, or clears it when the file sets none. */
  apply(config: Pick<LoadedExtensionConfig, "entrypoint">, layer: ConfigLayer): void;

  /** project, then global, then DEFAULT_CLAUDE_CODE_ENTRYPOINT. */
  current(): ActiveEntrypoint;
}
```

Lifecycle of the per-layer value, in one place: **set** by `apply` when the layer's config carries a valid label; **cleared** by `apply` when it carries none (replace semantics, matching `ExtraProviderShaping`'s per-layer warnings; with one `session_start` per instance this only matters if a layer is ever re-applied); **read** by `current()`, which the wrapper calls once per request and the status command once per invocation.
`apply` takes `Pick<LoadedExtensionConfig, "entrypoint">` because it reads that one field.
It is deliberately not merged with `ExtraProviderShaping`: that class is a growing union with a registration side effect, this is a last-wins scalar, and a shared "layered setting" base would be the wrong abstraction.

### Threading one label per request

`buildBillingHeaderValue(messageText, claudeCodeVersion, entrypoint)` takes the label as a **required** third parameter, so the compiler flags all four `src/` builders; no test calls it (tests use the independent `buildExpectedBillingHeader` oracle).
`CLAUDE_CODE_ENTRYPOINT` is renamed `DEFAULT_CLAUDE_CODE_ENTRYPOINT`, and its doc comment says the user can override it (Issue #91).

`shapeAnthropicOAuthPayload(payload, entrypoint = DEFAULT_CLAUDE_CODE_ENTRYPOINT)` and `createBillingVersionSync(learnedFloor, baseFetch?, entrypoint = DEFAULT_CLAUDE_CODE_ENTRYPOINT)` take it as a trailing optional parameter.
Each has one `src/` caller (`oauth-transport.ts`) and 14 and 30 test call sites respectively (counted with `rg -c '<name>\(' test`); a required parameter would rewrite 44 test call sites to protect one production site.
That one site is pinned instead by the transport tests in TDD step 4, which fail when either collaborator misses the label.

`createAnthropicOAuthStreamSimple` changes from `(delegate, learnedFloor = …)` to an options object (no caller passes `learnedFloor` today; four call sites pass only `delegate`):

```ts
export interface AnthropicOAuthStreamOptions {
  /** Defaults to a fresh floor owned by this wrapper. */
  learnedFloor?: LearnedClaudeCodeFloor;
  /** Read once per OAuth request; defaults to DEFAULT_CLAUDE_CODE_ENTRYPOINT. */
  readEntrypoint?: () => string;
}
```

Inside the per-request closure, for OAuth requests only:

```ts
const entrypoint = isOAuthRequest ? readEntrypoint() : undefined;
const versionSync = isOAuthRequest
  ? createBillingVersionSync(learnedFloor, options.fetch, entrypoint)
  : undefined;
// …onPayload: return shapeAnthropicOAuthPayload(upstream, entrypoint);
```

One read per request means shaping and the sync cannot disagree even if the setting changed between `onPayload` and `fetch`.
API-key requests never read it.

### Wiring in `src/index.ts`

```ts
const globalConfig = loadExtensionConfig(globalConfigPath(getAgentDir()));
const entrypoint = new EntrypointSetting();
entrypoint.apply(globalConfig, "global");
const streamSimple = createAnthropicOAuthStreamSimple(delegate, {
  readEntrypoint: () => entrypoint.current().label,
});
// … register anthropic, then extraProviders.apply(globalConfig, "global")
pi.on("session_start", (_event, ctx) => {
  if (ctx.isProjectTrusted()) {
    const projectConfig = loadExtensionConfig(projectConfigPath(ctx.cwd));
    extraProviders.apply(projectConfig, "project");
    entrypoint.apply(projectConfig, "project");
  }
  reportConfigWarnings(extraProviders.warnings(), ctx);
});
```

Each file is read once and handed to both consumers.
The global config is now loaded before the wrapper is created; nothing in loading it depends on the wrapper.
A project label applies from the first request, for the same reason a project provider does: `session_start` is awaited before the first prompt, and the wrapper reads the setting per request.

### Warnings

Parser warnings for `entrypoint` land in `config.warnings`, which `ExtraProviderShaping.apply` already stores per layer and `index.ts` already reports, so they reach the UI and the status report with no new plumbing.
`EntrypointSetting` stores no warnings, or each would appear twice.
The class name now undersells what its `warnings()` returns; its doc comment says so, and a `ConfigWarnings` owner is deferred until a third config consumer arrives.

### Status report

`ExtensionDiagnostics` gains `entrypoint: ActiveEntrypoint`; `formatDiagnosticsReport` emits it after the transport line, before `shaped providers` (so the existing `shaped providers` → `accounts` → `config warnings` adjacency test is unaffected):

```text
pi-anthropic-auth diagnostics
  version: 3.7.0
  module:  /root/.pi/agent/.../src/index.ts
  built-in Anthropic transport: resolved
  entrypoint: pi-agent (global)
  shaped providers: anthropic, anthropic-2 (global)
```

`readDiagnostics` in `index.ts` reads `entrypoint.current()` per invocation, as it does for providers.

### Edge cases

- `{ "entrypoint": "sdk-cli" }` is valid and reports `sdk-cli (global)`.
- `{ "entrypoint": "" }`, `null`, a number, or `"a b"` / `"a;b"` / `"a\"b"`: warning, layer unset.
- An untrusted project's `entrypoint` is never read (the file is never opened).
- Thread continuations: the billing block lies outside Anthropic's thread fingerprint ([#90]), so the label a continuation carries cannot cause `thread_fingerprint_mismatch`; it is the same label within an instance anyway.

### Import graph

New edges: `entrypoint-setting` → `extension-config` (types), `entrypoint-setting` → `billing-header`; `diagnostics` → `entrypoint-setting` (type); `oauth-transport` → `billing-header`; `index` → `entrypoint-setting`.
Neither `extension-config` nor `billing-header` imports anything from this set, so no cycle forms.

## Module-Level Changes

- `src/extension-config.ts`: per-key parsing (`parseProviders`, then `parseEntrypoint`) merged in `parseExtensionConfig`; `ConfigLayer` moves here; `LoadedExtensionConfig.entrypoint?`; `ENTRYPOINT_LABEL_PATTERN`; module doc comment shows both keys.
- `src/extra-provider-shaping.ts`: imports `ConfigLayer` from `extension-config`; doc comment on `warnings()` notes that it reports every config warning, not only provider ones.
- `src/entrypoint-setting.ts` (new): `EntrypointSetting`, `ActiveEntrypoint`, `EntrypointSource`.
- `src/billing-header.ts`: `CLAUDE_CODE_ENTRYPOINT` → `DEFAULT_CLAUDE_CODE_ENTRYPOINT` with an updated doc comment; `buildBillingHeaderValue` gains required `entrypoint`.
- `src/request-shaping.ts`: `shapeAnthropicOAuthPayload(payload, entrypoint?)` relays to `prependBillingHeader`.
- `src/billing-version-sync.ts`: `createBillingVersionSync(learnedFloor, baseFetch?, entrypoint?)`; the closure passes it to all three `buildBillingHeaderValue` calls.
- `src/oauth-transport.ts`: `AnthropicOAuthStreamOptions`; one `readEntrypoint()` per OAuth request; docstring for the new option.
- `src/diagnostics.ts`: `ExtensionDiagnostics.entrypoint`; `formatDiagnosticsReport` line.
- `src/index.ts`: wiring above; comment on the entrypoint setting.
- `test/billing-header-fixtures.ts`: `buildExpectedBillingHeader(messageText, version?, entrypoint = "sdk-cli")`, keeping the literal (the oracle stays independent); the `see CLAUDE_CODE_ENTRYPOINT` comment names the renamed constant.
- `test/extension-config.test.ts`, `test/request-shaping.test.ts`, `test/billing-version-sync.test.ts`, `test/oauth-transport.test.ts`, `test/diagnostics.test.ts` (the `SAMPLE` fixture gains `entrypoint`; every other literal spreads it), `test/index-registration.test.ts`: new tests per TDD Order.
- `test/entrypoint-setting.test.ts` (new).
- Predicted unchanged:
  - `test/extra-provider-shaping.test.ts`: its literals `{ providers, warnings }` still satisfy the type, because `entrypoint` is optional.
  - `test/pi-anthropic-ordering-experiment.test.ts`, `test/managed-effort-drift.test.ts`, `test/message-thread-drift.test.ts`: each calls `shapeAnthropicOAuthPayload(payload)` or `createAnthropicOAuthStreamSimple(delegate)` with no second argument, which stays valid.
  - `test/thread-continuation.test.ts`: it uses a literal header string.
- `README.md`:
  - "Usage": a new subsection on the `entrypoint` key, referring to the config-file locations listed under "Additional Anthropic subscriptions", and noting that an edit takes effect at `/reload` or the next session.
  - "Verify the extension is loaded": add the `entrypoint:` line to the sample output, plus one sentence explaining it.
  - "Pi uses the 5-hour window faster than Claude Code": a neutral rewrite. It says the default is `sdk-cli`, gives the #97074 reports, and corrects the weekly sentence with the 1.14x/1.32x measurement. It notes those measurements came from Claude Code, not Pi, and that Anthropic has not said whether the weighting is intended. It points to the key, and leaves the choice of label to the user with no suggested value.
- `docs/architecture.md`:
  - The "Provider-name scope" config paragraph (lines 105-106) names the `entrypoint` key and its layering.
  - Item 3 of the shaping list (line 132) says the label defaults to `sdk-cli` and is configurable (Issue #91).
  - The module list gains `src/entrypoint-setting.ts`.
  - The `src/billing-header.ts` entry (line 320) mentions the entrypoint parameter.
  - No Mermaid block models the label (grep `sdk-cli`/`entrypoint`: only line 132).
- `AGENTS.md`:
  - "Current Status" gains an item for the configurable label.
  - In "Local Files", item 6 changes to `buildBillingHeaderValue(messageText, version, entrypoint)`, item 14 (diagnostics) mentions the entrypoint line, item 15 (extension-config) names both keys, and a new item covers `src/entrypoint-setting.ts`.
  - "Coverage areas" updates item 1 (oauth-transport: one label per request), item 11 (extension-config: the `entrypoint` rules), and adds `test/entrypoint-setting.test.ts`.
- `.pi/skills/anthropic/SKILL.md`:
  - The `cc_entrypoint` bullet (line 38) says the default is `sdk-cli` and users can set `entrypoint` (Issue #91).
  - Add that the label must stay JSON-escape-free, because the sync rebuilds headers by exact-string match.
  - The "Avoid by default" line (line 186) becomes "changing the default `cc_entrypoint` without first reading Issue #83 and Issue #91".
  - Add `src/entrypoint-setting.ts` to "Useful References".

## Test Impact Analysis

1. New tests the change enables:
   - `EntrypointSetting` precedence in isolation.
   - Label threading at the transport, which is the only place shaping and the sync meet.
   - Parser independence of the two keys.
2. Redundant tests: none.
   The existing default-label tests become invariant pins for the "absent key is byte-identical" goal.
   The default-label tests are the 13 that turn red when the constant changes (measured in [#83]: 10 in `test/billing-version-sync.test.ts`, 3 in `test/request-shaping.test.ts`).
3. Must stay as-is: every `test/extension-config.test.ts` `deepEqual`, which pins the omitted-key shape.
   The `test/index-registration.test.ts` tests with no config file pin the default on the composed path.

## Invariants at risk

| Invariant | Constituency | Pinned by |
| --- | --- | --- |
| No `entrypoint` key → billing header byte-identical to today (`cc_entrypoint=sdk-cli;`) | every existing user | `buildExpectedBillingHeader` literal oracle across `request-shaping`/`billing-version-sync` tests (unchanged calls use the defaults), plus a new `index-registration` assertion that the no-config path emits `sdk-cli` |
| Shaping and sync use one label, so the `cc_version` raise (Issue [#74]), retry (Issue [#75]), and continuation splice (Issue [#90]) still fire | users on new models, thread users | new `oauth-transport` tests in step 4 with a non-default label |
| Config parsing never throws; one bad key never discards the other | users with a typo | new `extension-config` tests in step 6 |
| An untrusted project's file is never read | users opening untrusted repos | existing `index-registration` "an untrusted project's config is never applied", extended in step 6 with an `entrypoint` assertion |
| API-key requests untouched | API-key users | existing `oauth-transport` "leaves the payload untouched for API-key requests" and fetch tests; `readEntrypoint` is read only for OAuth requests |
| `shaped providers` → `accounts` → `config warnings` adjacency in the status report | users pasting reports | existing `diagnostics.test.ts` "follows the shaped providers line…" (the new line goes before `shaped providers`) |

Baseline: 282 tests in 19 files pass (measured at planning time).

## TDD Order

1. `refactor: parse each config key in its own function`
   - Split `parseExtensionConfig` in `src/extension-config.ts`: keep the invalid-JSON and not-an-object early returns, and move the `providers` lookup, the array check, and `parseProviderEntries` into `parseProviders(parsed, path)`, which returns `{ providers, warnings }`.
   - This prepares the step-6 `entrypoint` key, which would be unreachable behind today's early return when `providers` is absent.
   - No new tests: the existing `test/extension-config.test.ts` suite pins behavior unchanged.
   - Verify: `pnpm test test/extension-config.test.ts && pnpm run check`.
2. `refactor: move ConfigLayer to extension-config`
   - Move the type into `src/extension-config.ts` and update the import in `src/extra-provider-shaping.ts` (its only user).
   - This prepares `entrypoint-setting.ts` to depend on the config module, not on a sibling, for a config concept.
   - Verify: `pnpm run check && pnpm test`.
3. `refactor: take createAnthropicOAuthStreamSimple options as an object`
   - In `src/oauth-transport.ts`, change the signature to `(delegate, { learnedFloor = createLearnedClaudeCodeFloor() }: AnthropicOAuthStreamOptions = {})`, keep the floor created once per wrapper, and update the docstring.
   - This prepares step 4's `readEntrypoint` option without a positional `undefined` at `src/index.ts`.
   - The existing "shares the learned Claude Code floor across requests" test pins the moved default.
   - Killing mutation (moved site): create the floor inside the per-request closure (`const floor = createLearnedClaudeCodeFloor()` above `createBillingVersionSync`). The sharing test must go red.
   - Verify: `pnpm test test/oauth-transport.test.ts && pnpm run check`.
4. `refactor: thread one billing entrypoint label through header construction`
   - `src/billing-header.ts`: rename the constant to `DEFAULT_CLAUDE_CODE_ENTRYPOINT` and give `buildBillingHeaderValue` a required `entrypoint`.
   - `src/request-shaping.ts` and `src/billing-version-sync.ts`: trailing `entrypoint = DEFAULT_CLAUDE_CODE_ENTRYPOINT` parameters, relayed to every builder.
   - `src/oauth-transport.ts`: the `readEntrypoint` option, read once per OAuth request and passed to both collaborators.
   - `test/billing-header-fixtures.ts`: `buildExpectedBillingHeader` gains `entrypoint = "sdk-cli"`, and its comment names the renamed constant.
   - It is `refactor:` because nothing supplies a non-default label until step 6.
   - New tests, all with label `pi-agent` and the expected header from `buildExpectedBillingHeader(text, version, "pi-agent")`:
     - `request-shaping`: `shapeAnthropicOAuthPayload(payload, "pi-agent")` prepends the `pi-agent` header.
     - `billing-version-sync`, a new `describe("a non-default entrypoint label")`:
       - The version raise rewrites a `pi-agent` header to Pi's higher version.
       - The retry at a named floor rebuilds a `pi-agent` header.
       - A continuation gets a `pi-agent` block.
     - `oauth-transport`, `describe("entrypoint label")`:
       - With `readEntrypoint: () => "pi-agent"`, `onPayload`'s shaped system starts with the `pi-agent` header.
       - The injected `fetch`, given that shaped body and a `claude-cli` user agent above the pin, sends the `pi-agent` header at Pi's version.
       - With a reader that returns `"first"` and then `"second"`, the shaped body and the fetch-raised body both carry `first`.
       - An API-key request never calls the reader.
   - Existing default-label tests are invariant pins (unchanged calls).
   - Killing mutations:
     - (a) In `buildBillingHeaderValue`, replace `${entrypoint}` with `${DEFAULT_CLAUDE_CODE_ENTRYPOINT}`. This kills every new test.
     - (b) In `oauth-transport.ts`, drop the `entrypoint` argument from `createBillingVersionSync(...)`. This kills the transport version-raise test and the first/second test, because the rebuild bails and the body stays at the pin.
     - (c) Replace the reused `entrypoint` const with a second `readEntrypoint()` call at the `shapeAnthropicOAuthPayload` call. This kills the first/second test.
     - (d) In `prependBillingHeader`, pass `DEFAULT_CLAUDE_CODE_ENTRYPOINT` instead of the parameter. This kills the `request-shaping` test and the transport `onPayload` test.
     - (e) Move `readEntrypoint()` above the `isOAuthRequest` guard. This kills the API-key reader test.
   - Verify: `pnpm test && pnpm run check`.
5. `refactor: add an EntrypointSetting that resolves the label across config layers`
   - Create `src/entrypoint-setting.ts` as designed, and add the optional `entrypoint` field to `LoadedExtensionConfig` (type only; the parser comes in step 6).
   - New `test/entrypoint-setting.test.ts`:
     - With nothing applied, `current()` is `{ label: "sdk-cli", source: "default" }`.
     - A global label wins over the default, with source `global`.
     - A project label overrides a global one, whichever order they were applied in.
     - A project config without a label falls back to the global one.
     - Re-applying a layer without a label clears that layer.
   - Killing mutations:
     - (a) Check `global` before `project` in `current()`. This kills the override test.
     - (b) In `apply`, return early when `config.entrypoint` is undefined instead of deleting the layer. This kills the clear test.
     - (c) Hardcode `source: "default"` in `current()`. This kills the source assertions.
   - Verify: `pnpm test test/entrypoint-setting.test.ts && pnpm run check`.
6. `feat: set the billing header's cc_entrypoint label in config.json`
   - `src/extension-config.ts`:
     - Add `parseEntrypoint` with `ENTRYPOINT_LABEL_PATTERN`.
     - Merge its result as `...(entrypoint !== undefined && { entrypoint })`.
     - Update the module doc comment.
   - `src/index.ts`:
     - Load the global config once, before creating the wrapper.
     - Create the `EntrypointSetting`, apply both layers to both consumers, and pass `readEntrypoint` to the wrapper.
   - `src/extra-provider-shaping.ts`: update the `warnings()` doc comment.
   - New `extension-config` tests:
     - `{"entrypoint": "pi-agent"}` alone parses to `{ providers: [], entrypoint: "pi-agent", warnings: [] }`.
     - Both keys parse together.
     - Each of `""`, `null`, `3`, `"a b"`, `"a;b"`, `"a\"b"`, and `"a\\b"` warns with the `"entrypoint"` message and has no `entrypoint` key.
     - An invalid `entrypoint` keeps valid `providers`.
     - Invalid `providers` keeps a valid `entrypoint`.
   - New `index-registration` tests, each running the registered wrapper's `onPayload` and reading the billing text:
     - With no config, the header carries `cc_entrypoint=sdk-cli;`.
     - A global `entrypoint` carries through.
     - A trusted project's `entrypoint` overrides the global one.
     - An untrusted project's `entrypoint` is ignored (this extends the existing untrusted test).
     - An invalid global label is reported as a config warning, and the header keeps `sdk-cli`.
   - Killing mutations:
     - (a) In `parseEntrypoint`, accept any string (drop the pattern test). This kills the `"a b"`/`"a;b"`/`"a\"b"`/`"a\\b"` cases.
     - (b) Omit the `entrypoint` spread in `parseExtensionConfig`. This kills the alone and together parser tests and the global and project index tests.
     - (c) Delete `readEntrypoint` from the `createAnthropicOAuthStreamSimple` call in `index.ts`. This kills the global and project index tests.
     - (d) Delete `entrypoint.apply(projectConfig, "project")`. This kills the project-override test.
     - (e) Move the project `apply` calls outside the trust check. This kills the untrusted test.
   - Commit trailer: `Co-authored-by: Colin Perel <59839704+colinperel@users.noreply.github.com>`.
   - Verify: `pnpm test && pnpm run check`.
7. `feat: show the active entrypoint label in /anthropic-auth:status`
   - `src/diagnostics.ts`: add `ExtensionDiagnostics.entrypoint` and the formatter line. `src/index.ts`: `readDiagnostics` reads `entrypoint.current()`.
   - `test/diagnostics.test.ts`: `SAMPLE` gains `entrypoint: { label: "sdk-cli", source: "default" }`.
   - New formatter tests:
     - `^  entrypoint: sdk-cli \(default\)$`.
     - `pi-agent (project)`.
     - The line precedes `shaped providers`.
   - New `index-registration` test: a global `entrypoint` appears in the status report as `entrypoint: pi-agent (global)`.
   - Killing mutations:
     - (a) Print the label without the source. This kills the formatter tests.
     - (b) In `readDiagnostics`, pass a constant `{ label: "sdk-cli", source: "default" }`. This kills the index status test.
   - Verify: `pnpm test && pnpm run check && pnpm run lint`.
8. `docs: document the entrypoint config key`
   - Update `README.md`, `docs/architecture.md`, `AGENTS.md`, and `.pi/skills/anthropic/SKILL.md` per Module-Level Changes.
   - The README section stays neutral (operator's choice): it gives facts and evidence with attribution, and suggests no label.
   - Verify:
     - `pnpm run lint`.
     - `pnpm exec rumdl check .pi`.
     - `rg -n 'CLAUDE_CODE_ENTRYPOINT\b' src test` finds only `DEFAULT_CLAUDE_CODE_ENTRYPOINT`.
     - `rg -n 'weekly limit is not affected' README.md` finds nothing.
     - Run the non-ASCII scans from `markdown-conventions`.

Before `/ship-issue`, run the live repro with a temporary global label to confirm the request is accepted end to end. Use `-ne`, `anthropic/claude-haiku-4-5`, and `PI_ANTHROPIC_AUTH_DEBUG=all`, and set `{"entrypoint": "pi-agent"}` in a temporary `PI_CODING_AGENT_DIR` copy, or in the real global file, restored afterwards. A 200 here shows the label is wired through and accepted; it cannot show metering (see [#83]).

## Risks and Mitigations

- **Silent label split between shaping and the sync.** If the two disagree, the version raise, retry, and continuation splice all bail without error. Mitigation: one read per request in the transport, and the step-4 transport tests, which go red under either split mutation.
- **Header- or JSON-breaking labels.** A `"` or `\` would be escaped in the JSON body, and the exact-string rebuild would then fail; this was measured at planning time. Mitigation: the allowlist pattern, plus a warning that falls back to the next layer.
- **A user sets an Anthropic first-party label such as `cli`.** The operator accepted this as the user's choice. The extension's own default and docs do not suggest it.
- **Anthropic starts validating `cc_entrypoint`, or changes how it meters labels.** The default users are unaffected. A user with a custom label would see the change and can delete the key. The README states that Anthropic has not documented the field's handling.
- **Stale docs.** Every literal `sdk-cli` claim outside the plans and retros was grepped: `README.md`, `docs/architecture.md`, the `anthropic` skill, and the fixture comment. Each is listed in Module-Level Changes.

## Open Questions

- Whether to change the default once Anthropic answers [anthropics/claude-code#97074]. The revisit trigger from [#83] still applies.

[#74]: https://github.com/gotgenes/pi-anthropic-auth/issues/74
[#75]: https://github.com/gotgenes/pi-anthropic-auth/issues/75
[#83]: https://github.com/gotgenes/pi-anthropic-auth/issues/83
[#90]: https://github.com/gotgenes/pi-anthropic-auth/issues/90
[#92]: https://github.com/gotgenes/pi-anthropic-auth/issues/92
[anthropics/claude-code#97074]: https://github.com/anthropics/claude-code/issues/97074
