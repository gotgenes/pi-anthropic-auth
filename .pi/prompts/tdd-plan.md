---
description: Execute the TDD steps from a docs/plans/ plan as red→green→verify→commit cycles
---

# Execute a plan with TDD

Argument: `$1` is either a plan path, an issue number, or empty (use the most recently modified plan).

## Sync with remote (do this first)

Before locating or reading the plan, make sure the working tree is up to date with the remote:

1. Run `git pull --ff-only`.
2. If it fails for **any** reason — uncommitted changes, divergent history, merge conflict, network error, detached HEAD — stop immediately and report the failure to the user.
   Do not attempt to stash, rebase, force, or otherwise resolve.
3. Only proceed once the pull reports a clean fast-forward (or `Already up to date.`).

## Locate the plan

- If `$1` looks like a path, use it.
- If `$1` is a number, find `docs/plans/NNNN-*.md` matching that integer (issue number or plan number).
- Otherwise, use the newest file in `docs/plans/` (by mtime); if its issue is closed (`gh issue view N --json state -q .state`), stop and ask which plan to run.

Read the plan in full before doing anything else.
If "TDD Order" is missing or empty, stop and report — re-run `/plan-issue` first.

Extract the issue number from the plan filename (pattern `NNNN-`) or from the plan's frontmatter `issue:` field.
If the issue title is not in the frontmatter, fetch it via `gh issue view N --json title -q .title`.
Call `set_session_name` with name `#N TDD — <issue title>` to identify this session in the session selector.

## Load prior session context

Check whether prior sessions have already done work on this issue:

1. Extract the issue number from the plan filename (pattern `NNNN-`) or its frontmatter `issue:` field.
2. Search for an existing retro file: look for `docs/retro/NNNN-*.md` matching the issue number.
3. If a retro file exists, read it.
4. Use this context to inform your work — it may contain warnings about edge cases, decisions that were already debated, or friction points to avoid repeating.

## Load skills

Before executing the TDD cycle, load skills relevant to the change.
Skip any already in this session's context — the trunk flow runs planning, implementation, ship, and retro in one process — but re-load after a compaction, which drops the body while leaving the memory of having read it.

- Load the `anthropic` skill for package-specific architecture, OAuth compatibility lessons, priorities, and testing context.
- Load the `code-design` skill for design principles, TypeScript conventions, and structural heuristics.
- Load the `testing` skill for Vitest mock patterns and TDD planning rules.
- Load the `pre-completion` skill — you will use it after the final TDD step to dispatch the quality reviewer.
- Load the `edit-tool` skill before a multi-entry `Edit`, a scripted substitution, or a block insertion.

## Verify green baseline

Before writing any code, confirm the starting state is clean:

1. `pnpm run check` — must pass.
2. `pnpm run lint` **from the repo root** — must pass.
3. `pnpm test` — must pass.
4. `pnpm fallow:dead-code` — must pass.
   CI gates it on every `main` push, so a finding at the end is only actionable if you know whether the baseline was clean.

If a check fails on an issue your change will not touch (e.g. a pre-existing lint warning in an unrelated doc), fix it as a separate cleanup commit (`docs:`, `style:`, or `fix:` as appropriate) to establish a green baseline, then proceed.
If the failure is non-trivial, or you cannot quickly establish why it is failing, stop and report to the user.
Do not start TDD cycles from a broken baseline.

## Execute the TDD cycle

The plan's Tidy-First preparatory steps (`refactor:`/`test:` steps naming the friction they prepare) are ordinary steps here.
Execute them in place, each as its own commit leaving the tree green, and run no separate assessment — `/plan-issue` already dispatched the assessor.
If the tree has moved since the plan was written and a preparatory step no longer fits what it describes, stop and report rather than improvising a substitute.

For **each** step in the plan's "TDD Order", in order:

1. **Red.**
   Write the failing tests the step describes.
   Run only the affected test file, unpiped: `pnpm test <test-path>` and confirm failures (a `| tail` or `| grep` replaces Vitest's exit status with the filter's).
   When the step pins a literal pattern (regex, glob, format string), derive your own input set — the plan's examples are a floor, not the case list.
   Run the pattern over the values the repo already produces in bulk (`git tag --list`, `gh pr list`) before committing.
   When the step quotes a string the code under test **produces** (a rendered sentence, an error message), copy it from the producer or an existing assertion — a plan transcribes it from memory and drops an article.
