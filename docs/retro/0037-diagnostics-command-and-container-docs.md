---
issue: 37
issue_title: "Pi Coding Agent inside the container is failing after Login"
---

# Retro: #37 — Pi Coding Agent inside the container is failing after Login

## Stage: Planning (2026-06-26T00:00:00Z)

### Session summary

Planned a response to a third-party Docker bug report whose root cause is configuration, not an extension defect.
The plan ships an on-demand `/anthropic-auth-status` command (version, loaded module path, transport resolution result) plus a README troubleshooting section on auth precedence and the Docker named-volume masking gotcha.
The operator confirmed direction twice via `ask_user`: docs-plus-command over decline/defer, then the specific signal set and the on-demand command surface.

### Observations

- Confirmed the real mechanics against `~/development/pi/pi` @ 0.80.2: `packages/ai/src/auth/resolve.ts` states "a stored credential owns the provider; ambient/env is consulted only when nothing is stored," so the reporter's `ANTHROPIC_API_KEY` is ignored when `auth.json` holds OAuth creds.
- The yellow "Anthropic subscription auth is active…" line is Pi's own built-in warning (`interactive-mode.js`), not ours, so it does not prove the extension is loaded — which motivated the diagnostics command.
- Operator flagged a jiti concern: was `import.meta.url` part of the past Issue [#31] breakage?
  Verified with a live `pi -e` probe on 0.80.2 that `import.meta.url` and a dynamic JSON import both work under jiti; Issue [#31] was strictly `import.meta.resolve()` of a bare specifier.
- Operator deselected the per-request auth-mode signal (no startup credential-read API); the README precedence section covers that confusion instead.
- Deferred (Open Questions): making transport resolution non-fatal so the command can report a failure, and adding the auth-mode signal later.
- Release: ships independently — no roadmap or batch reference in `docs/architecture.md`.
- Next step is `/tdd-plan` (steps 1–3 are red→green→commit cycles; step 4 is a docs `/build`-style pass), with a mandatory live `pi -e` repro in step 3 to cover the loader path.

## Stage: Implementation — TDD (2026-06-26T19:35:00Z)

### Session summary

Completed all four TDD steps: diagnostics formatter, status command handler routing, command registration in the entry (including live repro), and documentation updates.
Test count went from 53 to 62 (+9 tests across two new/extended files).
Pre-completion reviewer returned WARN with one non-blocking finding (stale hyphen in JSDoc comment); fixed immediately before writing stage notes.

### Observations

- The operator renamed the command from `anthropic-auth-status` to `anthropic-auth:status` mid-session.
  Verified the colon convention is established in the extension ecosystem (`pi-subagents` uses `/subagents:settings`, `pi-ask` uses `/answer:again`); confirmed Pi's command parser slices on the first space only, not on colons, so the name is safe.
- The `async` arrow function with no `await` in `createStatusCommandHandler` tripped `@typescript-eslint/require-await`.
  Fixed by dropping `async` and returning `Promise.resolve()` explicitly — the handler signature requires `Promise<void>`, so this is idiomatic.
- The pre-commit hooks (biome, trailing-whitespace) auto-formatted files on the first commit attempt; required a second `git add -A && commit` pass to pick up the hook-applied changes.
  This is a recurring repo friction point — hooks modify files, exit non-zero, and the subsequent re-add must be done manually.
- Steps 1 and 2 share `src/diagnostics.ts`; since the handler was already implemented in step 1, step 2's tests went straight green (no red phase for the handler itself).
  This is correct behavior — the red phase was on the *test import* of the not-yet-exported symbols.
- Live `pi -e` repro (step 3) confirmed `import.meta.url` → `file:///…/src/index.ts` and the dynamic JSON import of `../package.json` returning `0.6.5`, exactly as verified during planning.
- Pre-completion reviewer: WARN (one finding — JSDoc comment in `src/diagnostics.ts` referenced `/anthropic-auth-status` instead of `/anthropic-auth:status`; fixed in a follow-up commit).
