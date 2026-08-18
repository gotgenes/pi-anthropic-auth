---
issue: 54
issue_title: "Remove the unreachable streamSimpleAnthropic fallback in pickAnthropicStreamSimple"
---

# Retro: #54 — Remove the unreachable `streamSimpleAnthropic` fallback in `pickAnthropicStreamSimple`

## Stage: Planning (2026-08-18T00:12:00Z)

### Session summary

Planned the removal of the dead `streamSimpleAnthropic` branch in `src/host-transport.ts` as `docs/plans/0054-remove-unreachable-legacy-transport-fallback.md`.
Verified the issue's reachability claim directly against the `~/development/pi/pi` clone — `compat.ts` re-exports `anthropicMessagesApi` at both `v0.80.8` and `v0.84.2` — rather than taking the issue body's word for it.
The plan is three commits (source + tests, identifier renames, prose) plus a live `pi -e` repro gate and a `fallow:dead-code` gate.

### Observations

- `ask_user` gate: the issue argues both sides itself (a "Counter-argument" section defending the branch as insurance against a compat reshuffle), so the direction was genuinely open despite the issue being the operator's own.
  Operator chose **remove the branch, keep the throw**, and chose to fold in **both** stale identifier renames (`src/index.ts` local and the `test/index-registration.test.ts` mock).
- The counter-argument is answered in the plan's Design Overview rather than ignored: both handles are re-exported from the same `compat.ts` line group, so a reshuffle that drops the factory drops the alias with it and the fallback would throw one line later than the factory path already does.
- Framed the branch and the throw as guarding opposite directions in time — the branch guards backwards against a host the peer floor excludes, the throw guards forwards against the Issue #35 compat cliff.
  That framing is what makes "remove one, keep the other" coherent rather than arbitrary.
- Measured, not estimated: baseline is 60 tests across 8 files, 6 in `test/host-transport.test.ts`; predicted 59 after the rewrite (three fallback cases out, one merged negative pin in).
- Deliberate TDD deviation carried forward from the Issue #47 retro: step 1 lands test and source in one commit, because the new "throws when only the deprecated alias is present" case is red by construction against current source and a test-only commit would poison `git bisect`.
- Scope held against two adjacent open issues.
  Issue #56 (CI never exercises the `>=0.80.8` floor) is the reason the reachability claim is hand-verified rather than build-verified, and it was explicitly kept out of scope rather than folded in — the third `ask_user` option offered that bundle and was not chosen.
  Issue #53 is untouched.
- Prose sweep found five live locations plus two that only *look* stale: the handle-comparison table rows in `docs/builtin-transport-seam-gap.md:79` and `docs/builtin-transport-seam-upstream-request.md:67` describe pi-ai's own exports, not this package's logic, and stay accurate.
  Listed them in Non-Goals so implementation does not "fix" them.
- No follow-up issues filed — nothing the plan names is unowned.

## Stage: Implementation — TDD (2026-08-18T01:30:00Z)

### Session summary

Executed all three planned steps plus both verification gates: the fallback branch and its tests, the two identifier renames, and the prose corrections across `AGENTS.md`, `docs/architecture.md`, and `docs/builtin-transport-seam-gap.md`.
Tests went 60 → 59, exactly the predicted delta (three fallback cases out, one merged negative pin in).
No deviations from the plan; `check`, `lint`, `fallow:dead-code`, and the live `pi -e` repro are all green.

### Observations

- Tidy-First assessor returned **no preparatory commits**, and its reasoning is worth keeping: the `pickAnthropicStreamSimple` / `resolveBuiltinAnthropicStreamSimple` split was itself the preparatory refactor, landed in an earlier issue, which is what made this branch deletion surgical.
  It also flagged that the plan's own step order (behavior → mechanical rename → prose) already applies Tidy-First discipline.
- The Red step produced **one** failure, not three.
  "Throws when the factory is absent" and "throws when the factory yields no `streamSimple`" passed immediately, because their fixtures never carried the deprecated alias, so the old code already threw for them.
  Per the `testing` skill's rule about tests that pass during Red, they were classified as invariant pins rather than broken probes and kept; the single red was the new negative pin, which is precisely the behavior change.
- Proved the negative pin non-vacuous by mutation, one probe per assertion clause: reverting the branch produced `Missing expected exception` (clause 1), and re-widening the throw message to mention `streamSimpleAnthropic` produced `expected message not to offer the deprecated alias` (clause 2).
  Both clauses are live.
- The rename in step 2 tripped biome formatting — `builtinAnthropicStreamSimple` is long enough to push two lines past the width limit.
  Auto-fixed with `biome check --write` before committing, so the rename commit stayed rename-only.
- Neither behavior commit is `feat:`/`fix:`, so the changelog preview is empty by design.
  Removing unreachable code has no user-observable outcome; `refactor:` is the honest type, and the changelog-preview check in the template is what confirmed it rather than assumed it.
- Live `pi -e` repro round-tripped a real Anthropic OAuth request with tool use.
  This is the only check that covers the Issue #31 loader invariant — vitest and `jiti` resolve specifiers differently — and it remains prose-pinned rather than test-pinned, which the reviewer flagged as a standing (already-documented) gap.
- Pre-completion reviewer: **PASS**.
  One WARN-level note inside Cross-step invariants: invariant 3 (the `/compat` import surviving all three loader modes) is verified only by the live repro and cannot be asserted by a unit test — the same gap the plan and `AGENTS.md` already acknowledge, not a new finding.
