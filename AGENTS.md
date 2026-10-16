# AGENTS Guide: pi-anthropic-auth

This file contains shared context for agents working in this repository.
Keep it focused on information that multiple agents need: repository purpose, current architecture, constraints, commands, and known gotchas.
Do not turn this into a task log.

Project-level reusable workflows belong in `.pi/skills/`, reusable slash-command flows in `.pi/prompts/`, and custom subagents in `.pi/agents/`.
This repo includes repo-specific skills (Anthropic OAuth debugging, Pi CLI repro, frontmatter, upstream watch) plus a shared workflow toolkit (code design, testing, fallow, improvement discovery, pre-completion, shell and edit-tool traps, and others) kept in parity with `~/development/pi/pi-packages/`.
The Skill Index under Architecture maps each task to the skill to load before it.

## Admission test

This file is loaded into every session; a skill's body is loaded only when read.
Before adding a passage here, answer three questions in order:

1. Could a current model act correctly without it?
   If yes, it belongs nowhere.
2. Is it needed before any workflow step has run, or is it an environment fact no model could infer?
   If neither, it belongs in the body of the topic skill whose trigger it fires at.
   Every rule has a loader now; a missing destination is a reason to create one, not to keep the rule here.
3. Does the rule stand without its incident?
   If yes, keep the rule and drop the story; a `(Refs #N)` stays only when the issue encodes a constraint a reader may need to trace.

A rule whose incident has not recurred in any recent retro is a delete candidate — guidance, not a verdict, since the rule may be why it has not recurred.

## Project

### Overview

`pi-anthropic-auth` is a small pnpm-based Pi package.
Its purpose is to minimally override Pi's built-in `anthropic` provider to improve Claude Pro/Max OAuth compatibility without breaking Pi's normal Anthropic API-key behavior.

The design intent is explicitly minimal.
Prefer wrapping or extending Pi's existing Anthropic behavior over replacing it wholesale.

### Primary Goal

Preserve all of Pi's normal Anthropic UX while adding only the compatibility layers Pi still appears to be missing for Claude Pro/Max OAuth.

That means preserving:

1. Built-in provider name: `anthropic`
2. Built-in model list
3. Normal Anthropic API-key behavior
4. Native `/login anthropic` UX

### Current Status

The current implementation does the following:

