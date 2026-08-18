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
