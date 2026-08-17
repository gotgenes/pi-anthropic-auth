---
name: design-review
description: |
  Review a module's dependency and structural patterns for code smells.
  Use when adding a parameter to a shared interface, when a dependency bag grows past 5 fields,
  or when planning a refactoring that touches wiring between layers.
metadata:
  short-description: Structural design review for dependency and encapsulation smells
---

# Design Review

Use this skill to audit a module (or a set of related modules) for structural smells before they accumulate into a large refactoring.

## When to invoke

- A shared interface (options bag, config type, handler params) is gaining a new field.
- A test factory helper has more than 8 fields.
- A plan adds a parameter that threads through 3+ layers.
- A change reads as a localized bug fix but adds or relays a parameter across functions — a bug fix can be a wiring change.
- You are unsure whether a new dependency belongs on an existing object or needs a new one.
- The same comparison (`platform === "win32"`, `status === "running"`) appears at 3+ sites across modules.

## Checklist

Work through each check in order.
Use `grep` and `read` to gather evidence before making judgments.

### 1. Dependency width

Grep for the interface or type being reviewed.
Count the fields.
For each consumer (function or class that receives it), list which fields that consumer actually reads or writes.

Ask:

- Does every consumer use more than half the fields?
  If not, the interface is too wide.
- Are there natural clusters of fields that always appear together?
  Those are missing intermediate abstractions (value objects or collaborator interfaces).

Also flag **projection parameters**: when a function receives both `X` and `Y` and `X` is derivable from `Y` (a field or parse-product of it), drop `X` and read it from `Y` — the object that owns the data.
Example: passing a raw `command` string alongside a parsed program object built *from* that command; give the parsed object a `commandText()` accessor instead.

### 2. Law of Demeter violations

Search for chained access patterns (e.g., `deps.foo.bar.baz`).
Each chain `a.b.c()` means `a` exposes `b` and the caller talks to `b` directly — a coupling that leaks into tests.
The fix is a method on `a` that delegates to `b` internally.

Ask:

- Do multiple callers perform the same reach-through?
  That confirms the missing method.
- Does the intermediate object appear in the caller's test mocks?
  If yes, the coupling is leaking into tests.

### 3. Output arguments

Search for writes back into a received parameter (e.g., `deps.field = value`).
Each such write means the function is mutating state it does not own.
The fix is a method on the owning object or a returned value.

Ask:

- Is the same field written in multiple places?
  That is scattered state management — extract a single method.
- Is the write paired with a read elsewhere?
  The object that reads should own the write.

### 4. Scattered resets

Search for repeated patterns of field initialization (e.g., `deps.field = null`).
If 3+ call sites set the same fields to the same defaults, extract a `reset()` or `shutdown()` method.

### 5. Parameter relay

When a parameter must flow through a callback chain, check whether intermediaries use it or just relay it.
If they only relay, the parameter belongs on a shared object — not threaded through every layer.

### 6. Repeated discriminators

Sweep for the same comparison evaluated across files:

```bash
grep -rhoE '[A-Za-z_.]+ [!=]== "[a-z0-9_-]+"' src --include="*.ts" | sort | uniq -c | sort -rn | awk '$1 >= 3'
```

For each family with 3+ production sites, ask:

- Does a dispatch point already exist (a facade, normalizer, or owning object) that the sites bypass?
- Must the sites agree?
  Re-derived algorithms (a case-fold, an option literal) that must match are connascence of algorithm — one divergent site is a silent bug.
- Is the branching compiler-enforced (a `never`-exhaustive switch) or silent (`===` comparisons a new variant sails past)?

A single exhaustive switch at one dispatch site, per-variant presentation dispatch, and validation-edge type guards are idiomatic — the smell is scattered re-decision, not the conditional itself.
Note: fallow cannot see this class (scattered one-line conditionals never form a token-run clone), so this sweep is the only detector.

### 7. Test mock depth

Read the test files for the module under review.
Look for:

- `as unknown as` casts — the mock cannot satisfy the real type naturally.
- Deeply nested mock objects — production code likely has LoD violations.
- Fields in factory helpers that no test in the file ever overrides — the interface is too wide for this consumer.

### 8. Missing intermediate abstractions

After completing checks 1–7, look for groups of raw dependencies that form a cohesive concept:

- Multiple related strings computed from the same root → value object.
- Multiple function deps that always appear together → interface.
- Mutable state + the methods that read/write it → class.
- The same conditional at multiple sites → a strategy/policy object selected once at the boundary, or a predicate on the owning object.

Name the abstraction.
Verify it reduces the field count of the parent interface by at least 2.

## Output

Summarize findings as a table:

| Smell           | Location                 | Evidence                 | Suggested fix                         |
| --------------- | ------------------------ | ------------------------ | ------------------------------------- |
| Wide interface  | `FooOptions` (12 fields) | `doBar` uses 3           | Narrow per-call interface             |
| LoD violation   | `module.ts:45`           | `opts.config.repo.owner` | Accept `owner` directly or add helper |
| Output argument | `handler.ts:88`          | `state.result = parsed`  | Return value instead                  |

Then recommend whether the fixes are:

- **Inline** — small enough to do in the current PR.
- **Follow-up issue** — needs its own plan.
- **Track and watch** — not yet painful enough to fix; note it and revisit if it grows.
