# AGENTS Guide: pi-anthropic-auth

This file contains shared context for agents working in this repository.
Keep it focused on information that multiple agents need: repository purpose, current architecture, constraints, commands, and known gotchas.
Do not turn this into a task log.

Project-level reusable workflows belong in `.pi/skills/`, reusable slash-command flows in `.pi/prompts/`, and custom subagents in `.pi/agents/`.
This repo includes repo-specific skills (Anthropic OAuth debugging, Pi CLI repro, frontmatter) plus a shared workflow toolkit (code design, testing, fallow, improvement discovery, pre-completion, and others) kept in parity with `~/development/pi/pi-packages/`.

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
2. Wraps Pi's built-in Anthropic transport to shape OAuth requests on every call path (main loop, compaction, and background agents)
3. Prepends an Anthropic billing/content-consistency header block to `system[]`
4. Sanitizes Pi's default preamble by anchor during the same shaping pass — removing the Pi identity, custom-tool filler, and Pi documentation paragraphs and replacing only the identity with a minimal neutral prompt — while preserving tool snippets, guidelines, and appended extension content
5. Gates all shaping on the `sk-ant-oat` OAuth access-token prefix, so API-key and non-Anthropic requests pass through untouched

It wraps, but does not reimplement, Pi's built-in Anthropic streaming transport.
The wrapper delegates to Pi's own built-in Anthropic `streamSimple` transport and only injects an `onPayload` shaping step.

## Principles

### Keep The Override Thin

Prefer the smallest integration point that works.
If Pi already supports a behavior upstream, reuse it instead of copying it locally.

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

1. `pi.registerProvider("anthropic", { api: "anthropic-messages", streamSimple })`

