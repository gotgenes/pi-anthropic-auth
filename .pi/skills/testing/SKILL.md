---
name: testing
description: |
  Vitest mock patterns (vi.mock, vi.hoisted, vi.fn reset), TDD planning rules,
  and general test strategy. Load when writing or debugging tests.
---

# Testing

Load this skill when writing, debugging, or planning tests.

## Vitest mock patterns

### vi.mock and hoisting

- When using `vi.mock()`, extract each `vi.fn()` stub to a module-scope variable and reset it in `beforeEach` — `vi.restoreAllMocks()` only operates on `vi.spyOn()` spies, not on `vi.fn()` instances.
  Use `.mockReset()` when the stub has no default implementation.
  Use `.mockClear()` when the `vi.mock()` factory provides a default implementation that tests must preserve.
- When a `vi.mock()` factory references a module-scope `vi.fn()` stub, wrap the stub declaration in `vi.hoisted()` — Vitest hoists `vi.mock()` above normal declarations, so unhoisted variables are `undefined` when the factory runs.
- When mocking a class constructor with `vi.mock()`, use `vi.fn()` with no implementation — not `vi.fn(() => ({}))`.
  Arrow-function implementations are not constructable; `new MockClass()` throws `"is not a constructor"`.
- When mocking `node:*` built-in modules with `vi.mock()`, include a `default` key mirroring the named exports — omitting it causes "No default export defined on the mock" errors.

### Typing mock functions

- When a `vi.fn()` factory returns an empty array or narrow literal, annotate its return type explicitly — `vi.fn((): string[] => [])`, not `vi.fn(() => [])`.
  Without the annotation TypeScript infers `never[]`, and subsequent `mockReturnValueOnce([...])` calls fail with “not assignable to `never`”.
  Use `import type` to pull domain types (e.g., `AgentConfig`, `PreloadedSkill`) for the annotation.
- When typing a mock field on an interface, use `Mock<specific-signature>` — e.g., `Mock<() => void>`, `Mock<(arg: string) => Promise<void>>`.
  Do not use `ReturnType<typeof vi.fn>` — in Vitest v4 it expands to `Mock<Procedure | Constructable>`, a union that TypeScript cannot call.

### Test factories

- When a test factory returns an object satisfying a production interface (e.g., `RunnerIO`, `AssemblerIO`), do not annotate the return type with that interface — the annotation erases `Mock<...>` methods (`mockResolvedValue`, `mock.calls`, etc.) from the inferred type.
  Leave the return type unannotated so callers retain full mock access.
- When a shared test factory's return value must structurally satisfy a production interface (e.g., passed to `createSubagentSession(params, deps)`), add typed implementations to every `vi.fn()` stub — `vi.fn((_param: Type): ReturnType => default)`, not `vi.fn().mockReturnValue(default)`.
  Bare `vi.fn()` and chained `.mockReturnValue()` produce `Mock<Procedure>` which is not assignable to specific function signatures.
- When a test factory accepts overrides via `Partial<ProductionInterface>`, the spread `{ ...defaults, ...overrides }` creates a union type that also erases mock methods.
  Either remove the `Partial<ProductionInterface>` annotation (let TypeScript infer from the spread) or drop the overrides parameter and configure mocks on the returned object directly.
- When a test factory uses `??` to supply defaults from an overrides object, explicit `undefined` values are swallowed.
  Use `"key" in overrides` presence checks or `Object.hasOwn(overrides, "key")` for fields where `undefined` is a meaningful test value.
- When dropping an `as unknown as X` cast from a mock, the type checker starts verifying `mockReturnValue` payloads too, not just method presence.
  Incomplete return-value literals the cast used to mask (e.g. `{ state: "allow" }` for a full `PermissionCheckResult`) fail `pnpm run check`; build them with the shared `make*` fixture builder instead.

### Timers and environment