1. Re-registers the built-in `anthropic` provider with a thin `streamSimple` transport wrapper (login and refresh are delegated to Pi's built-in `anthropicOAuth`)
2. Wraps Pi's built-in Anthropic transport to shape OAuth requests on every call path that reaches `provider-composer` (main loop, compaction, and extension calls through `ctx.modelRegistry.streamSimple()`; not explicit `compat.streamSimple` callers — see Issue #46 and Issue #53)
3. Prepends an Anthropic billing/content-consistency header block to `system[]`
4. Sanitizes Pi's default prompt section by section during the same shaping pass — replacing the untagged preamble with a minimal neutral prompt, dropping the `docs` section, and stripping the custom-tool filler from inside `tools` — while preserving every other section byte-identically (tool snippets, guidelines, and appended extension content)
5. Applies the same section rules to the mid-conversation system messages Pi 0.86.0 re-sends on models that accept them (Issue #69), while keeping the content-less effort messages Pi sends on managed-effort models (PR #79)
6. Raises the billing header's `cc_version` to Pi's own `claude-cli` version at the wire when Pi reports a higher one, making the bundled pin a floor rather than the answer (Issue #74)
7. Recovers from a `claude_code_version_too_old` rejection by retrying once at the floor Anthropic names, remembering that floor for later requests, and appending a hint to the error when it cannot recover (Issue #75)
8. Gates all shaping on the `sk-ant-oat` OAuth access-token prefix, so API-key and non-Anthropic requests pass through untouched
9. Registers the same wrapper on any extra provider named in the extension's config file, for Anthropic OAuth subscriptions another extension registers under its own name (pi-multi-pass's `anthropic-2`, Issue #70)

It wraps, but does not reimplement, Pi's built-in Anthropic streaming transport.
The wrapper delegates to Pi's own built-in Anthropic `streamSimple` transport and injects two steps: an `onPayload` shaping step, and an `options.fetch` wrapper for the version reconciliation and rejection recovery, which need the built request's headers and the response.

## Principles

### Keep The Override Thin

Prefer the smallest integration point that works.
If Pi already supports a behavior upstream, reuse it instead of copying it locally.
Thinness governs request shaping, not user-facing diagnostics: when a failure is ours to explain, prefer an actionable message over the raw upstream error (Refs #75).

### Preserve Built-In Behavior By Default

API-key Anthropic behavior is the baseline.
Any OAuth-specific logic must be narrowly gated so it does not affect non-OAuth Anthropic requests.

### Prefer Request Shaping Before Prompt Rewriting

Start with billing/header injection and exact request-shape fixes.
Do not add broader prompt rewriting unless real failures show it is necessary.

### Isolate Compatibility Logic

Anthropic validation rules drift.
Keep compatibility logic in small helpers so it is easy to adjust without touching the rest of the extension.

## Architecture

### Extension Surface

The main extension entrypoint is `src/index.ts`.

It uses one Pi extension seam:

1. `pi.registerProvider("anthropic", { api: "anthropic-messages", streamSimple })`, plus the same `{ api, streamSimple }` registration for each provider named in `<agentDir>/extensions/pi-anthropic-auth/config.json`, and — from a `session_start` handler, only for a trusted project — in `<cwd>/.pi/extensions/pi-anthropic-auth/config.json`

The `streamSimple` wrapper is the single shaping point.
It delegates to Pi's built-in Anthropic `streamSimple` transport (resolved at runtime by `src/host-transport.ts`) while injecting an `onPayload` step that runs all provider-specific logic (billing header injection, system prompt shaping).
It also injects an `options.fetch` wrapper for OAuth requests, because one fact — the Claude Code version pi reports in its `user-agent` — is only observable on the built request, downstream of `onPayload` (Issue #74).
The delegate is resolved at runtime rather than read from the api registry: `anthropicMessagesApi()` is the non-deprecated handle pi's own `custom-provider-gitlab-duo` example uses, and reading from a registry this extension does not participate in would bind the delegate to whatever another extension registered there last.
On pi <=0.80.7 it would also have recursed, because `registerProvider` bridged our wrapper into that slot.
The pi-ai 0.79.x lazy-registration clobber (Issue #28) is precluded by the `>=0.86.0` peer floor.
Shaping is gated on the `sk-ant-oat` OAuth access-token prefix, the same signal Pi's built-in provider uses internally.

Important upstream behavior confirmed from `~/development/pi/pi`:

1. Re-registering `anthropic` with `oauth` overrides `/login anthropic` auth handling without replacing built-in models (still an available upstream capability, but this extension intentionally omits `oauth` since Issue #43 and delegates login/refresh to the built-in `anthropicOAuth`)
2. Omitting `models` preserves Pi's built-in Anthropic model list
3. `registerProvider({ api, streamSimple })` no longer bridges into pi-ai's api registry: pi 0.80.8 dropped that call in the `ModelRuntime` rewrite.
   `provider-composer` applies the wrapper on `modelRuntime` requests instead, so callers that dispatch through pi-ai's own `compat.streamSimple` are confirmed uncovered (Issue #46), while extension calls through `ctx.modelRegistry.streamSimple()` (pi >=0.86.0) reach it (Issue #53)
4. `before_provider_request` only fires for the interactive agent loop, so it cannot reach auxiliary OAuth calls — this is why the wrapper replaced the former hook-based shaping

### Local Files

Current source layout:

1. `src/index.ts`: extension registration (transport wrapper + `/anthropic-auth:status` command)
2. `src/host-transport.ts`: runtime resolution of Pi's built-in Anthropic transport via an `@earendil-works/pi-ai/compat` import through Pi's loader indirection, reading the `anthropicMessagesApi()` factory off the compat namespace (Issue #28, Issue #31, Issue #35, Issue #54)
3. `src/oauth-transport.ts`: token-gated `streamSimple` wrapper that applies shaping on every Anthropic call path reaching `provider-composer` (Issue #46)
4. `src/request-shaping.ts`: Anthropic OAuth request shaping helpers
5. `src/anthropic-message.ts`: loose structural types for the `messages[]` entries shaping and billing-header construction both read
6. `src/billing-header.ts`: the `x-anthropic-billing-header` recipe — salt, sampled positions, entrypoint, and `buildBillingHeaderValue(messageText, version)`
7. `src/claude-code-version.ts`: the Claude Code version floor, its env override, `claude-cli` user-agent parsing, numeric version comparison (Issue #74), and the floor learned from rejections (Issue #75)
8. `src/billing-version-sync.ts`: per-request `fetch` wrapper that raises `cc_version` to Pi's reported `claude-cli` version at the wire (Issue #74), and retries or hints a `claude_code_version_too_old` rejection (Issue #75)
9. `src/version-rejection.ts`: parser for Anthropic's `claude_code_version_too_old` rejection body and the recovery hint wording (Issue #75)
10. `src/system-prompt-sections.ts`: parser for Pi's XML-sectioned system prompt, splitting it into ordered chunks and rendering them back byte-exactly (Issue #67)
11. `src/system-prompt-shaping.ts`: section-aware Anthropic OAuth prompt sanitizer that replaces Pi's preamble, drops the `docs` section, strips the `tools` filler, and preserves everything else
12. `src/debug.ts`: opt-in structured debug logging for live OAuth repros
13. `src/diagnostics.ts`: `ExtensionDiagnostics` value object, formatter, argument completions, and handler factory for the `/anthropic-auth:status` command, including its per-provider `accounts:` block (Issue #80)
14. `src/extension-config.ts`: the config file paths and a parser that turns malformed files and entries into warnings instead of throwing (Issue #70)
15. `src/extra-provider-shaping.ts`: registers the wrapper on each provider the config names, never unregistering it, and records the naming layer and warnings for the status command (Issue #70)
16. `src/account-profile.ts`: looks up the Anthropic account behind a provider's OAuth login via `GET /api/oauth/profile`, never throwing, for the status command (Issue #80)

### Project Skills

Project skills live in `.pi/skills/`.

Repo-specific skills:

1. `anthropic`: Anthropic OAuth compatibility lessons and debugging workflow
2. `pi-cli-repro`: repeatable `pi -p ... -e ...` repro workflow
3. `frontmatter`: Pi skill frontmatter template and rules
4. `upstream-watch`: load-bearing upstream Pi assumptions and the impact taxonomy for triaging a new Pi release

Shared workflow skills (synced from `pi-packages`, adapted to this single package):

1. `code-design`: TypeScript conventions, SOLID, file organization, Pi SDK patterns
2. `design-review`: dependency and structural smell review
3. `improvement-discovery`: smell taxonomy and prioritization for improvement rounds
4. `testing`: vitest mock patterns, assertion strategy, TDD planning rules
5. `pre-completion`: pre-completion protocol that dispatches the `pre-completion-reviewer` subagent
6. `tidy-first`: preparatory-refactor protocol that dispatches the `tidy-first-assessor` subagent during `/plan-issue`
7. `fallow`: dead-code, duplication, and complexity analysis via the `fallow` CLI
8. `markdown-conventions`: rumdl-enforced markdown rules
9. `mermaid`: Mermaid authoring and verification
10. `pi-extension-lifecycle`: Pi turn/tool execution and extension event lifecycle
11. `shell-traps`: bash traps beyond the zsh facts in Shell (`rg -r`, `pipefail`, backtick bodies, re-verifying counts)
12. `edit-tool`: atomic `Edit` batches, non-ASCII `oldText`, scripted substitutions, block insertion

### Project Prompts

Reusable slash-command flows live in `.pi/prompts/` (synced from `pi-packages`, adapted to this repo):

1. `plan-issue`: read a GitHub issue and write a numbered plan to `docs/plans/`
2. `tdd-plan`: execute a plan's TDD steps as red→green→verify→commit cycles
3. `build-plan`: execute a non-TDD plan (docs/config/prose changes)
4. `pr-review`: triage a third-party PR (adopt/adapt/decline) and hand off to `plan-issue`
5. `ship-issue`: push, close the issue, and dispatch the release
6. `ship-no-issue`: push, verify CI, and dispatch the release (no issue)
7. `retro`: review a session for workflow improvements and persist retro notes
8. `retro-note`: persist a quick retro observation to `docs/retro/`
9. `upstream-impact`: assess a new Pi/pi-ai release against the `upstream-watch` assumptions

The fallow-discovery prompts (`plan-improvements`, `finish-phase`), the `audit-agent-docs` prompt, and the worktree flows (`sync-worktree`, `triage-backlog`) from `pi-packages` are intentionally not ported.

### Project Agents

Custom subagents live in `.pi/agents/`:

1. `pre-completion-reviewer`: fresh-context quality reviewer run before `/ship-issue`
2. `tidy-first-assessor`: fresh-context preparatory-refactor scout run during `/plan-issue`, after the design is settled and before the plan is written; its accepted recommendations become `refactor:`/`test:` steps in the plan's TDD Order

The `craftsmanship-scout` agent from `pi-packages` is intentionally not ported — its only consumer is the unported `/plan-improvements` prompt.

The `ship-*` and CI/issue steps in the prompts use the `@gotgenes/pi-github-tools` extension, declared in `.pi/settings.json`.

### Skill Index

Before you do the thing in the left column, load the skill in the right one.

| Before you… | Load |
| --- | --- |
| touch OAuth shaping in `src/`, or debug an Anthropic OAuth failure | `anthropic` |
| run a live `pi -p … -e …` repro | `pi-cli-repro` |
| assess a new Pi/pi-ai release, or change code that depends on upstream internals | `upstream-watch` |
| create or edit a skill's frontmatter | `frontmatter` |
| write, refactor, or review TypeScript, or design around a Pi SDK internal | `code-design` |
| add a parameter to a shared interface or rewire layers | `design-review` |
| write or debug a test, or sequence TDD steps | `testing` |
| write or edit markdown, a plan, or a retro | `markdown-conventions` |
| author or review a Mermaid diagram | `mermaid` |
| explore unfamiliar code | `colgrep` |
| compose a bash call with a pipeline, loop, heredoc, in-place edit, or `gh … --body` | `shell-traps` |
| run a multi-entry `Edit`, a scripted substitution, or a block insertion | `edit-tool` |
| run or read `fallow` | `fallow` |
| plan an improvement round or edit the roadmap | `improvement-discovery` |
| decide when an extension flushes, notifies, or intercepts | `pi-extension-lifecycle` |
| settle a design in `/plan-issue`, before writing the plan | `tidy-first` |
| finish `/tdd-plan` or `/build-plan` | `pre-completion` |
| write GitHub-facing text | `github-voice` |

`colgrep` and `github-voice` are user-installed (the `pi-colgrep` package and a global skill), not tracked in `.pi/skills/`.

### Upstream Dependencies

This repo depends on:

1. `@earendil-works/pi-coding-agent`
2. `@earendil-works/pi-ai`

When possible, reuse Pi behavior from the built-in `anthropic` provider rather than copying code from upstream.
As of pi-ai 0.80.8, `@earendil-works/pi-ai/oauth` re-exports types only; the low-level `loginAnthropic`/`refreshAnthropicToken` functions are module-private.

## Upstream Findings

These were confirmed by inspecting upstream `~/development/pi/pi` (GitHub: `earendil-works/pi`).

### Pi Already Handles

Pi's built-in Anthropic provider already includes:

1. Claude Code OAuth headers
2. Claude Code identity injection in `system[]`
3. Claude Code tool-name mapping
4. Native Anthropic OAuth login support

Note: Pi upstream already normalizes Anthropic OAuth tool names to Claude Code canonical casing. Do not add OpenCode-style `mcp_` tool prefix rewriting here unless a concrete Pi-specific transport failure proves the built-in normalization is insufficient.

### Gap Identified So Far

Refresh-token rotation robustness was previously patched locally by `mergeRefreshedCredentials`, preserving the previous `refresh_token` when a refresh response omitted one.
That override was dropped for Pi 0.80.8 compatibility (Issue #43); login and refresh are now handled by Pi's built-in `anthropicOAuth`, which does not merge an omitted rotation token, so a dropped rotation would require a manual `/login anthropic`.

A second gap surfaced from Issue #18: `before_provider_request` is threaded only into the interactive agent loop's `streamFn`.
Auxiliary Anthropic OAuth calls bypass it — built-in compaction/summarization issues `completeSimple` without `onPayload`, and third-party background agents (for example pi-observational-memory's observer, reflector, and dropper running via `agentLoop`) use pi-ai's bare `streamSimple`.
Those requests reached Anthropic with no billing header and were rejected as third-party app usage.
The transport wrapper closes this gap for calls that resolve their transport through `provider-composer` — the main loop and compaction, which reuses `agent.streamFunction`.
Since pi 0.86.0, background agents that pass `ctx.modelRegistry.streamSimple()` as their stream function route through `ModelRuntime` too, and are shaped; pi-observational-memory 3.1.x does exactly that (measured live, Issue #53).
Callers that dispatch through pi-ai's own `compat.streamSimple` are confirmed to bypass it on pi >=0.80.8 (Issue #46): extensions passing it explicitly, and untyped callers that omit `streamFn` and land on the `setDefaultStreamFn` fallback (the types have required `streamFn` since pi-agent-core 0.81.0).
That gap is deliberately not closed here — the api registry is keyed by api rather than provider, so an override would divert all ten `anthropic-messages` providers off their built-in branch, and staying exact for `cloudflare-ai-gateway`'s provider-layer placeholder substitution would mean re-implementing compat's own dispatch.
`ModelRegistry.getProvider()` (pi 0.81.0) makes that reconstruction possible but not exact; Issue #53 re-examined and rejected it, along with a provider-aware `setDefaultStreamFn` override (`getDefaultStreamFn` is not exported, so it cannot chain).
See `docs/architecture.md` for the full record and the supported path for extension authors.

## Development

### Package Manager

Use `pnpm`.

### Shell

The `bash` tool runs zsh.
Quote a glob pattern meant for a command rather than the shell — `--include='*.ts'`, `find . -name '*.ts'`.
Unquoted, it expands against the cwd first: bash silently substitutes a matched filename, and zsh aborts with `no matches found`.
In zsh an unquoted parameter is not word-split, so `perl -pi -e '…' $FILES` passes the whole list as a single filename — spell a multi-file list inline.
Do not start a bash word with `=` — zsh's `equals` expansion reads `=word` as a command-path lookup, aborts, and discards the rest of an `A; B; C` chain; use `echo ---`, not `echo ===`.
When a shell loop or script needs a status variable, do not name it `status` — zsh reserves `$status` (an alias for `$?`) as read-only, so the assignment aborts with `read-only variable: status`; use `state`/`rc` instead.
The remaining shell traps (`rg -r`, pipelines under `pipefail`, backtick bodies) live in the `shell-traps` skill.

### Git Workflow

Before starting work, sync the branch with the remote using:

```bash
git pull --ff-only
```

Do this only with a clean working tree. If local changes already exist, commit or stash them first.

Make small Conventional Commit checkpoints during the work, not only at the end.
Prefer committing after each meaningful, validated milestone (for example: a bug fix, a test update, a docs pass, or a repro/debugging aid) so progress is recoverable and easy to review.

At the end of the work:

1. ensure all intended work is committed locally
2. push the branch
3. watch CI on `main`
4. dispatch the release once CI is green
5. run `git pull --ff-only` locally to pick up the release commit and tag

Do not dispatch a release while local commits are still unpushed — the dispatch releases what is on `main`, and the `sha` guard will abort if `main` is not where you think it is.

Release batching is plan-driven: the `improvement-discovery` skill defines a grep-able `Release:` tag (and a `Release batches` subsection) for roadmap steps, `/plan-issue` derives a `Release Recommendation` from those annotations, and `/ship-issue` reads the plan's `**Release:**` marker early — asking only when it is `mid-batch — defer`, otherwise dispatching the release now.

### Releases

Releases are **dispatched, never automatic**.
`.github/workflows/release.yml` triggers only on `workflow_dispatch` and takes an optional expected-SHA guard:

```bash
gh workflow run release.yml -f sha="$(git rev-parse HEAD)"
```

It runs three jobs: `prepare` (version, changelog, commit, tag, push), `publish` (npm Trusted Publishing), and `github-release` (notes rendered by git-cliff).

Before dispatching, ask what would release — read-only, offline, and instant:

```bash
./scripts/release/next-version.sh   # prints vX.Y.Z, or nothing
```

Do not reason about this from commit types when you can ask.
Most types cut a release (`cliff.toml` mirrors the visible/hidden split the retired `release-please-config.json` declared, so `docs:` and `chore:` do bump), but commits touching only paths absent from the published tarball do not — plans, retros, `.pi/`, `AGENTS.md`, and the top-level tooling config are excluded from the release scope, so none of them ships a version on its own (Refs #78).
`CLIFF_EXCLUDED_PATHS` in `scripts/release/lib.sh` is the list; the `docs/*.md` reference docs stay in scope deliberately.

Split a script that pushes from the read-only derivation it calls, and refuse the pushing half outside CI: `scripts/release/prepare-release.sh` guards on `CI` (override with `ALLOW_LOCAL_PUSH=1`), while `next-version.sh` only prints.

If `prepare` fails, nothing was tagged and the release can simply be re-dispatched.
If a later job fails, the tag is already pushed — fix the cause and re-run that job; re-dispatching would refuse on the existing tag.

Versions and changelog entries come from [git-cliff](https://git-cliff.org) reading local git, with no network in the derivation.
`CHANGELOG.md` is spliced, never regenerated: the entries below its era marker were produced under release-please with a different exclusion set, and regenerating would rewrite released history.
See `gotgenes/pi-packages`, `docs/decisions/0002-git-cliff-release-automation.md` for the full rationale and for the accepted residual — there is no release-PR review gate.

npm publishing uses Trusted Publishing, configured on npmjs.org against **`release.yml`**.
A change that moves the publishing job to another workflow file requires updating that configuration first, or `publish` fails on OIDC after the tag has already been pushed.

### Commands

Install dependencies:

```bash
pnpm install
```

Run the typecheck:

```bash
pnpm run check
```

Run fallow analysis (single package):

```bash
pnpm fallow            # full analysis
pnpm fallow:health     # complexity, hotspots, refactoring targets
pnpm fallow:dead-code  # unused files, exports, types, deps
pnpm fallow:dupes      # duplicated code blocks
```

Fallow runs in CI (`.github/workflows/ci.yml`, mirroring `pi-packages`): a `fallow audit` on pull requests, a `fallow dead-code` gate on `main`, and a non-blocking full `fallow` report on `main`.
It is not part of `pnpm run lint`, so run the `fallow:*` scripts locally before pushing.

### TypeScript

This repo uses `module: "ESNext"` and `moduleResolution: "Bundler"`.
Use extensionless import specifiers for local modules.
Use `#src/` and `#test/` aliases for cross-directory imports (e.g., `#src/constants` from test files).

### Commit Messages

All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/).

Format: `<type>[optional scope]: <description>`

Common types used in this repo:

- `feat`: new behavior or capability
- `fix`: bug fix or compatibility correction
- `docs`: documentation-only changes
- `chore`: maintenance, dependency updates, tooling
- `refactor`: restructuring without behavior change
- `test`: adding or updating tests

Examples:

```text
feat: add refresh-token fallback for rotated OAuth tokens
fix: always inject required OAuth betas regardless of upstream header
docs: add ask_user tool usage guidelines to AGENTS.md
chore: bump pi-ai peer dependency to 0.69.0
```

### Editing Conventions

1. Prefer ASCII unless the file already requires otherwise
2. Keep helper modules small and purpose-specific
3. Avoid introducing a custom full Anthropic transport unless hook limitations force it
4. Write non-ASCII characters literally in `Edit` `newText`, never as `\uXXXX` — a bad `oldText` fails loudly, a bad `newText` silently writes the escape into the file

## `ask_user` Tool Usage

This project has `pi-ask-user` installed as a local Pi plugin.
The `ask_user` tool renders as a compact dialog widget — not a document viewer.
Keep invocations lean and put supporting context in regular message output.

### When to use it

Load the `ask-user` skill and invoke `ask_user` before:

1. High-stakes architectural decisions (provider override strategy, seam changes, transport replacement).
2. Irreversible or costly-to-undo changes (large refactors, breaking API-key behavior).
3. Ambiguous requirements or conflicting constraints.
4. Any step where multiple valid options exist and the trade-off is preference-dependent.

A quick clarifying question is cheaper than 10 tool calls of inconclusive investigation.

### Manual actions

When a task requires a manual action from the user (e.g., run a `pi` command, log in via a browser flow, approve an OAuth prompt), use `ask_user` to gate on completion rather than printing instructions and continuing.

Use options like: `Done`, `Need help`, `Something went wrong`.

If the user selects `Need help` or `Something went wrong`, ask clarifying questions before retrying.

### Context before, not inside

Output all explanatory context — plan summaries, analysis results, trade-off notes — as regular message text **before** invoking `ask_user`.
The `question` parameter should be a concise prompt, almost never more than one sentence.
Options should be short and outcome-oriented.
When options differ in what they produce, include the rendered before/after — not just measurements of it — in that preceding message.

Do not ask on an open gap.
When the context you are about to present contains an unexplained discrepancy ("this reproduced locally but not in CI"), close it before asking — the options themselves may be wrong.
A cited claim is not a verified one.
When every option shares a premise this repo inherited rather than measured, test the premise first — the missing option is usually "remove the thing the premise justifies" (Refs #66).

### One decision per question

Each `ask_user` question addresses one decision.
Do not collapse several decisions into a single question's option set as combinations.

Bundle 2-3 questions into one call when they are facets of the same artifact or change (placement, depth, and cross-references for one doc section).
Make sequential calls only when the next question's options depend on the previous answer.

## Testing Guidance

Tests live in `test/` and run via `vitest`.

### Commands

Run the full suite:

```bash
pnpm test
```

Watch mode:

```bash
pnpm run test:watch
```

Live Pi repro (prefer the latest Haiku alias for fast feedback unless the bug appears model-specific):

```bash
pi \
  --model anthropic/claude-haiku-4-5 \
  -ne \
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

Always pass `-ne`.
It disables extension *discovery* while still honoring explicit `-e` paths, which is the only reliable way to guarantee the `-e` copy is the one under test.
Without it, the installed `packages[]` copy loads too and can silently win the provider registration, so the repro exercises the released code instead of the working tree — a green result then means nothing (see the Claude Code version-floor gotcha).

Run this live repro before treating any change to import specifiers, module resolution, or extension registration as done: green `check`/`lint`/`test` can still fail under pi's `jiti` loader, which resolves module specifiers differently from vitest (Refs #28).

Debug modes for live repros:

```bash
PI_ANTHROPIC_AUTH_DEBUG=all
PI_ANTHROPIC_AUTH_DEBUG=tool-use
```

Use `tool-use` by default when debugging real CLI flows so logs stay quiet until Anthropic tool calls are actually involved.

### Conventions

1. Test files are named `*.test.ts` and are collocated under `test/` (not next to source).
2. Tests use `node:assert/strict` for assertions and `vitest`'s `test` (and `onTestFinished` for per-test cleanup) for the runner. Existing files are the reference style — keep new tests consistent.
3. Keep tests focused on compatibility helpers rather than broad end-to-end behavior. Mock `globalThis.fetch` for OAuth flows; build payload fixtures inline rather than depending on Pi internals.
   Three suites are sanctioned exceptions, because depending on the internal *is* what they verify: `test/upstream-prompt-drift.test.ts` imports Pi's own `buildSystemPrompt` (Issue #52), `test/claude-code-version-drift.test.ts` drives Pi's own Anthropic transport to read its `claude-cli` user-agent (Issue #74), and `test/managed-effort-drift.test.ts` drives the same transport to read the effort messages it sends (PR #79).
   Do not treat any of them as precedent for other suites.
4. When asserting on shaped system prompts, prefer regex matches that pin specific markers (`/^You are an expert coding assistant\./`, `/<project_context>/`) over deep-equal on full prompt strings, so tests survive harmless reformatting upstream.
   Pin markers Pi actually emits: Pi replaced the `# Project Context` heading with `<project_context>` tags in v0.75.0, and an assertion on the old heading can only pass against a fixture that invented it (Issue #47).

### Coverage areas

Current suites map roughly to:

1. `test/oauth-transport.test.ts` — `sk-ant-oat` token gating, `onPayload` composition, `fetch` injection and composition, and delegation to the built-in transport.
2. `test/request-shaping.test.ts` — billing header injection, system block layering, beta-header merging, the structural messages-payload guard, and mid-conversation system messages, including the content-less effort messages that survive shaping (PR #79).
3. `test/claude-code-version.test.ts` — `claude-cli` user-agent parsing and numeric `X.Y.Z` comparison, including the unparseable-candidate fallbacks, and the learned floor.
4. `test/billing-version-sync.test.ts` — the wire-level `cc_version` upgrade: pass-through when Pi is absent, lower, or equal; rewrite when Pi is higher; the env override's absolute precedence; and that nothing outside the billing block changes.
   Also the rejection recovery: one retry at the named floor, the floor shared with later requests, success and unrelated 400 responses left unread, and each hint on an unrecovered rejection (Issue #75).
5. `test/version-rejection.test.ts` — parsing Anthropic's captured `claude_code_version_too_old` body, preserving its fields when a hint is appended, and each hint's wording.
6. `test/claude-code-version-drift.test.ts` — the offline drift alarm against the installed pi-ai: `options.fetch` is forwarded, the `claude-cli` user-agent parses, and our pin is not below Pi's (Issue #74).
7. `test/system-prompt-shaping.test.ts` — section-level removal and replacement, tag balance, tool-snippet and guideline preservation, appended-content preservation, extension-registered sections, and the degraded passthrough path.
8. `test/system-prompt-sections.test.ts` — chunk parsing and the byte-exact round-trip, including attribute-bearing tags, nested same-name tags, and unmatched open tags.
9. `test/pi-anthropic-ordering-experiment.test.ts` — pinned experiments documenting Pi's tool-use and interleaved-thinking serialization behavior, and our passthrough of both (Issue #66).
10. `test/upstream-prompt-drift.test.ts` — the prompt prefix, section names, and anchors in `src/constants.ts` checked against the installed Pi's own `buildSystemPrompt` output, plus pins that the parser round-trips that prompt and that shaping takes the section path rather than the degraded passthrough.
11. `test/extension-config.test.ts` — config paths, the parsing rules (`anthropic` and duplicates dropped, malformed files and entries warned), and a missing file staying silent.
12. `test/extra-provider-shaping.test.ts` — one `{ api, streamSimple }` registration per named provider, no unregister, first layer wins, and per-layer warning replacement.
13. `test/managed-effort-drift.test.ts` — the offline drift alarm for per-message effort: Pi's catalog still flags a managed-effort model, and for every model it flags, Pi still carries historical and active effort in content-less system messages, and OAuth shaping keeps every one of them (PR #79).
14. `test/account-profile.test.ts` — the profile lookup: no request without an OAuth token, the request's headers, tolerant field parsing, and each `unavailable` reason (Issue #80).

Priority areas for new tests:

1. Billing header generation
2. OAuth-only request-body shaping
3. System prompt shaping boundaries (section anchors, appended content preservation, tag balance, the degraded passthrough path)

## Gotchas

### Provider Hook Scope

`before_provider_request` only exposes the built payload, not the provider name or auth.
The current design avoids this entirely: shaping runs in the `streamSimple` transport wrapper, where the resolved `apiKey` is available and OAuth is detected by the `sk-ant-oat` prefix.
The former payload-structure guard (`isOAuthAnthropicPayload`) was removed in favor of this token gate.

### `model_select` Does Not Fire At Startup

Pi's `model_select` event only fires from `setModel` and `cycleModel`.
The initial model assigned during `createAgentSession` goes directly to `agent.state.model` without emitting the event.
Do not rely on `model_select` to track the provider for logic that must run on the first turn.

### `before_agent_start` Has No Provider Context

The `BeforeAgentStartEvent` does not expose which provider or model is active.
Provider-specific logic cannot be reliably gated in `before_agent_start`.

### `before_provider_request` Only Covers the Interactive Loop

Pi threads its `before_provider_request` hook (`onPayload`) into the main agent loop's `streamFn` only.
Built-in compaction (`completeSimple`) issues Anthropic requests through the same composed provider transport but without that hook.
Third-party background agents reach our wrapper when they pass `ctx.modelRegistry.streamSimple()` as their stream function (pi >=0.86.0, Issue #53).
Those calling pi-ai's bare `compat.streamSimple`, explicitly or through the `setDefaultStreamFn` fallback, do not reach it at all on pi >=0.80.8, and cannot be covered from this extension (Issue #46).
Any shaping that must apply to every OAuth request `provider-composer` sees belongs in the transport wrapper, not in `before_provider_request`.
`test/index-registration.test.ts` pins the boundary: registering the extension must leave the built-in `anthropic-messages` api-registry entry untouched.

### Shaping Is Scoped By Provider Name, Not By Api

`provider-composer`'s `streamWith` looks the extension config up by the request's provider, so only provider names this extension registers are shaped.
An Anthropic OAuth subscription another extension registers under its own name (pi-multi-pass's `anthropic-2`) otherwise falls through to pi's bare transport, which sends no billing header, and a real agent prompt is rejected with the misleading `You're out of extra usage.` 400 (Issue #70).
Short prompts pass without the header, so reproduce with a real project prompt — `-p "reply with exactly: PONG"` in this repo is enough, because the prompt carries this `AGENTS.md`.

The user names such providers in the extension's config file; see `docs/architecture.md`, "Provider-name scope".
Never `unregisterProvider` a named provider: it belongs to the other extension, and unregistering drops that owner's `models` and `oauth`.
The merge contract (see "`registerProvider` Merges, It Does Not Replace") is what makes the bare `{ api, streamSimple }` registration safe in either load order, and also why the config layers only ever add providers.
`src/index.ts` reads the global file through `getAgentDir()`, so `test/index-registration.test.ts` stubs `PI_CODING_AGENT_DIR` to an empty temp dir in a file-level `beforeEach`; a new test file that loads `#src/index` without that stub reads the developer's real config.

### Claude Code Version Floors Gate New Models

Anthropic rejects OAuth requests for a newly released model when the reported Claude Code version is below a per-model floor, with `error_code: claude_code_version_too_old`.
Claude Fable 5.1 (`claude-fable-5-1`) requires >= 2.1.251; the 2.1.206 pin blocked it entirely (Issue #60).
Claude Opus 5.5 (`claude-opus-5-5`, added to pi-ai's catalog in 0.87.1) requires >= 2.1.280; the 2.1.260 pin blocked it entirely (Issue #74).
Claude Sonnet 5.5 (`claude-sonnet-5-5`, added in pi-ai 0.99.0) accepts 2.1.280 with no rejection and no recovery retry (measured live on pi 0.99.1); that bounds its floor, if any, at or below 2.1.280 without naming one.
Claude Haiku 5.5 (`claude-haiku-5-5`, added in pi-ai 1.1.0) likewise accepts 2.1.280 with no rejection and no recovery retry (measured live on pi 1.3.0).

Two different version signals reach Anthropic:

1. `user-agent: claude-cli/<version>`, hardcoded as the module-private `claudeCodeVersion` in pi-ai's `anthropic-messages.ts` (2.1.75 through pi 0.84.4; 2.1.251 in 0.86.0 and 0.87.0; 2.1.280 in 0.87.1, which tracks Claude Code releases closely)
2. `cc_version=<version>` in the billing header this extension injects, from `CLAUDE_CODE_VERSION` in `src/claude-code-version.ts`

Anthropic gates on the billing header when it is present.
Verified live against `claude-fable-5-1` on pi 0.84.4: bumping only our `cc_version` fixed the rejection even though pi still sent `claude-cli/2.1.75`.
So this repo can fix a version floor without waiting on a pi release.

Since Issue #74 the two signals are reconciled rather than independent.
`CLAUDE_CODE_VERSION` is a **floor**: `src/billing-version-sync.ts` injects an `options.fetch` wrapper that reads pi's `claude-cli` user-agent off the built request and, when pi reports a higher version, rebuilds the billing header at pi's version on the way out.
A lower or unparseable pi version never lowers the pin, and an explicit `PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION` override is absolute — it is used verbatim and is never raised.
Measured live on pi 0.87.1 against `claude-opus-5-5`: with the pin forced to 2.1.260 the request succeeds, and with the same 2.1.260 supplied through the env override it is rejected.
Since Issue #75 the same `fetch` wrapper also recovers when Anthropic raises a floor above both pi and our pin.
It reads only a 400, through `response.clone()`, and when the body is a `claude_code_version_too_old` rejection naming a higher floor, it rebuilds the billing header at that floor and retries once.
The floor is remembered for the wrapper's lifetime (one floor for every model), so only the first request after a floor rise pays the rejected round trip.
Measured live on 2026-09-23: every rejection (n=4, `claude-opus-5-5` and `claude-fable-5-1`) named its floor as `version X.Y.Z or newer is required`, the floor is inclusive, a rejection costs under 0.63 s of whole-process wall time, and six older models accept any version down to 1.0.0.
When recovery cannot run (an env override is set, the floor is not named, the body cannot be rebuilt) or the retry is rejected too, the 400 reaches the user with a `[pi-anthropic-auth]` hint appended to `error.message`, which says whether to raise the override, set one, or upgrade pi.
So a surfaced `claude_code_version_too_old` now always carries that hint, and the hint names the cause.

Do not source the value from a local `claude --version`.
Claude Code's `stable` dist-tag lags `latest` (2.1.267 vs 2.1.280 on 2026-09-22), so an installed copy is routinely *below* the floor a new model requires; `npm view @anthropic-ai/claude-code dist-tags` is the check that matters.
Also confirm the value rather than trusting a number quoted in an issue or PR: Issue #60 and PRs #61/#62 each cited a different "current" version, and all three were stale by the time they were read.

`test/claude-code-version-drift.test.ts` is the offline alarm: it drives the installed pi-ai's own transport with a throwing capturing `fetch` and fails when our pin drops below pi's, when pi's user-agent stops parsing, or when pi stops forwarding `options.fetch` (which would silently disable the wire-level upgrade).
Raising the pin still matters when that fires: users on an older pi have no higher version to be raised to.

Users can override the pin at runtime with `PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION` (validated `X.Y.Z`, throws otherwise).

### Avoid Over-Porting From OpenCode

This repository is not trying to reproduce `opencode-anthropic-auth` wholesale.
OpenCode needed broader system prompt debranding.
Pi's built-in Anthropic provider is already much closer to the desired Claude Code request shape.

### Registering `streamSimple`

The extension registers a `streamSimple` wrapper, because hooks proved insufficient: `before_provider_request` does not fire for compaction or background-agent calls (Issue #18).
The wrapper stays thin — it delegates to Pi's own built-in Anthropic `streamSimple` transport (resolved at runtime via `src/host-transport.ts`) and only injects an `onPayload` shaping step gated on the OAuth token.
The delegate is resolved at runtime rather than read out of the api registry: `anthropicMessagesApi()` is the non-deprecated handle pi's own example uses, and reading from a registry this extension does not participate in would bind the delegate to whatever another extension registered there last (on pi <=0.80.7 it would also have recursed, since the bridge put our wrapper in that slot).
The resolver imports the `@earendil-works/pi-ai/compat` subpath — the path pi's own `custom-provider-gitlab-duo` example delegates through — which Pi's loader maps (through its `alias` or `virtualModules` table) to its own bundled pi-ai compat entrypoint (`dist/compat.js` on pi >=0.80.x).
It reads the non-deprecated `anthropicMessagesApi().streamSimple` factory and throws if that handle is absent.
There is no fallback to the deprecated `streamSimpleAnthropic` alias: the factory has shipped from the compat entrypoint since pi v0.80.0, below the `>=0.86.0` peer floor, so the fallback was unreachable and was removed (Issue #54).
The throw is what surfaces the compat-removal cliff loudly instead of mis-resolving.
The earlier `import.meta.resolve("@earendil-works/pi-ai")` plus subpath-file import bypassed that indirection — jiti consults its alias map on the import path but not the `resolve` path — so it fell through to the extension's own directory and failed under `pi install` / the Bun binary (Issue #31).
The #35 seam concern is resolved in practice on pi >=0.80.8 (the loader maps `/compat` in every mode and pi ships this delegation pattern as an official example); the residual watch is the eventual `compat` removal, when `anthropicMessagesApi()` relocates off the compat entrypoint.

### `registerProvider` Merges, It Does Not Replace

Pi's `ModelRuntime.registerProvider` (0.80.8+) overlays each registration's *defined* values on the previous one and preserves keys left `undefined`.
Omitting a field does not clear a value a prior registration set.
A stale installed copy that registers `oauth` keeps it in the merged config even after a fixed copy re-registers without `oauth`, so `/login` still runs the stale override (Issue #43).
The merge is an intentional upstream contract (the `ModelRuntime.registerProvider` source states it "merges defined values over the previous registration and preserves undefined ones, matching the legacy ModelRegistry contract"), so it will not be "fixed" upstream.
As partial hardening, `src/index.ts` calls `pi.unregisterProvider("anthropic")` before re-registering, restoring the built-in provider first so a stale merged `oauth` is cleared — but during the initial load phase the loader only drops *pending* registrations, so this only helps when the stale copy loaded *before* ours; running a single up-to-date copy remains the actual fix.
When a local `-e`/`"../"` copy and an installed `packages[]` copy both load, isolate to one copy before validating a registration change — pass `-ne` to suppress the discovered copies.
Note that `.pi/settings.json` and `~/.pi/agent/settings.json` are separate package lists, so removing the local `"../"` entry does not stop a globally installed copy from loading.
A breaking release ships as a major bump, so a stale installed copy pinned `^oldmajor` is not upgraded by `pi update` (it stays within the caret range); cross the major with `pi install npm:<pkg>@latest`, which rewrites the pin (Issue #43 shipped as `2.0.0`; a stale `^1.0.0` install kept clobbering refresh with the removed-API `oauth` override until re-installed).

### Model ID Alias Drift

Pi CLI model aliases and the locally installed `@earendil-works/pi-ai` package do not always accept the exact same Anthropic Haiku spelling.
In this repo, prefer the dashed form `anthropic/claude-haiku-4-5` in docs and repro commands, and `claude-haiku-4-5` in tests that call `getBuiltinModel("anthropic", ...)` directly.

### Verify Each Loader Mode

When asserting that behavior holds across loader modes, verify each one independently; do not extrapolate from the installed host.

As of pi 0.99.1 the loader (`packages/coding-agent/src/core/extensions/loader.ts`) picks among three modes:

1. Embedded modules (`isBunBinary || isNodeSeaBinary || isBundledNode`): `virtualModules` against modules embedded in the build, with `tryNative: false`.
   The npm `pi` bin has been the esbuild-bundled Node distribution (`dist/bundle/cli.js`) since pi 0.84.3, so npm installs take this mode, not the `alias` map; no pi release builds a Node SEA binary.
2. TypeScript source (pi run from its own `.ts` sources): `virtualModules` plus `tsconfigPaths`
3. Unbundled built Node (the `dist/index.js` library entry, for SDK embedders): the `alias` map resolved to `dist/...` entrypoints

Pi 0.84.0 added mode 2; before it, source runs took the `alias` path.
The minimum supported host is pi >=0.86.0; every mode maps both the bare `@earendil-works/pi-ai` specifier and the `/compat` subpath to pi's own pi-ai compat entrypoint (`dist/compat.js`), and all expose `unregisterProvider` on the extension API.

### Read Pi's Source From The Clone, Not The Installed `dist/`

Grep `~/development/pi/pi` for how Pi behaves — it is readable TypeScript, and `git`-navigable across tags.
A bare `rg` over `node_modules/@earendil-works/pi-coding-agent/dist/` instead returns 50 KB of noise per hit and truncates, because each `.d.ts.map` embeds the whole original source in `sourcesContent`.

The two answer different questions, and the clone is often ahead of the installed copy (v0.84.4 vs 0.84.0 as of Issue #64).
When the installed version is what matters, scope the grep: `rg -n <pattern> --glob '*.js' <dist-path>`.

### Diagnose Version Regressions From The Tag Source

When a regression's root cause is a version difference, `git diff` the source at both release tags (the `~/development/pi/pi` clone has them) before writing the diagnosis.
Eyeball greps that "look identical" and the installed dev copy both mislead (Refs #40).
When that diff contradicts a claim in `AGENTS.md` or `docs/`, check `gh issue list` before moving on — the contradiction is often an already-filed issue (Issue #46).

### Fresh Upstream Releases Trip The Lockfile Age Gate

`pnpm add`ing a package published <24 h ago writes a `minimumReleaseAgeExclude` entry that does **not** work: pnpm ignores the exclude list under `pnpm install --frozen-lockfile`, which is what CI runs (pnpm/pnpm#11203, #10266, still open at 12.x).
`pnpm clean --lockfile && pnpm install` clears the local symptom and leaves CI red.
The repo-level fix is `minimumReleaseAge` in `pnpm-workspace.yaml`, currently 60 minutes (Refs #67).

A local `--frozen-lockfile` run does not reproduce CI's check: pnpm caches a per-lockfile verdict in `~/.cache/pnpm/lockfile-verified.jsonl`, keyed by hash/path/mtime/inode, which survives deleting `node_modules` and moving the store aside.
Delete that file first, then look for `Verifying lockfile against supply-chain policies` in the output — without that line, the check did not run.
When the file is absent (pnpm 11 on macOS kept it nowhere under `~`), a frozen install over an up-to-date `node_modules` still exits early without verifying; delete `node_modules` to force the check.

That full re-resolution also pulls every other devDep forward within its caret range — run `pnpm run lint` before assuming the bump is clean (biome 2.4→2.5 forced a config migration in v2.0.2; 2.5.7→2.5.14 forced a schema migration in #67, and vite 8.2→8.3 made `esbuild` a real dependency needing `allowBuilds`).

## Related Files

1. `README.md`
2. `docs/architecture.md`
3. `docs/plans/minimal-anthropic-override.md`
4. `docs/plans/gap-analysis-and-next-steps.md`
5. `.pi/skills/`
6. `.pi/prompts/`
7. `.pi/agents/`
8. `.fallowrc.json`
9. `cliff.toml` and `scripts/release/`
10. Workflow parity source: `~/development/pi/pi-packages/`
11. Upstream reference clone: `~/development/pi/pi`
12. Example reference project: `~/development/opencode-anthropic-auth`
