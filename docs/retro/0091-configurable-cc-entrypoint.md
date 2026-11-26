---
issue: 91
issue_title: "Make the `cc_entrypoint` label configurable"
---

# Retro: #91 — Make the `cc_entrypoint` label configurable

## Stage: Planning (2026-11-26T18:18:47Z)

### Session summary

Third-party request (`colinperel`) to make the billing header's `cc_entrypoint` label configurable in `config.json`, default `sdk-cli`.
The operator chose to build it as proposed (no denylist of Anthropic labels), keyed `entrypoint`, settable from both config layers (project overrides global), with a neutral README.
Plan committed as `docs/plans/0091-configurable-cc-entrypoint.md` (`67b24ff`): three preparatory refactors, two refactor steps that thread the label and add `EntrypointSetting`, two `feat:` steps (config wiring, status line), and a docs step; execute with `/tdd-plan`.

### Observations

- The request reopens Issue #83's Non-Goals; #97074 still had no Anthropic reply (77 comments), so the gate surfaced that collision as the decision rather than arguing around it.
- All four precedents the issue cites (t3-code, Paseo, xMatrix, `pi-claude-code`) spawn the real `claude` binary and set `CLAUDE_CODE_ENTRYPOINT`; checked each source before the gate.
- Claude Code 2.1.326's binary holds a 27-entry table of its own entrypoint labels (`rg -a -o 'var gos=\{[^}]*\}'` on the binary took seconds, unlike #83's timed-out `strings` scan); it sized the rejected "refuse Anthropic labels" option.
- Load-bearing constraint: `billing-version-sync` rebuilds headers by exact-string match, so shaping and the sync must use one label per request, and a label with `"` or `\` (JSON-escaped in the body) would silently disable the raise and retry; measured with a `JSON.stringify` probe, hence an allowlist pattern rather than the issue's "reject `;` and whitespace".
- The Tidy-First assessor claimed `session_start` fires more than once per process and a project label could go stale; reading `agent-session-runtime.ts` and `AgentSession.reload` showed each session switch and `/reload` builds a fresh extension instance, so each instance sees one `session_start`.
  The plan keeps `apply` replace semantics anyway (one line, mirrors per-layer warnings).
- Optional trailing `entrypoint` params on `shapeAnthropicOAuthPayload` and `createBillingVersionSync` (44 test call sites) with a required param on `buildBillingHeaderValue` (four `src/` sites, no test callers); the transport tests carry the "one label" invariant.
- The README's "weekly limit is not affected" sentence is stale per a controlled weekly measurement in #97074 (1.14x with caching, 1.32x uncached); the docs step corrects it.
- `Co-authored-by: Colin Perel <59839704+colinperel@users.noreply.github.com>` recorded on the config-wiring `feat:` step.

#### Deferred tidyings

- `src/extra-provider-shaping.ts`: `ExtraProviderShaping.warnings()` now reports every config warning, not only provider ones; extract a `ConfigWarnings` owner when a third config consumer arrives.

## Stage: Implementation — TDD (2026-11-26T18:29:05Z)

### Session summary

All eight plan steps landed as eight commits (`0de8479`..`a9ba4a8`): three preparatory refactors, the label threaded through header construction, `EntrypointSetting`, the config key wired in (`3f702f7`, with the `Co-authored-by` trailer), the status line, and docs.
Tests went from 282 to 330 (+48, 20 files); check, lint, and `fallow dead-code` are clean.
The live repro (global `{"entrypoint": "pi-agent"}`, `-ne`, Haiku 4.5, this repo's prompt) showed `entrypoint: pi-agent (global)` in the status report and returned `PONG`; the temporary config was removed.

### Observations

- No deviations in scope; every Module-Level Changes file changed, and the predicted-unchanged files (`test/extra-provider-shaping.test.ts`, the drift suites, `test/thread-continuation.test.ts`) stayed untouched.
- Additions beyond the plan's text: the `/anthropic-auth:status` command description now names the entrypoint label, and the parser's accepted/rejected tables include Claude Code labels (`remote_baku`, `claude-desktop-3p`) and extra rejects (`-pi`, `pi/agent`, `pï`, an array).
- Every named killing mutation killed its tests; three killed more than predicted, each for a reason the design implies:
  - Step 4 (d), the shaping label ignored, also failed the transport raise and once-per-request tests, because the sync could no longer find the header.
  - Step 6 (c), `readEntrypoint` dropped in `index.ts`, also failed the untrusted-project test, whose expected value is the global label.
  - Step 6 (e), the trust check bypassed, also failed the existing providers untrusted test.
- Friction: in step 3 the `cp` of the green file ran in the same tool batch as the mutating `Edit`, so the copy captured the mutation and the restore was a no-op; caught by a red rerun before commit and reverted by hand.
  Later steps saved copies in their own turn, as `/tdd-plan` says.
- Pre-completion reviewer: PASS.
  It re-derived the allowlist over every code point and found exactly 254 accepted single-position candidates, all ASCII `[A-Za-z0-9._-]` and unchanged by `JSON.stringify`; `$` (special in `String.replace`) is excluded too.
