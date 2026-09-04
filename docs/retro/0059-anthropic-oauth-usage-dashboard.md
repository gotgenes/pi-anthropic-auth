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

## Stage: Final Retrospective (2026-09-04T21:25:11Z)

### Session summary

A single-stage session: triage third-party PR [#59] end to end, from remote sync through a credited close comment.
The review confirmed the capability live, ran the full check gate in a scratch worktree, produced a concrete design evaluation, took the operator's direction through two `ask_user` rounds, and landed the triage note as `8f5eb02`.
No implementation work was in scope, and none happened.

### Observations

#### What went well

Verifying the capability with a live `curl` against the stored OAuth credential was the highest-leverage action in the session, and it was novel for this repo.
One tool call converted the PR body's unverifiable claim into hard evidence, and the response payload then produced the three strongest design findings directly: `limits[]` returns clean structured windows, there are **seven** opaque codename buckets rather than the one the PR hides by name, and `extra_usage` / `spend` are populated even when credits are disabled.
No amount of reading the diff would have surfaced the seven-bucket finding.

Tracing `getProviderAuth` through the compiled `dist` to answer the operator's coupling question paid off directly.
The `/pr-review` prompt's rule — "an evaluation that names a better seam is a claim about code you have not run" — is what turned a packaging opinion into a citable chain: `model-registry.js:71` to `models.js:281` to `resolve.js:66-90`.
The answer (Pi already refreshes under a lock, so a standalone package needs nothing from us) was decisive for the direction and would have been a guess otherwise.

The prompt's prediction about `pnpm run lint` was exactly right.
It flagged `assist/source/organizeImports` on `test/usage-client.test.ts:3`, which also exposed that the PR body's "pre-existing error in untouched `test/usage-client.test.ts`" described a file the PR itself adds.
Running the repo's own gate rather than trusting the contributor's validation section is a rule that earned its place.

#### What caused friction (agent side)

1. `missing-context` — I ran `git diff main -- README.md docs/architecture.md` from the scratch worktree to inspect the PR's documentation changes.
   The PR base (`c6605e2`) is 11 commits behind `main`, so that diff reported a spurious 26-line **deletion** of the `claude_code_version_too_old` README troubleshooting section, which the PR does not touch.
   I caught it by cross-checking `gh pr diff 59 --stat` (`README.md | 31 +++`, zero deletions) before writing anything down.
   Self-identified.
   Impact: no rework, but this was a near-miss on reporting a fabricated defect in the evaluation — precisely the failure mode the prompt's Verify gate exists to prevent, arriving through the diff command rather than the PR narrative.

2. `other` — a `grep -rn "getProviderAuth" node_modules/@earendil-works/pi-coding-agent/dist/` call matched inside a `.js.map` file and returned roughly 50 KB of minified sourcemap with inline `sourcesContent`, truncated to a temp file.
   The single fact I needed (the symbol is real and Pi's own `llama` extension uses it) was worth one line.
   Impact: a large, avoidable context burn; no rework.
   The follow-up attempt to narrow it with `--include=*.js` then failed on zsh globbing (`no matches found`), costing another round trip before quoting the pattern worked.

3. `other` — the `/pr-review` prompt's required gate is written entirely for bug-fix PRs: "reproduce it", "check whether it is already fixed", "locate the real boundary", "check the regression risk".
   PR [#59] is a feature PR with no defect to reproduce.
   I adapted by verifying the *capability* instead — do the claimed endpoints exist, authenticate, and return the shape the code assumes — which turned out to be the most valuable step in the review.
   Impact: no rework, but the adaptation was improvised rather than guided, and a less careful pass could reasonably have skipped the gate entirely on the grounds that "there is no defect here".

4. `other` — the prompt's attribution command, `gh pr view 59 --json commits --jq '.commits[].authors[] | {name, login, email}'`, returned `"login": ""` for every commit because the commit author email (`jagaliano@Joses-MacBook-Pro.local`) is not linked to a GitHub account.
   Impact: none in practice, since `author.login` from the earlier `gh pr view` call supplied `jagaliano`, but the prompt presents that command as the source for the `@<login>` close-comment credit.

#### What caused friction (user side)

Nothing that cost time.
The operator's one intervention was a model of strategic rather than mechanical oversight: rather than accepting or rejecting the separate-package option, the reply asked "Does it depend on our package at all? If so, what would we have to expose as an API?"
That reframed a packaging preference as an answerable evidence question and produced the finding that decided the whole direction.
Worth repeating as a pattern — the redirecting question beat a correction.

#### Diagnostic details

1. **Model-performance correlation** — the entire session ran on `anthropic/claude-opus-5` with no subagent dispatches.
   Appropriate for judgment-heavy triage work; no mismatch to flag.

2. **Escalation-delay tracking** — resolving "does `getProviderAuth` refresh the credential" took roughly eight consecutive `grep`/`sed` calls through `node_modules` (`dist/*.d.ts`, `core/extensions/types.d.ts`, `core/model-registry.js`, `pi-ai/dist/models.js`, `pi-ai/dist/auth/resolve.js`), including two that returned nothing and one zsh glob failure.
   That is over the five-call threshold and is the clearest "should have dispatched an `Explore` subagent" moment in the session.

3. **Unused-tool detection** — no `Explore` subagent and no `colgrep` call in the whole session.
   For this repo's own small `src` tree that is defensible, but the upstream `dist` archaeology in friction points 2 and 4 above is exactly the shape of work an `Explore` subagent absorbs without spending the main context on a 50 KB sourcemap.

4. **Feedback-loop gap analysis** — no gap.
   `pnpm run check`, `pnpm run lint`, and `pnpm test` all ran in the scratch worktree before the design evaluation, in the order the prompt specifies, and `pnpm run lint:md` ran before committing the retro note.
   Verification preceded judgment rather than trailing it.

### Changes made

1. `.pi/prompts/pr-review.md` — extended the Gather context step that records `baseRefOid` with instructions to read a lagging branch through `gh pr diff` or an explicit `git merge-base` diff, naming the spurious-deletion failure mode that a plain `git diff main` produces.
2. `.pi/prompts/pr-review.md` — added a capability-verification branch to the Verify gate for PRs that add a feature rather than fix a defect, scoping steps 1–2 to bug fixes and keeping steps 3–5 universal.

### Follow-ups not implemented

A proposed `AGENTS.md` gotcha covering `node_modules` `dist` grep hygiene (exclude `*.js.map`, quote `--include`, dispatch an `Explore` subagent for multi-hop upstream traces) was reviewed and declined for this commit.
The underlying friction is recorded in diagnostic lenses 2 and 3 above if it recurs and becomes worth encoding.
