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

## Stage: Final Retrospective (2026-06-26T23:49:22Z)

### Session summary

Shipped issue #37 as `v0.7.0`: pushed the six commits, verified green CI, merged the release-please PR, and posted a diagnostic comment to the third-party reporter instead of closing the issue.
The ship stage surfaced two process gaps in `/ship-issue`: it has no branch for leaving an unconfirmed third-party issue open (the operator caught this manually), and it builds the issue comment before the release version is known, which produced a wrong version number in a user-facing comment.

### Observations

#### What went well

1. Clean three-stage execution overall: the planning-stage empirical jiti probe and the TDD-stage colon-command-name verification both de-risked changes against the real pi source before committing, and no rework propagated between stages.
2. The operator's mid-ship steer ("we don't want to close this issue") was absorbed cleanly — the agent pivoted to a diagnostic comment, loaded the `github-voice` skill, and left the issue open without thrashing.

#### What caused friction (agent side)

1. `premature-convergence` — The issue comment (ship step 5) was posted before the release-please PR was merged (step 6), and it stated "v0.6.6" / "version: 0.6.6".
   The actual release was `v0.7.0` — three `feat:` commits cut a minor bump, not a patch.
   The agent had already observed the `feat:` commits one step earlier (`git log v0.6.5..HEAD`) but still guessed a patch bump and posted before the version was confirmed.
   Impact: a live, user-facing GitHub comment cites a version that was never published; the reporter will look for `v0.6.6` and the fix is in `v0.7.0`.
   Needs a correction to the posted comment.
2. `other` (tooling friction) — The pre-commit hooks (`biome`, trailing-whitespace) reformatted staged files and aborted the first commit attempt repeatedly, forcing a `git add -A` re-commit.
   This happened on at least three separate commits during the TDD stage (the formatter commit took three attempts).
   Impact: roughly six extra commit tool calls across the session; no rework or incorrect output.

#### What caused friction (user side)

1. The operator had to manually catch the issue-close decision: `/ship-issue` step 5 reads "Close the issue" unconditionally, but a third-party report answered with an unconfirmed hypothesis should stay open pending the reporter's confirmation.
   Opportunity: encode the "comment and leave open" branch in the prompt so the operator doesn't have to intervene each time a diagnostic response ships.

### Diagnostic details

1. Model-performance correlation: model assignment matched task type across stages — `opus-4-8` for judgment-heavy planning and retro synthesis, `sonnet-4-6` for mechanical TDD/ship execution, and the `pre-completion-reviewer` subagent on its default model returned a valid WARN.
   No reasoning-weak-on-judgment or high-cost-on-mechanical mismatch.
   The version-guess error was a sequencing gap, not a model-capability gap.
2. Escalation-delay: no rabbit-hole exceeded five tool calls on one error.
   The eight-call colon-name verification was deliberate due-diligence on an operator request, not a chased symptom.
3. Feedback-loop: verification ran incrementally (check + test after each TDD step, pre-push checks before push); no end-only verification gap.

### Follow-ups

1. The posted comment on issue #37 needs its version corrected from `v0.6.6` to `v0.7.0` (via `gh issue comment --edit-last`).
   Done — see Changes made item 3.

### Changes made

1. `.pi/prompts/ship-issue.md` — step 5 retitled "Close the issue (or comment and leave open)" with a leading conditional: an unconfirmed third-party/diagnostic response is commented and left open, not closed.
2. `.pi/prompts/ship-issue.md` — step 5 comment checklist gained a rule: if the comment cites the released version, post it after the release tag lands (step 6) or derive the bump from commit types (`feat` → minor, `fix`/`chore` → patch); do not guess a patch bump.
3. Edited the live comment on issue #37 in place (`gh issue comment --edit-last`) to correct `v0.6.6` → `v0.7.0` in both the prose and the sample diagnostics output.
4. Did not implement the optional AGENTS.md pre-commit re-add note (proposal D) — operator declined.