2. **Green.**
   Implement the minimum code to make those tests pass.
   Re-run the same file and confirm green.
   When the step adds or changes a shared type/interface (or a loop/consumer over one), run `pnpm run check` before committing — Vitest does not typecheck, and a type error caught only at end-of-cycle forces a commit reorder.
3. **Verify the pins.**
   Apply the killing mutation the plan named for this step, confirm the step's new tests go red, then revert it.
   Fixing a vacuous test costs nothing here and costs an amended commit later, which is why this sits before the commit rather than in the end-of-cycle review.
   These cases make this mandatory rather than optional, because the Red step's own evidence does not cover them:
   - The step's red came from a **signature change** (a required field that did not exist yet), so every test failed for the same reason and none of them demonstrated that its own assertion discriminates.
   - A test was **authored or rewritten after Green**, so it never had a Red step at all.
   - The step's tests span more than one equivalence class — one mutation kills one class, so a surviving test is only evidence when you can say which mutation should have killed it.
   - A new test **stayed green during Red**, so Red produced no evidence it discriminates — a deliberate regression pin and a vacuous probe look identical.
   - The step **relocated** an existing call or registration, so the plan's mutations cover the code it authored and not the line that merely changed sites.

   Save the green file first (`cp <file> /tmp/green.ts`) and restore from that copy; `git checkout -- <file>` reverts to HEAD, discarding the step's own uncommitted green edit.
   Run that `cp` alone in its own turn, before the mutating `Edit` — a separate call in the same batch still runs concurrently, so the copy can capture the mutation.
   Re-run before committing; never commit with a mutation in the tree.
   Apply the mutation with `Edit`, and confirm the file changed before reading the suite — a scripted multi-line substitution that matches nothing reads exactly like a mutation that killed nothing, and one that matches every sibling site reddens tests the mutation was never meant to touch.
   Prefer changing a compared literal over restructuring control flow: a mutation that crashes, or that the linter rejects, produces reds that are not discrimination signals.
   Such a mutation can also produce too *few* reds — swapping a guard's `return x` for a `throw` changes nothing observable when a downstream `catch` returns `x` too.
   Count the reds against the step's prediction: a mutation that kills fewer tests than the plan named is a finding, not a pass — the test was never written, the plan's claim was wrong, or the mutated code is dead.
4. **Commit.**
   Use the commit message the plan suggests, or a Conventional Commits message that matches:
   - `test:` for test-only commits (rare; usually folded into the feat).
   - `feat:` for new behavior.
   - `feat!:` for breaking changes the plan calls out (include a `BREAKING CHANGE:` footer).
   - `fix:` for bug fixes.

One logical change per commit.
Do not bundle multiple TDD steps into one commit.

When a step replaces a type or function that many tests depend on, use lift-and-shift: add the new alongside the old, migrate test fixtures incrementally, then remove the old.
Do not rewrite an entire large test file in one shot.

If a step uncovers a problem the plan didn't anticipate (e.g. a downstream test breaks), fix it as part of the same commit and note the deviation in the commit body.
If the deviation is large, stop and ask.
If a plan's quantitative target (LOC, clone count, complexity) does not fall out as the plan predicted, treat that as a deviation: re-decide via `ask_user` rather than escalating the abstraction to force the number.

## Filing an issue mid-implementation

When a step surfaces work outside the plan's scope, file it and keep going — do not scope-creep the step.

## After the last TDD step

1. Run the full suite: `pnpm test`.
   Must be all green.
2. Run the type check: `pnpm run check` (`tsc --noEmit`).
   Must succeed — Vitest does not typecheck.
3. Run the linter **from the repo root**: `pnpm run lint`.
   If it fails, run `pnpm exec biome check --write .` to auto-fix, then re-check.
   Fix all failures — including pre-existing ones unrelated to the current change.
   Commit any fixup as part of the most recent feat commit (amend) only if you haven't pushed; otherwise as a `style:` commit.
   The fixup must NOT land in a `docs:` commit.
