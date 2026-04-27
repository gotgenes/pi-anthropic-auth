---
name: pi-cli-repro
description: Fast Pi CLI reproduction workflow for this repo. Use when debugging extension behavior through the real pi executable, especially for Anthropic OAuth failures, prompt shaping, request payload inspection, or validating changes without waiting on manual retries.
compatibility: Intended for pi-anthropic-auth and a local pi installation with CLI access.
---

# Pi CLI Repro

## Use When

- You need to reproduce a bug through the real `pi` executable.
- Extension logic must be validated in the live CLI path rather than only unit tests.
- Anthropic OAuth behavior differs between tests and the installed CLI.
- You need a short feedback loop for prompt shaping or request-shaping changes.

## Core Workflow

### 1. Reproduce with explicit extension loading

Use the live CLI with this extension file loaded directly:

```bash
pi \
  --model anthropic/claude-haiku-4-5 \
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

Why this shape:

- `--no-session` avoids session carryover noise
- `--tools read,grep,find,ls` keeps repros narrow and read-only
- `-e .../src/index.ts` guarantees the local extension is actually loaded
- `-p` gives a fast non-interactive cycle
- `anthropic/claude-haiku-4-5` is the preferred fast repro model unless you are chasing a model-specific issue

### 2. Check version alignment first

Before trusting a repro, confirm the installed CLI version:

```bash
pi --version
```

If the live CLI version does not match the Pi libraries this repo targets, treat that as a possible source of mismatch.

## Useful Experiments

### Compare default prompt vs minimal custom prompt

If Anthropic OAuth fails, test whether the default Pi prompt is the trigger:

```bash
PI_ANTHROPIC_AUTH_DEBUG=tool-use pi ... -p "hi"
```

then compare with:

```bash
pi ... --system-prompt "You are a coding assistant." -p "hi"
```

If the minimal prompt succeeds while the default prompt fails, suspect prompt fingerprinting.

### Remove project context from the experiment

To separate prompt-template issues from `AGENTS.md` or repo guidance:

```bash
pi ... --no-context-files -p "hi"
```

## Decision Rules

When a live CLI repro fails:

1. Confirm the installed `pi` version.
2. Determine whether the failure tracks with:
   - the default Pi prompt
   - project context files
   - request payload shape
   - tool-use sequencing
3. Fix the problem in the shallowest extension seam that can solve it.

## References

- `.agents/skills/anthropic/SKILL.md`
- `docs/plans/gap-analysis-and-next-steps.md`
- `src/index.ts`
- `test/pi-anthropic-ordering-experiment.test.ts`
- `test/system-prompt-shaping.test.ts`
