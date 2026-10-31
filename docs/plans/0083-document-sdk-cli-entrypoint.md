---
issue: 83
issue_title: "`sdk-cli` entrypoint causes ~3–4× higher Claude subscription usage than `cli`"
---

# Document why the billing header reports `sdk-cli`

## Release Recommendation

**Release:** ship independently

Issue #83 is not part of any roadmap step in `docs/architecture.md`, and the `README.md` and `src/billing-header.ts` edits are in release scope, so the `docs:` commits cut a patch release on their own.

## Problem Statement

A third-party reporter measured Pi with this extension consuming 11% of the Claude 5-hour allowance on a benchmark task where Claude Code consumed 3%.
Patching `CLAUDE_CODE_ENTRYPOINT` in `src/billing-header.ts` from `"sdk-cli"` to `"cli"` brought Pi to 4%.
The issue asks whether `sdk-cli` is intentional, whether the higher consumption is known, and whether there is a supported way to get equivalent metering "without misrepresenting the client identity."

The repository has never recorded why the billing header reports `sdk-cli`.
The value arrived with the original override (`092da47`) and carries a one-line doc comment, so nothing stops a later contributor from accepting the reporter's patch as an improvement.

## Goals

- Record, next to the constant, why `cc_entrypoint` is `sdk-cli` and why it must not become `cli`.
- Answer the reporter's three questions in the README, where the next user with the same observation will look.
- Route future agents away from the change through the `anthropic` skill, which the Skill Index loads before any OAuth-shaping work.
- Not breaking: no runtime behavior, default, or output shape changes.

## Non-Goals

- Changing `CLAUDE_CODE_ENTRYPOINT` to `cli`, or making it configurable through the config file or an environment variable.
  The only effect of either is to have Anthropic meter a third-party harness as its interactive first-party app; see Design Overview.
- Measuring the reporter's metering claim.
  That measurement would require sending requests that claim to be the interactive app, which is the change this plan declines.
