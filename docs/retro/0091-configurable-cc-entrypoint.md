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
