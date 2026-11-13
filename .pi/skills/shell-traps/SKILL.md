---
name: shell-traps
description: |
  Load before a bash call with a pipeline, loop, heredoc, `sed`/`perl` in-place edit, or `gh … --body`;
  before gating a commit on a piped check; and before re-verifying a count established earlier.
---

# Shell traps

Load this skill before composing a non-trivial `bash` call.
The shell facts every session needs (which shell the tool runs, glob quoting) stay in `AGENTS.md`; this is the rest.

## Command flags and state

`rg -r` is `--replace`, not `--recursive`; `rg` recurses by default, so drop the `-r` (Refs #47, #66, #74).
Each `bash` call runs in a fresh shell — a variable set in one call is unset in the next.
Chain producer and consumer in one call, or re-derive the value.
Pass file tool paths repo-relative (`src/x.ts`), not hand-built absolute ones — a mistyped absolute path fails confusingly instead of fast, and trips pi-permission-system's `external_directory` gate when that extension is installed.
If the shell is zsh, its `echo` decodes backslash escapes (`\u2014` prints an em-dash; `bash` and `dash` print it literally), so it misreports a file's literal escape text; print bytes with `print -r --`, `printf '%s\n'`, or `sed -n`.

## Bodies with backticks

A `gh issue comment` / `gh pr comment` body containing backticks or fences belongs in a file passed with `--body-file`, whatever the quoting.
Single quotes ship a `` \` `` literally, and double quotes need every `` ` `` escaped, where one miscount publishes mismatched code spans.
A `git commit` body with quotes or backticks belongs in a file passed with `-F <file>`, written with `Write` — never `-F -` from a heredoc.
A `-m` string corrupts one silently; the damage shows only in `git log -1 --format=%B`.

## Pipelines

Do not pipe a long-output command into an early-exiting reader (`head -1`, `sed -n '1p;q'`) under `set -euo pipefail` — the reader closes the pipe, the writer dies of SIGPIPE, and `pipefail` promotes the 141 into a script abort.
It is a race that fires only once output exceeds one 4096-byte stdio buffer, so it survives for months and then fails always.
Let the command do its own limiting: `git for-each-ref --count=1`, not `git tag --list | head -1`.

## Counting and re-verifying

Before making an existing prose convention machine-read (a grep-able heading, tag, or marker), enumerate its existing spellings first.
A hand-written convention drifts.
When re-verifying a count established earlier in the session, re-run the original command — do not re-derive it with a new pattern.
A looser one (`rg -l` for an anchored `rg -c '^…'`) admits prose mentions and overturns a correct number.
Do not spend a tool call measuring the shape of a deterministic command's own output — `git rev-parse` emits exactly 40 hex characters, so `| wc -c` on it tests git, not your work.
Re-running it a second way (`git log -1 --format=%H`) is the same mistake wearing a disguise.
Re-resolve the identifiers you *typed*, which is the only place a wrong value can enter.
