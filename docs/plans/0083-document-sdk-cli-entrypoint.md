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

- Record, next to the constant, what `sdk-cli` is and why the extension keeps it for now, as a current choice subject to change as Anthropic clarifies its policy.
- Answer the reporter's three questions in the README, citing the upstream report ([anthropics/claude-code#97074]) that the observation matches.
- Route future agents away from the `cli` change through the `anthropic` skill, which the Skill Index loads before any OAuth-shaping work.
- Not breaking: no runtime behavior, default, or output shape changes.

## Non-Goals

- Reporting another Anthropic client's label (`cli`, `claude-desktop`, `claude-vscode`) for now, by default or behind a config file or environment variable.
  Those labels identify Anthropic's own apps, and Pi is none of them.
- Reporting a truthful Pi-specific label (for example `pi`) now.
  The operator chose to defer it until Anthropic says whether the `sdk-*` weighting in [anthropics/claude-code#97074] is intended; see Open Questions.
- Measuring the weighting on the operator's account.
  The account (Ultra) exposes no 5-hour meter, only `anthropic-ratelimit-unified-7d-utilization`, and #97074's evidence says the weekly meter is unweighted; resolving a 2x effect at its 1% steps was estimated at $800+ of API-equivalent work.
- Raising the bundled Claude Code version pin (2.1.280; npm `latest` is 2.1.316 as of 2026-10-31).
  The floor reconciliation (Issue [#74]) and rejection recovery (Issue [#75]) already cover a model gated higher.
- Changing the billing header or the prompt sanitizer on the strength of today's acceptance grid (see Background); it is one request per cell, on one account.
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

### What the labels mean (measured)

What Anthropic's own client sends, measured on Claude Code 2.1.309 against a local capture server (`ANTHROPIC_BASE_URL=http://127.0.0.1:<port>`, every request answered with a 500, so nothing reached Anthropic):

| Mode | `user-agent` | `cc_entrypoint` |
| --- | --- | --- |
| `claude -p "hi"` (print mode) | `claude-cli/2.1.309 (external, sdk-cli)` | `sdk-cli` |
| interactive `claude "hi"` (under `script` for a TTY) | `claude-cli/2.1.309 (external, cli)` | `cli` |

`opencode-anthropic-auth`'s `captures/claude-code-v2.1.87.txt` (pulled to `93cdd23`) records `sdk-cli` beside the Agent SDK identity prompt, and that project still sends it on `main` and `v2/main`.
`sdk-cli` is Claude Code's print-mode label, borrowed: Pi is not Claude Code in any mode.
It is the least misleading of Anthropic's labels for a program driving the model, not an accurate one.

### The upstream report

[anthropics/claude-code#97074] (open since 2026-09-25, 60 comments, none from Anthropic as of 2026-11-01) reports the reporter's observation with controlled A/Bs from at least six accounts:

1. Requests labeled `sdk-cli` or `sdk-ts` use the 5-hour window about 1.8-2.9x faster than `cli`, `claude-desktop`, or `claude-vscode` for the same tokens.
2. The VS Code extension runs the same headless stream-json session as `claude -p` and is metered at the normal rate, so the weighting attaches to the `sdk-*` labels, not to programmatic use.
3. An arbitrary custom label (`my-tool`, `t3-code`, `local-probe-97074`) is metered at the normal rate.
4. The weekly meter appears unweighted: t3dotgg reports "Weekly is not affected"; harry924's pooled data (Max 20x) fits equal weighting; oviano saw about $27 per weekly point under both labels.
5. Commenters who relabel use their own tool's name and decline `cli` and `claude-vscode` because those belong to other clients; one (t3dotgg) guesses a recent 5-hour boost was never applied to Agent SDK traffic.

So the weighting is real, label-specific, unacknowledged, and of unknown intent.
This corrects an earlier draft of this plan, which attributed the gap to Anthropic deliberately metering programmatic use and called `sdk-cli` the accurate label for Pi.

### Live acceptance grid (2026-11-01, operator's account, Pi 1.4.0)

One request per cell, this repository's project prompt, `-ne`; working-tree spikes only, reverted.

| | Prompt sanitized | Prompt not sanitized |
| --- | --- | --- |
| Billing header sent | 200 | 200 (Haiku 4.5, Sonnet 5.5, Opus 5.5) |
| No billing header | 200 (Haiku 4.5, Sonnet 5.5, Opus 5.5) | 400 `You're out of extra usage.` (Haiku, Sonnet; bare Pi without the extension: all three) |

`cc_entrypoint=pi` also returned 200 three times on Haiku 4.5, but the grid shows acceptance cannot distinguish labels today.
The extension remains necessary: without either half, Pi is rejected.
Issue #70's 2026-09-21 table recorded "preamble sanitized, still no billing header" as a 400 on a different prompt (28 KB) and model (`claude-opus-5`), so the sanitizer-only pass here does not generalize, and nothing in this plan acts on it.

T3 Code is not a precedent for Pi: it launches the real `claude` binary and sets `CLAUDE_CODE_ENTRYPOINT=t3-code` on that process (t3code PR #25597, closed unmerged), the path Anthropic's terms allow for "the unmodified Claude Code binary".
Pi calls `/v1/messages` directly.

## Design Overview

Keep `sdk-cli` and write down three things where a reader or agent would look:

1. What the value is: Claude Code's print-mode label, borrowed because Pi is a program driving the model and no Anthropic label names Pi.
2. What users have reported: the 5-hour weighting in [anthropics/claude-code#97074], which Anthropic has not said is intended.
3. That this is the current choice, subject to change as Anthropic clarifies how it treats these labels.

The wording is deliberately tentative (operator direction during `/build-plan`): no "never", and the weighting stated as a user report.

The prose states measured facts as measured (the capture table, with version and date), cites #97074 for the weighting rather than restating it as fact, and reports the reporter's numbers as theirs.
It names the weekly meter as apparently unaffected, since plans without a 5-hour window (Ultra) are then unaffected by the label.

### Issue reply (posted at ship time, close as `not_planned`)

````markdown
Thanks for the careful comparison and the numbers.

What you measured matches anthropics/claude-code#97074, where several people report requests labeled `sdk-cli` or `sdk-ts` drawing down the 5-hour window about twice as fast as `cli` for the same tokens.
Anthropic hasn't said whether that's intended.

To your questions:

1. `sdk-cli` was a deliberate choice, though it wasn't written down until now.
   It's the label Claude Code sends from `claude -p`; interactive `claude` sends `cli` (I captured both from Claude Code 2.1.309).
2. Yes, see the issue above.
3. Not that I know of.
   For now I'm keeping `sdk-cli` rather than reporting `cli`, since Pi isn't Claude Code's interactive app.

This is the plan for now, subject to change as Anthropic updates its policies.
I've noted the reasoning in the README's troubleshooting section.
Closing as not planned for now; I'll revisit if Anthropic clarifies.
````

## Module-Level Changes

1. `src/billing-header.ts`: replace the one-line doc comment on `CLAUDE_CODE_ENTRYPOINT` with a block stating:
   1. Claude Code sends `sdk-cli` from print mode and `cli` from its interactive app (observed on 2.1.309), and `sdk-cli` seems the closer fit for Pi;
   2. users have reported `sdk-*` labels drawing down the 5-hour window faster (anthropics/claude-code#97074), and Anthropic has not said whether that is intended;
   3. see Issue #83 before changing the value.
   No code change; the constant stays `"sdk-cli"`.
2. `test/billing-header-fixtures.ts`: a one-line comment on the `"cc_entrypoint=sdk-cli;"` literal saying it pins a deliberate value (Issue #83), so a contributor whose edit turns 13 tests red reads why before "fixing" the fixture.
3. `README.md`: new Troubleshooting subsection, inserted directly after "Pi warns about extra usage on every OAuth session" (it continues that section's subject) and before "`ANTHROPIC_API_KEY` is ignored when OAuth credentials exist".
   Working title: "Pi uses the 5-hour window faster than Claude Code".
   Content:
   1. the extension reports `sdk-cli`, Claude Code's own `claude -p` label (the capture table);
   2. users in [anthropics/claude-code#97074] report `sdk-*` labels drawing down the 5-hour window about twice as fast, suggest the weekly limit is not affected, and Anthropic has not said whether that is intended;
   3. the extension keeps `sdk-cli` for now, subject to change as Anthropic clarifies (link Issue #83).
   Read the parent `## Troubleshooting` section end to end before inserting (markdown-conventions, "Inserting a new section").
4. `docs/architecture.md`: in "What the wrapper does", extend item 3 ("prepends an `x-anthropic-billing-header` system block") with one sentence: the block reports `cc_entrypoint=sdk-cli`, the label Claude Code sends from its print mode (Issue #83).
   Follow the section's existing inline `(Issue #N)` style.
   No Mermaid block models the billing header's fields (the diagrams show call paths), so none changes.
5. `.pi/skills/anthropic/SKILL.md`:
   1. under "Confirmed local fixes", one bullet recording the capture table's two rows, that the header reports `sdk-cli`, and that users in [anthropics/claude-code#97074] report `sdk-*` labels drawing down the 5-hour window faster, with `sdk-cli` kept for now (Issue #83);
   2. under "Avoid by default", one bullet: "changing `cc_entrypoint` without first reading Issue #83 for the current reasoning".
6. `AGENTS.md`: predicted unchanged; see Non-Goals.

Grep at planning time for other prose naming the entrypoint (`rg -n -i 'sdk-cli|cc_entrypoint|CLAUDE_CODE_ENTRYPOINT'` outside `node_modules`, `CHANGELOG.md`, and plans): only `src/billing-header.ts` and `test/billing-header-fixtures.ts` match, both listed above.

## Test Impact Analysis

No test is added or changed in behavior; the existing fixture literal already pins the value (measured: 13 failures when the constant is flipped).

Verification commands for `/build-plan`, with expected output recorded at planning time:

```bash
pnpm test                                   # all 17 files pass
rg -n 'CLAUDE_CODE_ENTRYPOINT = "sdk-cli"' src/billing-header.ts   # one match: the constant is unchanged
rg -n '#83' src/billing-header.ts test/billing-header-fixtures.ts docs/architecture.md .pi/skills/anthropic/SKILL.md README.md
rg -n '97074' src/billing-header.ts README.md .pi/skills/anthropic/SKILL.md
pnpm run lint                               # includes rumdl over README.md and docs/
pnpm exec rumdl check .pi                   # lint:md skips .pi/**
```

The `#83` grep should match in all five files; the `97074` grep in all three.

## Invariants at risk

- The billing header bytes on the wire: unchanged, since only comments change in `src/`.
  Pinned by `test/request-shaping.test.ts` and `test/billing-version-sync.test.ts` through `buildExpectedBillingHeader`.

## TDD Order

This is a docs-and-comments change; execute with `/build-plan`.

1. `docs: explain why the billing header reports sdk-cli` — `src/billing-header.ts` doc comment, `test/billing-header-fixtures.ts` comment, `docs/architecture.md` sentence, `.pi/skills/anthropic/SKILL.md` bullets.
   Verify: `pnpm test`, `pnpm run check`, `pnpm run lint`, `pnpm exec rumdl check .pi`.
2. `docs: explain why Pi uses the 5-hour window faster than Claude Code` — the `README.md` Troubleshooting subsection.
   Verify: `pnpm run lint`, plus the markdown-conventions non-ASCII scans on `README.md`.

No mechanism is adopted from a third party (the reporter's patch is declined), so no `Co-authored-by:` trailer applies.

## Risks and Mitigations

- **The capture or the upstream picture goes stale.**
  Claude Code may relabel its modes, and Anthropic may answer #97074.
  Mitigation: prose carries the measured version (2.1.309) and dates, and cites #97074 rather than restating its numbers as settled.
- **The README entry reads as a claim about Anthropic's metering.**
  Mitigation: attribute every number to #97074 or the reporter, and say plainly that Anthropic has not confirmed intent.
- **Someone accepts the reporter's patch anyway.**
  Mitigation: the doc comment, the fixture comment, the skill's "Avoid by default" bullet, and 13 failing tests all point at Issue #83.

## Open Questions

- Revisit a truthful Pi-specific label (for example `cc_entrypoint=pi`) when Anthropic answers [anthropics/claude-code#97074].
  If the `sdk-*` weighting is a bug and is fixed, nothing changes here; if it is intended and documented, decide then whether a custom label is appropriate.
  Not filed as an issue: the trigger is an external response, not work this repo can schedule.

[#74]: https://github.com/gotgenes/pi-anthropic-auth/issues/74
[#75]: https://github.com/gotgenes/pi-anthropic-auth/issues/75
[anthropics/claude-code#97074]: https://github.com/anthropics/claude-code/issues/97074