- Reconciling `cc_entrypoint` with what other Claude Code invocation paths send (opencode-anthropic-auth #175 observed `claude-desktop` from the desktop app).
- Raising the bundled Claude Code version pin (2.1.280; npm `latest` is 2.1.316 as of 2026-10-31).
  The floor reconciliation (Issue [#74]) and rejection recovery (Issue [#75]) already cover a model gated higher, and opencode-anthropic-auth's bump to 2.1.284 (its #278) quotes no rejection.
- `AGENTS.md` (predicted unchanged).
  Per its admission test, the rule is needed only when touching OAuth shaping, so it belongs in the `anthropic` skill that the Skill Index loads for that work; item 6 of the Local Files list already names "entrypoint" as part of `src/billing-header.ts`.

## Background

`src/billing-header.ts` builds the `x-anthropic-billing-header` system block:

```text
x-anthropic-billing-header: cc_version=<version>.<suffix>; cc_entrypoint=sdk-cli; cch=<hash>;
```

`CLAUDE_CODE_ENTRYPOINT` is a module constant with no override, and its doc comment reads only "Entrypoint identifier included in the billing header."

`test/billing-header-fixtures.ts` rebuilds the expected header independently of production code and spells `"cc_entrypoint=sdk-cli;"` as a literal.
Measured at planning time: changing the constant to `"cli"` turns 13 tests red across `test/billing-version-sync.test.ts` (10) and `test/request-shaping.test.ts` (3).
The value is already pinned; the plan adds no test.

### Evidence gathered at planning time

What Anthropic's own client sends, measured on Claude Code 2.1.309 against a local capture server (`ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, every request answered with a 500, so nothing reached Anthropic):

| Mode | `user-agent` | `cc_entrypoint` |
| --- | --- | --- |
| `claude -p "hi"` (print mode) | `claude-cli/2.1.309 (external, sdk-cli)` | `sdk-cli` |
| interactive `claude "hi"` (under `script` for a TTY) | `claude-cli/2.1.309 (external, cli)` | `cli` |

The capture risk (Claude Code changing its header under a custom base URL) did not materialize: both modes sent a complete billing header.

Corroborating sources:

1. `opencode-anthropic-auth`'s `captures/claude-code-v2.1.87.txt` (pulled to `93cdd23`) records `cc_entrypoint=sdk-cli` beside the Agent SDK identity prompt ("You are a Claude agent, built on Anthropic's Claude Agent SDK").
2. That project still sends `sdk-cli` on `main` and `v2/main`; its maintainer did not switch when users asked in its #139 to "use Claude Cli to continue with subscription."
3. Anthropic's Help Center article "Use the Claude Agent SDK with your Claude plan" (updated 2026-10-30) treats "Claude Agent SDK, `claude -p`, and third-party app usage" as one category with its own policy history.
4. Claude Code's "Legal and compliance" page: OAuth is "designed to support ordinary use of Claude Code and other native Anthropic applications", and "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude Code and the Agent SDK."
5. Pi's own startup warning, already quoted in `README.md`: "Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits."

The reporter's 11% / 3% / 4% figures are theirs (one comparison) and were not reproduced.

## Design Overview

`cli` is how Anthropic's first-party interactive app identifies itself; `sdk-cli` is what its non-interactive print mode and the Agent SDK send.
Pi driving the model through this extension is a program, not Anthropic's interactive app, so `sdk-cli` is the category that describes it.
Reporting `cli` would tell Anthropic that a third-party harness is the interactive Claude Code app, and the reporter's own data says the reason to do so is to land in a cheaper metering bucket.
The plan keeps `sdk-cli` and writes the reason down in the three places a future reader or agent would look.

The tension is acknowledged rather than hidden: the billing header as a whole already sits uneasily with the "native Anthropic applications" wording above.
The line this plan draws is narrower: `sdk-cli` is the category Anthropic itself assigns to programmatic and third-party use; `cli` claims to be the first-party interactive app.

The prose states measured facts as measured (the capture table, with version and date) and the reporter's numbers as the reporter's.

### Issue reply (posted at ship time, close as `not_planned`)

````markdown
Thanks for the careful comparison and the numbers.

`sdk-cli` is intentional, and I'm keeping it.
I checked what Anthropic's own client sends, using Claude Code 2.1.309 against a local capture server so nothing reached Anthropic:

| Mode | `cc_entrypoint` |
| --- | --- |
| `claude -p` (print mode) | `sdk-cli` |
| interactive `claude` | `cli` |

`cli` is how Claude Code identifies its interactive app.
Its non-interactive print mode and the Claude Agent SDK send `sdk-cli`, which is the closer description of Pi driving the model.

To your questions:

1. Yes, it's intentional, though it wasn't written down until now.
2. I haven't reproduced your numbers, but a difference between the two labels is consistent with Anthropic metering programmatic and third-party usage under its own policy (see [Use the Claude Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)), rather than a bug here.
3. Not that I know of.
   Reporting `cli` from Pi tells Anthropic it is the interactive Claude Code app, which is the misrepresentation you asked about, so this extension won't do it, by default or as an option.

I've documented the reasoning in the README's troubleshooting section and next to the constant.
Closing as not planned.
````

## Module-Level Changes

1. `src/billing-header.ts`: replace the one-line doc comment on `CLAUDE_CODE_ENTRYPOINT` with a block stating:
   1. the value is deliberate and matches what Claude Code's non-interactive print mode and the Agent SDK send (measured on 2.1.309);
   2. `cli` is the interactive app's label, and reporting it changes how Anthropic meters the request, so do not change it (Issue #83).
   No code change; the constant stays `"sdk-cli"`.
2. `test/billing-header-fixtures.ts`: a one-line comment on the `"cc_entrypoint=sdk-cli;"` literal saying it pins a deliberate value (Issue #83), so a contributor whose edit turns 13 tests red reads why before "fixing" the fixture.
3. `README.md`: new Troubleshooting subsection, inserted directly after "Pi warns about extra usage on every OAuth session" (it continues that section's subject) and before "`ANTHROPIC_API_KEY` is ignored when OAuth credentials exist".
   Working title: "Pi uses more of my plan's usage limit than Claude Code".
   Content: the capture table; that Anthropic meters programmatic and third-party usage under its own policy (link the Help Center article); that the extension reports `sdk-cli` and offers no setting to report `cli`; that Claude Code itself is the supported way to get Claude Code's interactive metering.
   Read the parent `## Troubleshooting` section end to end before inserting (markdown-conventions, "Inserting a new section").
4. `docs/architecture.md`: in "What the wrapper does", extend item 3 ("prepends an `x-anthropic-billing-header` system block") with one sentence: the block reports `cc_entrypoint=sdk-cli`, the label Claude Code's print mode and the Agent SDK send, deliberately not the interactive app's `cli` (Issue #83).
   Follow the section's existing inline `(Issue #N)` style.
   No Mermaid block models the billing header's fields (the diagrams show call paths), so none changes.
5. `.pi/skills/anthropic/SKILL.md`:
   1. under "Confirmed local fixes", one bullet recording the capture table's two rows and that the header reports `sdk-cli`;
   2. under "Avoid by default", one bullet: "changing `cc_entrypoint` to `cli`, or making it configurable: it claims the interactive Claude Code app to change how Anthropic meters usage (Issue #83)".
6. `AGENTS.md`: predicted unchanged; see Non-Goals.

Grep at planning time for other prose naming the entrypoint (`rg -n -i 'sdk-cli|cc_entrypoint|CLAUDE_CODE_ENTRYPOINT'` outside `node_modules`, `CHANGELOG.md`, and plans): only `src/billing-header.ts` and `test/billing-header-fixtures.ts` match, both listed above.

## Test Impact Analysis

No test is added or changed in behavior; the existing fixture literal already pins the value (measured: 13 failures when the constant is flipped).

Verification commands for `/build-plan`, with expected output recorded at planning time:

```bash
pnpm test                                   # all 17 files pass
rg -n 'CLAUDE_CODE_ENTRYPOINT = "sdk-cli"' src/billing-header.ts   # one match: the constant is unchanged
rg -n 'Issue #83' src/billing-header.ts test/billing-header-fixtures.ts docs/architecture.md .pi/skills/anthropic/SKILL.md README.md
pnpm run lint                               # includes rumdl over README.md and docs/
pnpm exec rumdl check .pi                   # lint:md skips .pi/**
```

The `Issue #83` grep should match in all five files (README may phrase the reference as a link; adjust the grep to `#83` if so).

## Invariants at risk

- The billing header bytes on the wire: unchanged, since only comments change in `src/`.
  Pinned by `test/request-shaping.test.ts` and `test/billing-version-sync.test.ts` through `buildExpectedBillingHeader`.

## TDD Order

This is a docs-and-comments change; execute with `/build-plan`.

1. `docs: explain why the billing header reports sdk-cli` — `src/billing-header.ts` doc comment, `test/billing-header-fixtures.ts` comment, `docs/architecture.md` sentence, `.pi/skills/anthropic/SKILL.md` bullets.
   Verify: `pnpm test`, `pnpm run check`, `pnpm run lint`, `pnpm exec rumdl check .pi`.
2. `docs: explain why Pi uses more plan usage than Claude Code` — the `README.md` Troubleshooting subsection.
   Verify: `pnpm run lint`, plus the markdown-conventions non-ASCII scans on `README.md`.

No mechanism is adopted from a third party (the reporter's patch is declined), so no `Co-authored-by:` trailer applies.

## Risks and Mitigations

- **The capture goes stale.**
  A later Claude Code may label its modes differently.
  Mitigation: every prose statement carries the measured version (2.1.309), and the rationale ("a program, not the interactive app") does not depend on the exact label.
- **The README entry reads as a policy claim on Anthropic's behalf.**
  Mitigation: quote and link Anthropic's own pages, and state the reporter's numbers as unreproduced.
- **Someone accepts the reporter's patch anyway.**
  Mitigation: the doc comment, the fixture comment, the skill's "Avoid by default" bullet, and 13 failing tests all point at Issue #83.

## Open Questions

None.

[#74]: https://github.com/gotgenes/pi-anthropic-auth/issues/74
[#75]: https://github.com/gotgenes/pi-anthropic-auth/issues/75