- When testing code that uses `setInterval`, never use `vi.runAllTimersAsync()` — it loops infinitely.
  Use `vi.advanceTimersByTimeAsync(ms)` with a specific duration instead.
- Prefer reading `process.env` inside functions rather than capturing it as a module-level constant — `vi.stubEnv()` alone cannot change a constant already evaluated at import time.
  If a module-level constant is unavoidable, test it with `vi.resetModules()` + `await import(...)` inside the test body, and call `vi.unstubAllEnvs()` + `vi.resetModules()` in `afterEach`.

## Test assertions

- Prefer strong assertions that match the **entire** expected value (`toBe`, `toEqual`) over subset matchers (`toContain`, `toMatchObject`, `expect.objectContaining`).
  Weak assertions hide unexpected values and make tests less useful as documentation.
  When a weak assertion is necessary (third-party output, non-deterministic ordering), add a comment explaining why.
- Prefer a concrete test asserting current (even imperfect) behavior over `test.todo`.
  A real assertion documents the limitation and lets a future fix flip the expectation.
- When a test reveals a pre-existing bug rather than a wrong assumption, use `test.fails` to document the expected behavior and file a GitHub issue.
- Do not insert no-op statements (`void 0;`, unused locals) in tests just to make an `Edit` tool's `oldText` unique — widen `oldText` with surrounding context instead.
- When a non-`async` method declared `Promise<T>` must signal a precondition failure, `return Promise.reject(new Error(...))`, not `throw` — a synchronous `throw` escapes `expect(...).rejects.toThrow(...)`, and switching to `async` to fix that trips `@typescript-eslint/require-await` when the body has no `await`.
- Assert mock calls with `expect(fn).toHaveBeenCalledWith(...)`, not `fn.mock.calls[0]![0]`.
  A typed `vi.fn<(a: string) => void>()` makes the call tuple non-optional, so the `!` trips `@typescript-eslint/no-unnecessary-type-assertion`.

## Test organization

Group tests by the behavior or concern they exercise — open a nested `describe("<concern>", () => { ... })` per concern rather than appending `it` blocks to a flat list.
When adding tests for a new concern (e.g. a `details` field alongside existing content assertions), start a new `describe` block instead of extending the existing one.
When consolidating duplicated test arrangements, group the shared setup in a describe-scoped `beforeEach` and keep the act (the call under test) explicit in each test.
Do not wrap the system-under-test call in a helper to eliminate a duplication-metric clone — the repeated act is the test subject, not duplication to remove.

## Type checking

Vitest uses esbuild and does not typecheck.
Run `pnpm run check` (`tsc --noEmit`) for type-only changes.

## Running tests

- Run a single file: `pnpm test <test-path>`.
- Run the full suite: `pnpm test`.
- When a fix changes shared helper functions, run the full suite before committing — not just the directly affected test file.

## Operator semantics

- When `prefer-nullish-coalescing` flags `||`, check whether the left side could be a falsy non-null value (`""`, `0`, `false`) that the code intentionally converts to the fallback.
  If so, keep `||` and add `// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- || intentional: converts falsy values to fallback`.
  Do not mechanically replace `||` with `??` without verifying test expectations.

## TDD planning rules

### Step sequencing and breakage

- When a TDD step changes behavior, account for existing tests that will break.
  Either fold the test updates into the same step or place a dedicated test-update step immediately before it.
- When a TDD plan lists separate steps that share a type definition, changing that type in step N breaks steps N+1…N+k.
  Either fold them into one step or introduce the new type alongside the old one and migrate callers incrementally.
- When a plan adds a parameter that flows through callback chains, the "Module-Level Changes" section must list every file in the chain.
- When a TDD step changes a shared interface, run `pnpm run check` immediately after that step's commit.
- When a TDD step changes an interface that has a single call site (e.g., a deps bag constructed in `index.ts`), the step must include updating that call site — the type checker will not allow the interface change and the call-site update to land in separate commits.
- When a TDD plan deletes a module across multiple steps (extract → remove consumers → delete), account for the doomed module's own imports at each intermediate step.
  If step N removes a type or function that the doomed module still imports, either delete the module in the same step or patch its imports to compile cleanly.