The `streamSimple` wrapper is the single shaping point.
It delegates to Pi's built-in Anthropic `streamSimple` transport (resolved at runtime by `src/host-transport.ts`) while injecting an `onPayload` step that runs all provider-specific logic (billing header injection, message ordering, system prompt shaping).
The delegate is resolved at runtime rather than read from the registry to avoid infinite recursion: the registry entry for `anthropic-messages` is our own wrapper, so reading the delegate from it would loop.
On pi >=0.80.8, the pi-ai 0.79.x lazy-registration clobber (Issue #28) is precluded by the `>=0.80.8` peer floor.
Shaping is gated on the `sk-ant-oat` OAuth access-token prefix, the same signal Pi's built-in provider uses internally.

Important upstream behavior confirmed from `~/development/pi/pi`:

1. Re-registering `anthropic` with `oauth` overrides `/login anthropic` auth handling without replacing built-in models (still an available upstream capability, but this extension intentionally omits `oauth` since Issue #43 and delegates login/refresh to the built-in `anthropicOAuth`)
2. Omitting `models` preserves Pi's built-in Anthropic model list
3. `registerProvider({ api, streamSimple })` routes through pi-ai's singleton API registry (`registerApiProvider`), so the wrapper intercepts every `anthropic-messages` call path, including `completeSimple` compaction and `agentLoop` background work
4. `before_provider_request` only fires for the interactive agent loop, so it cannot reach auxiliary OAuth calls — this is why the wrapper replaced the former hook-based shaping

### Local Files

Current source layout:

1. `src/index.ts`: extension registration (transport wrapper + `/anthropic-auth:status` command)
2. `src/host-transport.ts`: runtime resolution of Pi's built-in Anthropic transport via a bare-root `@earendil-works/pi-ai` import through Pi's loader indirection (Issue #28, Issue #31)
3. `src/oauth-transport.ts`: token-gated `streamSimple` wrapper that applies shaping on every Anthropic call path
4. `src/request-shaping.ts`: Anthropic OAuth request shaping helpers
5. `src/system-prompt-shaping.ts`: anchor-driven Anthropic OAuth prompt sanitizer that replaces Pi's identity paragraph and preserves tool snippets, guidelines, and appended content
6. `src/debug.ts`: opt-in structured debug logging for live OAuth repros
7. `src/diagnostics.ts`: `ExtensionDiagnostics` value object, formatter, and handler factory for the `/anthropic-auth:status` command

### Project Skills

Project skills live in `.pi/skills/`.

Repo-specific skills:

1. `anthropic`: Anthropic OAuth compatibility lessons and debugging workflow
2. `pi-cli-repro`: repeatable `pi -p ... -e ...` repro workflow
3. `frontmatter`: Pi skill frontmatter template and rules

Shared workflow skills (synced from `pi-packages`, adapted to this single package):

1. `code-design`: TypeScript conventions, SOLID, file organization, Pi SDK patterns
2. `design-review`: dependency and structural smell review
3. `improvement-discovery`: smell taxonomy and prioritization for improvement rounds
4. `testing`: vitest mock patterns, assertion strategy, TDD planning rules
5. `pre-completion`: pre-completion protocol that dispatches the `pre-completion-reviewer` subagent
6. `fallow`: dead-code, duplication, and complexity analysis via the `fallow` CLI
7. `markdown-conventions`: rumdl-enforced markdown rules
8. `mermaid`: Mermaid authoring and verification
9. `pi-extension-lifecycle`: Pi turn/tool execution and extension event lifecycle

### Project Prompts

Reusable slash-command flows live in `.pi/prompts/` (synced from `pi-packages`, adapted to this repo):

1. `plan-issue`: read a GitHub issue and write a numbered plan to `docs/plans/`
2. `tdd-plan`: execute a plan's TDD steps as red→green→commit cycles
3. `build-plan`: execute a non-TDD plan (docs/config/prose changes)
4. `pr-review`: triage a third-party PR (adopt/adapt/decline) and hand off to `plan-issue`
5. `ship-issue`: push, close the issue, and merge the release-please PR
6. `ship-no-issue`: push, verify CI, and merge the release-please PR (no issue)
7. `retro`: review a session for workflow improvements and persist retro notes
8. `retro-note`: persist a quick retro observation to `docs/retro/`

The fallow-discovery prompts (`plan-improvements`, `finish-phase`) from `pi-packages` are intentionally not ported.

### Project Agents

Custom subagents live in `.pi/agents/`:

1. `pre-completion-reviewer`: fresh-context quality reviewer run before `/ship-issue`

The `ship-*` and CI/issue steps in the prompts use the `@gotgenes/pi-github-tools` extension, declared in `.pi/settings.json`.

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
The transport wrapper closes this gap on our side by shaping at the registry transport rather than the hook.

## Development

### Package Manager

Use `pnpm`.

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
4. wait for release-please to catch up if needed
5. only then merge the open release-please PR after its CI is green
6. run `git pull --ff-only` locally to pick up the release commit

Preferred release step (pass the release-please PR number explicitly):

```bash
gh pr merge --rebase <pr-number>
```

Do not merge a release-please PR while local commits are still unpushed or while the PR was generated from an older `main` than the commits you just finished.

Release batching is plan-driven: the `improvement-discovery` skill defines a grep-able `Release:` tag (and a `Release batches` subsection) for roadmap steps, `/plan-issue` derives a `Release Recommendation` from those annotations, and `/ship-issue` reads the plan's `**Release:**` marker early — asking only when it is `mid-batch — defer`, otherwise releasing now.

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

### One decision per call

Each `ask_user` call should address a single independent decision.
Do not combine unrelated decisions into one call with combinatorial options.
For multiple independent decisions, make sequential calls — one per decision.

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
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

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
4. When asserting on shaped system prompts, prefer regex matches that pin specific markers (`/^You are an expert coding assistant\./`, `/# Project Context/`) over deep-equal on full prompt strings, so tests survive harmless reformatting upstream.

### Coverage areas

Current suites map roughly to:

1. `test/oauth-transport.test.ts` — `sk-ant-oat` token gating, `onPayload` composition, and delegation to the built-in transport.
2. `test/request-shaping.test.ts` — billing header injection, system block layering, beta-header merging, and the structural messages-payload guard.
3. `test/system-prompt-shaping.test.ts` — anchor-based paragraph removal, tool-snippet and guideline preservation, appended-content preservation, the verbatim upstream-prompt fixture, and degraded-mode fallbacks.
4. `test/pi-anthropic-ordering-experiment.test.ts` — pinned experiments documenting Pi's tool-use serialization behavior.

Priority areas for new tests:

1. Billing header generation
2. OAuth-only request-body shaping
3. System prompt shaping boundaries (preamble anchors, appended content preservation, fallback paths)

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
Built-in compaction (`completeSimple`) and third-party background agents (`agentLoop` with the default `streamSimple`) issue Anthropic requests through the same singleton API-registry transport but without that hook.
Any shaping that must apply to every OAuth request belongs in the transport wrapper, not in `before_provider_request`.

### Avoid Over-Porting From OpenCode

This repository is not trying to reproduce `opencode-anthropic-auth` wholesale.
OpenCode needed broader system prompt debranding.
Pi's built-in Anthropic provider is already much closer to the desired Claude Code request shape.

### Registering `streamSimple`

The extension registers a `streamSimple` wrapper, because hooks proved insufficient: `before_provider_request` does not fire for compaction or background-agent calls (Issue #18).
The wrapper stays thin — it delegates to Pi's own built-in Anthropic `streamSimple` transport (resolved at runtime via `src/host-transport.ts`) and only injects an `onPayload` shaping step gated on the OAuth token.
The delegate is resolved at runtime rather than read out of the registry to avoid infinite recursion: the registry entry for `anthropic-messages` is our own wrapper, so reading the delegate from it would loop.
The resolver imports the bare `@earendil-works/pi-ai` specifier, which Pi's loader aliases (Node) / virtualizes (Bun) to its own bundled pi-ai compat entrypoint (`dist/compat.js` on pi >=0.80.x), which re-exports `streamSimpleAnthropic`.
The earlier `import.meta.resolve("@earendil-works/pi-ai")` plus subpath-file import bypassed that indirection — jiti consults its alias map on the import path but not the `resolve` path — so it fell through to the extension's own directory and failed under `pi install` / the Bun binary (Issue #31).

### `registerProvider` Merges, It Does Not Replace

Pi's `ModelRuntime.registerProvider` (0.80.8+) overlays each registration's *defined* values on the previous one and preserves keys left `undefined`.
Omitting a field does not clear a value a prior registration set.
A stale installed copy that registers `oauth` keeps it in the merged config even after a fixed copy re-registers without `oauth`, so `/login` still runs the stale override (Issue #43).
When a local `-e`/`"../"` copy and an installed `packages[]` copy both load, isolate to one copy before validating a registration change.
A breaking release ships as a major bump, so a stale installed copy pinned `^oldmajor` is not upgraded by `pi update` (it stays within the caret range); cross the major with `pi install npm:<pkg>@latest`, which rewrites the pin (Issue #43 shipped as `2.0.0`; a stale `^1.0.0` install kept clobbering refresh with the removed-API `oauth` override until re-installed).

### Model ID Alias Drift

Pi CLI model aliases and the locally installed `@earendil-works/pi-ai` package do not always accept the exact same Anthropic Haiku spelling.
In this repo, prefer the dashed form `anthropic/claude-haiku-4-5` in docs and repro commands, and `claude-haiku-4-5` in tests that call `getBuiltinModel("anthropic", ...)` directly.

### Verify Each Loader Mode

When asserting that behavior holds across loader modes — Node `alias` vs Bun `virtualModules` — verify each one independently; do not extrapolate from the installed host.
The minimum supported host is pi >=0.80.8; both loader modes alias the bare `@earendil-works/pi-ai` specifier to `dist/compat.js` on that generation.

### Diagnose Version Regressions From The Tag Source

When a regression's root cause is a version difference, `git diff` the source at both release tags (the `~/development/pi/pi` clone has them) before writing the diagnosis.
Eyeball greps that "look identical" and the installed dev copy both mislead (Refs #40).

## Related Files

1. `README.md`
2. `docs/architecture.md`
3. `docs/plans/minimal-anthropic-override.md`
4. `docs/plans/gap-analysis-and-next-steps.md`
5. `.pi/skills/`
6. `.pi/prompts/`
7. `.pi/agents/`
8. `.fallowrc.json`
9. Workflow parity source: `~/development/pi/pi-packages/`
10. Upstream reference clone: `~/development/pi/pi`
11. Example reference project: `~/development/opencode-anthropic-auth`
