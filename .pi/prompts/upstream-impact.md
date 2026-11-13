---
description: Assess what a new Pi release breaks in this package, with an empirical scratch-tree verification
model: anthropic/claude-opus-5-5
---

# Assess a new Pi release

Argument: `$1` is the new Pi version (for example `0.86.0`).
If empty, resolve the newest tag in the upstream clone with `git -C ~/development/pi/pi tag --sort=-v:refname | head -1`.

Your job is to determine what the new release breaks, degrades, or newly enables in this package, and to prove each finding rather than infer it.
Stop after reporting and asking the user what to file.
Do not implement fixes and do not file issues without being asked.

Load the `upstream-watch` skill before starting.
It holds the assumption watchlist, the impact-class taxonomy, and the verification gotchas this template refers to.

Call `set_session_name` with `Pi $1 impact — assessment`.

## 1. Establish the delta

Do not assume the installed host matches the declared devDeps.

1. `pi --version`
2. `node -p "require('./node_modules/@earendil-works/pi-coding-agent/package.json').version"`
3. The `peerDependencies` floor in `package.json`
4. `git -C ~/development/pi/pi tag --sort=-v:refname | head -10`

Record the old version, the new version, and every version in between.
The assessment covers the whole span, not just the newest release.

## 2. Read both changelogs

Read `packages/ai/CHANGELOG.md` **and** `packages/coding-agent/CHANGELOG.md` in the upstream clone, across every intervening version.

Read the Breaking Changes section of each version in the span.
Then read Added and Changed, looking specifically for new components that issue provider requests — those are candidate coverage gaps even when nothing about them sounds Anthropic-related.

Treat the changelogs as lead generators only.
They routinely omit the change that matters most to this package.

## 3. Diff the watchlist unconditionally

For every row in the `upstream-watch` watchlist, run a diff across the span:

```bash
git -C ~/development/pi/pi diff v<old> v<new> --stat -- <path>
```

Then read the full diff for any path with meaningful churn.
Do this even when no changelog entry points at the path — coverage-gap findings are only discoverable this way.

When a diff contradicts a claim in `AGENTS.md` or `docs/`, check `gh issue list` before writing it up.
The contradiction is often an already-filed issue.

## 4. Verify empirically in a scratch worktree

This step is mandatory.
Start from the `pi-ceiling` workflow's run for the release, if one exists (`gh run list --workflow pi-ceiling.yml`): it already typechecked and tested this package against npm `latest`, and its failures are the first leads.
It does not replace the scratch tree, which covers versions other than `latest` and the runtime probes below.
Diff reading alone predicts that something breaks; it does not establish the failure mode, and the exact failure mode is what the report is for.

```bash
git worktree add /tmp/paa-<version> HEAD
cd /tmp/paa-<version>
pnpm add -D @earendil-works/pi-ai@<version> @earendil-works/pi-coding-agent@<version>
pnpm clean --lockfile && pnpm install
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Use the binaries directly rather than `pnpm run check` / `pnpm test`; see the gotchas in `upstream-watch` for why.

Read the failures carefully.
A suite that is mostly green is not a pass — in the 0.86.0 assessment, 62 of 64 tests passed and the two failures were the entire finding.
When a canary test fails, quote its actual output in the report; the rendered before/after is the most persuasive evidence available.

Then probe the runtime surfaces the typechecker cannot see, per `upstream-watch`:

1. The compat delegate resolution (`anthropicMessagesApi().streamSimple`)
2. The model catalog, when a finding is gated on a `compat` flag

Remove the worktree when the assessment is complete: `git worktree remove /tmp/paa-<version>`.

## 5. Check for live evidence

This agent runs inside pi with the extension loaded, so its own system prompt is a shaped artifact.
When the finding concerns system prompt shaping, inspect the prompt you were given for damage: unbalanced XML tags, orphaned closing tags, surviving Pi identity text, or a missing minimal preamble.
Report it as live confirmation when present, and say plainly that it is your own prompt.

## 6. Classify and report

Present findings grouped by impact class (compile-time, behavioral-silent, coverage-gap), highest severity first.
For each finding give:

1. What upstream changed, with the file path and the version that changed it
2. What it does to this package, concretely
3. The evidence — test output, diff excerpt, or probe result
4. Blast radius — which models, which call paths, which users
5. Whether it is a hard failure or a silent degradation

State separately what you verified as **unaffected**, so the reader knows the absence of a finding was checked rather than skipped.

Note any new upstream capability that would let this package retire a workaround or close a known gap.
These are easy to miss because they are not failures.

## 7. Hand off

Recommend a fix direction for each finding, preferring the durable shape over re-pinning a constant that will drift again.
Prefer version-agnostic fixes that keep the current peer floor.

Then call `ask_user` to ask which findings should become GitHub issues.
Do not file anything before asking.
When the user chooses to file, load the `github-voice` skill and write each issue in @gotgenes's voice, one issue per finding, with the evidence inline.
