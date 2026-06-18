---
name: fallow
description: |
  Codebase intelligence via fallow CLI — dead code, duplication, complexity, refactoring targets.
  Load when investigating unused code, planning refactors, or reviewing fallow output.
---

# Fallow

Fallow is a static analysis tool for TypeScript/JavaScript installed as a devDependency.
It finds unused code, duplication, complexity hotspots, and refactoring targets.
Run it via `pnpm fallow` scripts — never `npx`.

## Quick reference

```bash
pnpm fallow                # full analysis: dead code + dupes + health
pnpm fallow:audit          # changed-file audit (PR gate)
pnpm fallow:health         # complexity, hotspots, refactoring targets
pnpm fallow:dead-code      # unused files, exports, types, deps
pnpm fallow:dupes          # duplicated code blocks
```

## JSON output for programmatic use

Always use `--format json --quiet 2>/dev/null` and append `|| true`.
Exit code 1 means "issues found" (normal), not a runtime error.
Only exit code 2 is a real error.

```bash
pnpm fallow dead-code --format json --quiet 2>/dev/null || true
pnpm fallow health --score --targets --format json --quiet 2>/dev/null || true
```

## Useful flags

| Flag | Purpose |
| --- | --- |
| `--unused-exports` | Filter to only unused exports |
| `--unused-files` | Filter to only unused files |
| `--changed-since main` | Only files changed since a ref |
| `--score` | Show health score (0–100) |
| `--hotspots` | Riskiest files by churn × complexity |
| `--targets` | Ranked refactoring recommendations |
| `--mode semantic` | Duplication: catch renamed-variable clones |

## Configuration

Config lives at `.fallowrc.json` in the repo root.
This is a single package, so the config declares one entry point manually — the Pi extension entry `["src/index.ts"]` — since fallow does not know that convention.
Rules use `"error"` (fail CI), `"warn"` (report only), or `"off"` (skip).

## Suppressing findings

```typescript
// fallow-ignore-next-line unused-export
export const keepThis = 1;

// fallow-ignore-next-line unused-type
export type KeepThisType = string;

// fallow-ignore-file
```

The kind token must be the exact singular issue kind (`unused-class-member`, not `unused-class-members`) and the only text after the directive — fallow parses every space-separated token as a kind, so trailing prose (`-- because …`) produces "stale suppression" noise.
Put rationale on the line above the directive.

Use `/** @public */` or `/** @expected-unused */` JSDoc tags for library API exports.

## Auto-fix cycle

Always dry-run first:

```bash
pnpm fallow fix --dry-run    # preview
pnpm fallow fix --yes        # apply (--yes required in non-TTY)
pnpm fallow dead-code        # verify
```

## Key gotchas

1. Fallow uses syntactic analysis only (no TypeScript compiler) — fully dynamic `import(variable)` is not resolved.
2. Re-export chains through barrel files are resolved correctly.
3. `--changed-since` is additive — only new issues in changed files.
4. Never run `fallow watch` — it is interactive and never exits.
5. The human-readable `health --targets` output omits the "Refactoring targets" section entirely when there are zero targets — to confirm a file dropped off the list, use `--format json` and check the `targets` array is empty rather than grepping the text output.
6. Class-member liveness is keyed off `implements` clauses: a member reached only through a structural type the class does not explicitly `implements` reads as dead once the last `implements` is removed.
   Prefer re-declaring the genuine contract (`implements ThatInterface`) over a suppression.
   If the consumer is wired via an object-literal property (which fallow cannot trace), prefer moving the read into a traced closure body at the composition root (e.g. `getX: () => owner.member`) over a suppression; suppress only when neither is practical.
