---
issue: 59
issue_title: "feat: add Anthropic OAuth usage dashboard"
pr: 59
---

# Retro: #59 — feat: add Anthropic OAuth usage dashboard

## Stage: PR Review (2026-09-04T21:21:17Z)

### Session summary

PR [#59] from @jagaliano adds a `/anthropic-usage` slash command that reads Anthropic's undocumented OAuth control-plane endpoints and renders a tabbed TUI dashboard of subscription quota windows, account metadata, and extra-usage credits.
The underlying capability is real and I confirmed it live: both endpoints return `200` against the stored `sk-ant-oat0…` credential, and the structured `limits[]` array is a clean, durable seam.
The operator's decision is to **decline the PR in this repository and invite the contributor to own a separate `pi-anthropic-usage` package**, because a usage dashboard is a new feature rather than an OAuth compatibility layer, and it has essentially zero technical coupling to this package.

### Evaluation

#### Verification

The PR body is a claim; I verified the capability against current `main` before evaluating the design.
Using the access token from `~/.pi/agent/auth.json`:

```text
GET https://api.anthropic.com/api/oauth/usage    → 200
GET https://api.anthropic.com/api/oauth/profile  → 200
```

The usage response carries `limits[]` with three structured entries (`kind: "session"`, `kind: "weekly_all"`, `kind: "weekly_scoped"` with `scope.model.display_name`), alongside `extra_usage`, `spend`, and **seven** opaque legacy codename buckets: `nimbus_quill`, `tangelo`, `iguana_necktie`, `omelette_promotional`, `cinder_cove`, `amber_ladder`, `juniper_tide`.

#### Checks (scratch worktree, not trusted from the PR body)

`pnpm run check` passes.
`pnpm test` passes: 91 tests across 12 files.
`pnpm run lint` **fails** on `biome check`, rule `assist/source/organizeImports`, at `test/usage-client.test.ts:3` — `UsageClientError` is sorted before `USAGE_ENDPOINT`.
The PR body describes this as "one pre-existing import-order error remaining in untouched `test/usage-client.test.ts`", but that file is added by this PR and is neither pre-existing nor untouched.
CI's `check` job is already red for exactly this reason.

#### What is valuable

The endpoint discovery, now independently verified.
The `limits[]`-first normalization in `src/usage-types.ts`, which correctly prefers the structured array over legacy quota fields.
The token gate reusing `isAnthropicOAuthToken`.
The defensive `asRecord` / `asNumber` / `asNullable*` parsing discipline, which matches this repo's philosophy of tolerating upstream drift.
The `UsageClientErrorCode` taxonomy in `src/usage-client.ts`.

#### What I would change

Roughly half of `src/usage-types.ts` is a fallback for a shape that never occurs alone.
Because `limits[]` is populated live and correctly wins, `LEGACY_WINDOW_LABELS`, `parseLegacyWindows`, `parseQuotaWindow`, `USAGE_METADATA_KEYS`, and `humanizeIdentifier` — plus `isAdditionalQuota`, `hasAdditionalQuota`, the red styling, and the explanatory notes in `src/usage-command.ts` — are unexercised weight.

`HIDDEN_OPAQUE_QUOTA_KEYS = {"nimbus_quill"}` is a whack-a-mole allowlist.
Live data contains seven codename buckets; hiding one by name is a maintenance trap.

`UsageSnapshotCache` (83 source lines plus 122 test lines) is speculative for a user-typed slash command, and it keys its `Map` on the **raw OAuth access token** without pruning, so tokens accumulate for the process lifetime.
It also means a second invocation within 60 s shows stale numbers with no force-refresh path — the opposite of what a usage dashboard is for.

The command name `/anthropic-usage` diverges from the established `/anthropic-auth:status` namespace.

`test/index-registration.test.ts` weakens `CapturedCommand.handler`'s context type from `StatusCommandContext` to `unknown` to accommodate a second command shape.
A new feature should not cost type coverage on an existing one.

The TUI layer is hand-rolled: `truncateLine` re-implements ANSI-aware truncation, the palette is raw 16-color literals constructed two different ways (`String.fromCharCode(27)` versus `\u001b`), and `ui.custom`'s `theme` argument is explicitly discarded as `_theme`.

`formatUsageReport` prints `email`, and the Account tab prints account and organization UUIDs; in `--print` and `json` modes that reaches stdout and logs.

`PR.md` (92 lines) and `Plan.md` (359 lines) are contributor scratch files at the repository root.
`SpendInfo.canToggle` and `SpendInfo.disclaimer` are parsed but never rendered.

#### Scale and charter

The PR adds 1202 source lines to a 1071-line `src` tree, more than doubling the package.
`AGENTS.md` states the primary goal as preserving Pi's normal Anthropic UX while adding "only the compatibility layers Pi still appears to be missing for Claude Pro/Max OAuth".
A read-only usage dashboard is not a compatibility layer.

#### Coupling analysis (why a separate package is clean)

The only import from this package is `isAnthropicOAuthToken` in `src/usage-command.ts`, a three-line predicate over the 10-character constant `ANTHROPIC_OAUTH_TOKEN_MARKER = "sk-ant-oat"` (`src/oauth-transport.ts:18`).

Token acquisition and freshness belong to Pi, not to us.
Traced in the compiled source: `ModelRegistry.getProviderAuth(provider)` delegates to `this.runtime.getAuth(provider)` (`pi-coding-agent/dist/core/model-registry.js:71`), which calls `resolveProviderAuth` (`pi-ai/dist/models.js:281`), which refreshes the credential under a lock when it expires within the minimum-validity window (`pi-ai/dist/auth/resolve.js:66-90`).
A standalone package therefore receives an already-refreshed access token without touching `auth.json` or any code here.
Since Issue #43, login and refresh are handled by Pi's built-in `anthropicOAuth` regardless.

The control-plane path never touches `src/host-transport.ts`, `src/request-shaping.ts`, `src/system-prompt-shaping.ts`, or the pi-ai api registry — confirmed against the diff, not only the PR body's claim.

Consequently this package would need to expose **nothing**.
A separate package should re-declare the prefix check rather than take a dependency edge purely to share `"sk-ant-oat".includes()`.
Separation also widens the audience: a standalone usage package works for every Pi user with an Anthropic OAuth login, whether or not they install this compatibility shim.

### Decision and attribution

**Direction: decline PR [#59] here, and invite @jagaliano to own a separate `pi-anthropic-usage` package.**

Agreed scope of the close comment — pass along three findings as handover notes for the standalone package:

1. `limits[]` is the durable seam; the legacy-quota path and codename handling are largely unnecessary.
2. `UsageSnapshotCache` keys on the raw OAuth access token in an unpruned `Map`; worth changing wherever the code lands.
3. `ctx.modelRegistry.getProviderAuth` already refreshes the credential under a lock, so a standalone package needs no token plumbing.

Non-goals: the lint failure and the `PR.md` / `Plan.md` scratch files are deliberately omitted from the close comment, since this repository's tooling configuration does not govern the new package.

No implementation lands in this repository, so no `Co-authored-by:` trailer is required on any commit here.
Had we re-implemented or merged, the trailer would have been:

```text
Co-authored-by: José Antonio Galiano Sandoval <jagaliano@Joses-MacBook-Pro.local>
```

The close comment thanks @jagaliano by name, credits the endpoint discovery and the `limits[]` insight as genuinely useful findings, and explains the charter boundary rather than the implementation critique as the reason for declining.

[#59]: https://github.com/gotgenes/pi-anthropic-auth/pull/59
