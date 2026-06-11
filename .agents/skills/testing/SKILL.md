---
name: testing
description: |
  Vitest mock patterns (vi.mock, vi.hoisted, vi.fn reset), assertion strategy,
  and TDD planning rules. Load when writing or debugging tests.
---

# Testing

Load this skill when writing, debugging, or planning tests.

## This repo's conventions

- Test files are named `*.test.ts` and live under `test/`, not next to source.
- Tests use `node:assert/strict` for assertions and vitest's `test` runner (`onTestFinished` for per-test cleanup).
- Mock `globalThis.fetch` for OAuth flows; build payload fixtures inline rather than depending on Pi internals.
- Cross-directory imports use `#src/` and `#test/` aliases (e.g., `#src/constants`).
- When asserting on shaped system prompts, prefer regex matches that pin specific markers (`/^You are an expert coding assistant\./`, `/# Project Context/`) over deep-equal on full prompt strings, so tests survive harmless reformatting upstream.

## Running tests

- Full suite: `pnpm test` (`vitest run`).
- Watch mode: `pnpm run test:watch`.
- A single file: `pnpm exec vitest run <test-path>`.
- Typecheck (vitest uses esbuild and does not typecheck): `pnpm run check` (`tsc --noEmit`).
- When a fix changes a shared helper, run the full suite before committing — not just the directly affected file.

## Vitest mock patterns

These apply when a test does reach for `vi.mock()` / `vi.fn()` rather than the inline-fixture style above.

- When using `vi.mock()`, extract each `vi.fn()` stub to a module-scope variable and reset it in `beforeEach` — `vi.restoreAllMocks()` only operates on `vi.spyOn()` spies, not on `vi.fn()` instances.
  Use `.mockReset()` when the stub has no default implementation.
  Use `.mockClear()` when the `vi.mock()` factory provides a default implementation that tests must preserve.
- When a `vi.mock()` factory references a module-scope `vi.fn()` stub, wrap the stub declaration in `vi.hoisted()` — Vitest hoists `vi.mock()` above normal declarations, so unhoisted variables are `undefined` when the factory runs.
- When a `vi.fn()` factory returns an empty array or narrow literal, annotate its return type explicitly — `vi.fn((): string[] => [])`, not `vi.fn(() => [])`.
  Without the annotation TypeScript infers `never[]`, and subsequent `mockReturnValueOnce([...])` calls fail with “not assignable to `never`”.
- When typing a mock field on an interface, use `Mock<specific-signature>` — e.g., `Mock<() => void>`, `Mock<(arg: string) => Promise<void>>`.
  Do not use `ReturnType<typeof vi.fn>` — in Vitest v4 it expands to `Mock<Procedure | Constructable>`, a union that TypeScript cannot call.
- When mocking a class constructor with `vi.mock()`, use `vi.fn()` with no implementation — not `vi.fn(() => ({}))`.
  Arrow-function implementations are not constructable; `new MockClass()` throws `"is not a constructor"`.
- When mocking `node:*` built-in modules with `vi.mock()`, include a `default` key mirroring the named exports — omitting it causes "No default export defined on the mock" errors.
- When testing code that uses `setInterval`, never use `vi.runAllTimersAsync()` — it loops infinitely.
  Use `vi.advanceTimersByTimeAsync(ms)` with a specific duration instead.
- When a test factory returns an object satisfying a production interface, do not annotate the return type with that interface — the annotation erases `Mock<...>` methods (`mockResolvedValue`, `mock.calls`, etc.) from the inferred type.
  Leave the return type unannotated so callers retain full mock access.
- When a test factory uses `??` to supply defaults from an overrides object, explicit `undefined` values are swallowed.
  Use `"key" in overrides` presence checks or `Object.hasOwn(overrides, "key")` for fields where `undefined` is a meaningful test value.
- Prefer reading `process.env` inside functions rather than capturing it as a module-level constant — `vi.stubEnv()` alone cannot change a constant already evaluated at import time.
  If a module-level constant is unavoidable, test it with `vi.resetModules()` + `await import(...)` inside the test body, and call `vi.unstubAllEnvs()` + `vi.resetModules()` in cleanup.

## Test assertions

- Prefer strong assertions that match the **entire** expected value over subset matchers.
  Weak assertions hide unexpected values and make tests less useful as documentation.
  When a weak assertion is necessary (third-party output, non-deterministic ordering), add a comment explaining why.
- Prefer a concrete test asserting current (even imperfect) behavior over `test.todo`.
  A real assertion documents the limitation and lets a future fix flip the expectation.
- When a test reveals a pre-existing bug rather than a wrong assumption, use `test.fails` to document the expected behavior and file a GitHub issue.
- Do not insert no-op statements (`void 0;`, unused locals) in tests just to make an `Edit` tool's `oldText` unique — widen `oldText` with surrounding context instead.
- When a non-`async` function declared `Promise<T>` must signal a precondition failure, `return Promise.reject(new Error(...))`, not `throw` — a synchronous `throw` escapes `expect(...).rejects.toThrow(...)`, and switching to `async` trips `@typescript-eslint/require-await` when the body has no `await`.

## Operator semantics

- When `prefer-nullish-coalescing` flags `||`, check whether the left side could be a falsy non-null value (`""`, `0`, `false`) that the code intentionally converts to the fallback.
  If so, keep `||` and add `// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- || intentional: converts falsy values to fallback`.
  Do not mechanically replace `||` with `??` without verifying test expectations.

## TDD planning rules

- When a TDD step changes behavior, account for existing tests that will break.
  Either fold the test updates into the same step or place a dedicated test-update step immediately before it.
- When a TDD step deletes a test or test helper, re-check the file's remaining imports for orphans.
- When a TDD plan lists separate steps that share a type definition, changing that type in step N breaks steps N+1…N+k.
  Either fold them into one step or introduce the new type alongside the old one and migrate callers incrementally.
- When a TDD step narrows a union type (removes variants), grep all test files for fixtures or mocks that use the removed variant — those fixes must land in the same step as the type change.
- When a TDD step changes a shared interface, run `pnpm run check` immediately after that step's commit.
- When adding a field to a shared interface, grep for ALL test files that construct a compatible fixture — not just factory helpers.
- When a TDD step removes a field from a shared interface, grep all `src/` files that reference the removed field — every file that reads or passes the field must update in the same step.
- When a change moves *when* a value becomes available (e.g. factory-init → `session_start`), grep all test files for consumers that resolve it.
  A timing change breaks them at runtime (the full suite), not at typecheck, so `pnpm run check` will not flag them.
- When integrating an unfamiliar library or data structure, write a disposable exploratory script first to inspect the actual runtime shape.
- When consolidating duplicate test factories into a shared helper, diff the default values across all copies before writing the shared factory.
  Different defaults cause cascading assertion failures during migration.