4. Run the fallow dead-code gate **from the repo root**: `pnpm fallow:dead-code`.
   If it exits non-zero, load the `fallow` skill and fix the findings — prefer declaring a real contract (`implements`) or removing dead exports over suppressing; suppress only verified false positives.
   Commit fixes as part of the most recent feat commit (amend) if not yet pushed; otherwise as a `fix:` commit.
   If the plan names a quantitative target (a complexity/CRAP score, a clone count, a refactoring-target drop-off), load the `fallow` skill to find the right verification subcommand — confirm a file left the targets list with `pnpm fallow health --targets --format json` (an empty `targets` array), not by grepping the human-readable output.
5. Check for unstaged lockfile changes: `git diff --name-only pnpm-lock.yaml pnpm-workspace.yaml`.
   `pnpm install` can touch `pnpm-workspace.yaml` too (a `minimumReleaseAgeExclude` entry when a dependency is bumped to a freshly-published version).
   If modified, stage and commit it as part of the most recent feat commit (amend if not yet pushed) or as a separate `fix:` commit.
6. Cross-check the plan's "Module-Level Changes" table against actually-changed files.
   If a listed file was not touched, update it now or note the deviation.
7. If `docs/architecture.md` exists, check whether the changes affect the module structure or data-flow descriptions and update them.
   If the issue completes a numbered roadmap step, prefix `✅` on both the step heading and its Mermaid diagram node — a `Landed:` detail line is not a substitute for the `✅`.
   Confirm both landed before committing: `grep -cE '✅.*#<N>\b' docs/architecture.md` must report 2 — no lint gate sees a missing `✅`.
   Key it on the issue number, not the step's ordinal: the heading and the node both carry `#<N>` whether the phase identifies its steps by ordinal or by issue.
   Flip the phase status row only when every step in the phase is done.
8. Commit doc updates as `docs: <summary>`.
9. Preview the changelog: `git log --format='%s' <plan-commit>..HEAD | grep -E '^(feat|fix)'`.
   Every surviving line must name a user-observable outcome, not an internal seam.
   A seam-named line is either a mistyped commit (retype to `refactor:`) or a correct `fix:`/`feat:` with a mechanism-named subject (reword to the symptom).
   Fix either now, while nothing is pushed.
10. **Do not edit `CHANGELOG.md`** — the release workflow owns it, and git-cliff generates entries from your Conventional Commit messages on the next release.

## Pre-completion review

Load the `pre-completion` skill and follow the dispatch protocol.
Proceed to "Summarize" only after the reviewer returns PASS or WARN.

## Summarize

Print:

- `git log --oneline <N>` for the commits you just made (N = number of TDD steps + docs).
- One-line summary of behavioral change.
- Any test-count delta.
- Any deviations from the plan.
- Pre-completion reviewer verdict (PASS / WARN / FAIL with one-line summary).

## Write stage notes

Before stopping, persist implementation observations for cross-session continuity:

1. Determine the retro file path: `docs/retro/NNNN-<slug>.md`.
   Use the same `NNNN-<slug>` as the plan file.
   Create the directory if needed.
2. If the retro file does not exist, create it with YAML frontmatter:

   ```yaml
   ---
   issue: N
   issue_title: "<exact title from issue>"
   ---
   ```

   Followed by `# Retro: #N — <issue title>`.
3. Append a stage entry:

   ```markdown
   ## Stage: Implementation — TDD (<ISO 8601 timestamp>)

   ### Session summary

   2–3 sentences: what was implemented, how many TDD cycles completed, test count delta.

   ### Observations

   Note deviations from the plan, unexpected edge cases, tests that were harder than expected, and any decisions made during implementation.
   Include the pre-completion reviewer's verdict (PASS / WARN / FAIL) and any WARN findings.
   If the session was cut short (not all TDD steps completed), note which steps remain.
   ```

4. Commit: `git add <retro-file> && git commit -m "docs(retro): add TDD stage notes for issue #N"`.

Wrap code identifiers, filenames, and text containing underscores in backticks in the retro file.
Append with the `Edit` tool (or `Write` for a new file), not a shell heredoc.
When appending a new stage to an existing retro, anchor the `Edit` on the file's last line or use `Write` with the full content — the repeated `### Observations` / `### Session summary` headers make header-anchored edits ambiguous.

Stop.
The next step is `/ship-issue`.
