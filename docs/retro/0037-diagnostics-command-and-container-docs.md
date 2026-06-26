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