- When a TDD step adds test infrastructure to a package that had none (vitest config, tsconfig path aliases, test scripts), run `pnpm run check` immediately after that step to catch config issues before subsequent steps depend on the infrastructure.

### Interface and type changes

- When a TDD step narrows a union type (removes variants), grep all test files for fixtures or mocks that use the removed variant — those test fixes must land in the same step as the type change, not in later steps.
- When adding a field to a shared interface, grep for ALL test files that construct a compatible mock — not just factory helpers.
- When a TDD step removes a field from a shared interface, grep all `src/` files that reference the removed field — every file that reads or passes the field must update in the same step.
  This is the inverse of the excess-property rule: TypeScript rejects reading a property that no longer exists on the type.
- When a TDD step removes an interface from an `extends` or intersection chain, grep for types that compose it (`extends <Interface>`, `<Interface> &`) — intersection mock supertypes (e.g. `MockGateHandlerSession`) silently lose the removed members and break at the construction site, not the type definition.
- When removing fields from a shared init type, grep for all test files and factory helpers that pass the removed field — esbuild won't reject unknown properties at runtime, so tests silently get wrong default values instead of failing.
- When a change moves *when* a value or service becomes available (e.g. factory-init → `session_start`), grep all test files for consumers that resolve it — not just the tests you already plan to touch.
  A timing change breaks them at runtime (the full suite), not at typecheck, so `pnpm run check` will not flag them.
- When a step changes the *format* of a value recorded at runtime and replayed by a different consumer (e.g. a session-approval pattern matched against a later request), fold every producer and consumer of that namespace into one commit.
  `tsc` passes either way; only a cross-consumer runtime test exercising both the producer and the consumer catches the mismatch.
- When extracting a conditional `await` (`if (x) await f()`) into an always-`async` helper, the no-op path gains a microtask boundary it did not have.
  Tests asserting synchronous ordering (e.g. a factory called in the same tick as `spawn()`) break at runtime, not typecheck.
  Keep a synchronous guard at the call site (`if (bracket.hasProvider()) await bracket.prepare(…)`) to preserve the fast path.
- When a TDD plan nests a previously-flat interface (e.g., splitting `Config` into `{ identity, execution }`), grep test factories for `Partial<OldInterface>` spread patterns.
  Top-level `...overrides` does not deep-merge — flat-key overrides like `{ description: "my task" }` silently become no-ops when the field moves into a nested sub-object.
  Either replace each call site with the full nested sub-object or switch to a deep-merge helper.
- When a TDD plan converts an interface to a class, grep for `{ ...variable` spread patterns in tests — spreading a class instance produces a plain object that lacks the class's methods and private fields.
  Replace with `createTestX({ ...overrides })` factory calls or direct field mutation.

### Test maintenance

- When a TDD step deletes a test or test helper, re-check the file's remaining imports for orphans.
  Biome's `noUnusedImports` is warning-level (exit 0), so `pnpm run lint` stays green and the pre-completion reviewer is the only backstop.
- When consolidating duplicate test factories into a shared helper, diff the default values across all copies before writing the shared factory.
  Different defaults cause cascading assertion failures during migration steps.
- When a lift-and-shift step keeps a transitional wrapper alive for later migration, do not mark it `@deprecated` — `@typescript-eslint/no-deprecated` fires on every surviving call site at commit time; use a prose comment instead.

### Exploration before planning

- When integrating an unfamiliar library or data structure, write a disposable exploratory script first to inspect the actual runtime shape.
- When a TDD plan extracts a locally-declared type that shadows an SDK type, verify whether the SDK exports the type before planning around the local copy.
  Dead fallback branches in the local type produce dead test cases and unnecessary complexity.
