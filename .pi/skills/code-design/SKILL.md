---
name: code-design
description: |
  TypeScript conventions, code design principles (SOLID, self-documenting code, file organization),
  structural design heuristics (dependency width, LoD, output arguments),
  pnpm rules, ES2024 target, Pi SDK patterns, and Biome/ESLint conflict workarounds.
  Load during implementation, refactoring, or code review.
---

# Code Design

Load this skill when implementing, refactoring, or reviewing TypeScript code.

## Self-Documenting Code

Code should be its own primary documentation.
Prefer names that reveal intent — for functions, methods, classes, variables, and modules.

### Names over comments

If a comment is needed to explain _what_ code does, extract a well-named function or rename the symbol.
Comments should explain _why_ — the reasoning or non-obvious context behind a decision.
Do not leave tombstone comments that narrate removed code or the absence of a guard, test, or branch — the type system and the diff already document it.

### Scope-appropriate naming

Name length should correspond to scope.
Short names (`i`, `x`, `fn`) are fine for small scopes (loop counters, short lambdas).
Exported functions, module-level variables, and class names warrant longer, descriptive names.

### Doc comments

Add JSDoc/docstrings where the ecosystem expects them — typically on public/exported APIs.
Do not add doc comments when the name and signature already convey usage.

## Code Organization

Source files should read like a newspaper article: high-level intent at the top, progressively deeper detail as you read down.

### Public API first

Exported functions, classes, and interfaces appear near the top so readers can scan the module's surface without wading through implementation details.

### Stepdown rule

Each function should be followed by the helpers it calls, at the next level of abstraction — caller first, then the helpers it depends on.
Related functions that collaborate on the same data should be grouped together.
When extracting a helper during a refactor, place it _below_ the function that calls it, not above — function declarations hoist, so "define before use" is unnecessary and inverts the stepdown order.

### Helpers stay in the file

Private helper functions remain in the same file as the code that uses them.
When private helpers accumulate to the point where they warrant their own tests, extract them into a new module with its own public API.

## SOLID Principles

### Single Responsibility (SRP)

Each function, class, and module should do one thing well.
When a unit of code has multiple reasons to change, split it.
A function that parses input _and_ processes it should be two functions; a module that handles both HTTP routing and business logic should be two modules.

### Interface Segregation (ISP)

Prefer small, focused interfaces over large ones.
Clients should not be forced to depend on methods or properties they don't use.
When an interface grows, look for natural seams to split it into smaller, cohesive contracts.

### Dependency Inversion (DIP)

High-level modules should not depend on low-level modules; both should depend on abstractions.
Default to dependency injection for non-trivial dependencies — accept collaborators as parameters rather than constructing them internally.
DI is the mechanical foundation of test-driven development: without it, you cannot substitute test doubles, and without test doubles, you cannot test units in isolation.
Design for injection from the start rather than retrofitting it later.
When adding a new collaborator to a class that still constructs other collaborators internally, inject the new one anyway — existing constructor-internal construction is often the smell being removed, not a precedent to extend.

## Structural Design

### Dependency width

Do not pass a shared dependency bag to functions that only use a subset of it.
When a function receives an object and only touches a few of its fields, the function's real dependencies are invisible.
Define a narrow interface or accept the needed values directly.

When a shared interface references a collaborator, use a narrow interface type — not the concrete class.
Concrete class types expose private fields to TypeScript's structural checker, forcing test mocks to cast or replicate internals.

### Law of Demeter

Do not reach through an injected collaborator to talk to a stranger.
If multiple callers do the same reach-through, the missing abstraction is a method on the intermediate object that delegates internally.

### Output arguments

Do not write back into a received dependency bag.
If a function sets a field on a received object, it is doing work that belongs inside the owning object.
Encapsulate the mutation behind a method.

### Scattered resets

When the same set of fields is reset to the same values in multiple places, extract a single method (`reset()`, `shutdown()`) on the owning object.

### Parameter relay

When a new parameter must flow through a callback chain, check whether the intermediaries actually need it.
If they only relay it, the parameter belongs on an object the endpoints share — not threaded through every layer.

### Unbounded loops

An ESLint `no-unnecessary-condition` flag on `while (true)` signals an unbounded loop with hand-rolled termination, not just a lint nuisance.
Bound it over a known sequence (e.g. iterate the path components) rather than dodging the rule with `for (;;)` — `for (;;)` carries the same smell.

### Cross-extension composition

When one extension needs to communicate with another, prefer event-driven composition over outbound bridge modules.
Publish events on the event bus or expose a service API via `Symbol.for()` — let consumers hook in rather than reaching out to known consumers.
This keeps the publishing extension closed for modification when new consumers arrive.
Do not add a bridge module that imports or dynamically discovers a specific consumer; that creates an outbound dependency that inverts the desired direction.

### Structural reasons before extracting duplication

Before extracting apparent duplication into a shared abstraction, trace why the duplicates exist.
Apparent duplication may encode genuinely different logical things — different document-outline positions, different lifecycle constraints, different consumer contexts — in which case extraction creates a leaky abstraction with a discriminator parameter that exists only to paper over the difference.

When you see two pieces of similar code, ask: "If the structural context differs, what would make them differ?"
Read the surrounding layout, the call sites, the document outline.
If the difference is a real structural distinction, prefer duplication and document why.
If the difference is incidental, extract.

Sandi Metz: "duplication is far cheaper than the wrong abstraction."

### Preparatory refactoring (tidy first)

Before planning or landing a refactor as one atomic commit, ask whether a preparatory step would shrink it — a pure-addition interface, or migrating tests to a shared fixture — landed as separate commits first.
Kent Beck: "make the change that makes the change easy, then make the easy change."

## TypeScript

- Avoid `any` unless absolutely necessary.
- Use standard top-level imports only.
- Within a package, import sibling modules via the `#src/` / `#test/` path aliases, not relative paths (`../src/...`) — eslint enforces this and will rewrite violations.
- Keep modules focused and composable (one concern per file).
- Prefer explicit configuration over hidden behavior.
- Business logic should be pure functions wherever possible — keep IO at the edges.
- Do not read `process.env`, `process.cwd()`, or `process.platform` inside library/utility functions — accept the value as a parameter.
  Reading `process.*` inside a function hides a dependency on global state and forces tests to stub or reset modules.

### Barrel exports

When a rename or extraction adds exports to a barrel file (`types.ts`, `index.ts`), verify at least one consumer imports the symbol from that barrel — not from the source module directly.
Do not add speculative re-exports; fallow will flag them as dead code.

### Public API documentation

When adding a public or cross-extension API (a service method, exported seam, or registration hook), document it for third-party authors — input/return contract, error/throw semantics, a minimal wiring example, and known limitations — not just the type signature.

### Pi SDK boundaries

Keep Pi SDK imports out of business-logic modules.
Tool definitions, event handlers, and command handlers are SDK consumers — they may import SDK types directly.
The restriction targets pure helpers, utilities, and domain modules that should remain SDK-independent.
When a new capability is needed in a library module, accept it as a parameter or callback — do not reach for the Pi SDK directly.

Before redeclaring a Pi SDK type locally, check whether it's already exported from `@earendil-works/pi-ai` or `@earendil-works/pi-coding-agent`.
Import directly when the exported type matches; redeclare only when narrowing is intentional (ISP).

When writing event handlers that consume Pi SDK types, prefer lean local payload interfaces over full SDK event types.
The SDK may not export all event interfaces, and exported types often require fields the handler does not read.
Define a minimal interface with only the fields the handler uses.

When a shared function parameter must accept SDK content types (e.g., `TextContent | ThinkingContent | ToolCall`), prefer a minimal structural supertype like `{ type: string }` over an index-signature type like `{ type: string; [key: string]: unknown }`.
SDK interfaces lack index signatures; index-signature parameters force `as unknown as` double-casts at call sites.

When writing `promptGuidelines` for a tool registration, name the tool in every bullet — Pi flattens all tools' guidelines into one `Guidelines:` block without per-tool attribution ([earendil-works/pi#4879](https://github.com/earendil-works/pi/issues/4879)).

When a tool's `execute` returns a discriminated-union `details` (e.g. `{ kind: "transcript" } | { kind: "status" }`), `defineTool` infers its `TDetails` generic from the first narrowed return and rejects the other branch.
Cast each return's `details` `as <Union>` so the full union flows into the generic — `satisfies <Union>` keeps the narrowed branch type and does not fix the inference.

## Tooling

- This project uses **pnpm** exclusively (`"packageManager"` in `package.json`; `pnpm-lock.yaml`).
  Use `pnpm run`, `pnpm exec`, and `pnpm add` — never `npm` or `npx`.
- When you change a `package.json` dependency, run `pnpm install` and commit the updated `pnpm-lock.yaml` in the same commit — CI installs with `--frozen-lockfile`.
- The tsconfig target is ES2024 (`noEmit: true`).
  ES2023 APIs (`findLast`, `findLastIndex`, `toReversed`, `toSorted`, `toSpliced`, `with`) and ES2024 APIs (`Promise.withResolvers`, `Object.groupBy`, `Map.groupBy`, `Array.fromAsync`) are available and preferred.
  Do not use APIs introduced after ES2024.
- When you lift the only `await` out of a `src/` function (e.g. moving a parse or IO call to the caller), drop `async` and return synchronously.
  `@typescript-eslint/require-await` is enabled for `src/` (disabled only for `test/`), so an `async` function with no `await` fails lint.

## Biome / ESLint linter conflicts

### Non-null assertion loop

Biome's `noNonNullAssertion` bans `x!` and ESLint's `no-unnecessary-type-assertion` auto-fixes `x as T` back to `x!`.
When both linters run on the same file, assertion-based workarounds create an unsolvable loop.
Fix: restructure the code to eliminate the assertion entirely (explicit `if` guard with early return).

### Unbound interface methods

Passing an interface method as a bare value (`writeReviewLog: logger.review`) trips `@typescript-eslint/unbound-method`; the rule's suggested `this: void` fix is itself rejected by `@typescript-eslint/no-invalid-void-type`.
Fix: wrap in an arrow (`(e, d) => logger.review(e, d)`).

### prefer-const on forward-declared let

ESLint `prefer-const` fires on a `let` assigned exactly once — even with no initializer (e.g. a forward declaration captured by a closure before assignment).
`const` without an initializer is a syntax error, so the suggested fix is impossible, but the error still triggers (biome's `useConst` correctly skips it; a `let` reassigned 2+ times is also skipped).
Fix: `// eslint-disable-next-line prefer-const -- forward-declared let; const requires an initializer`.

### void on a promise-returning call

Before adding `void` to silence `@typescript-eslint/no-floating-promises`, confirm the discarded promise carried no semantics (capture for later `await`, ordering, completion signal).
If the promise was previously assigned or awaited, the `void` is a behavior change, not a formatting fix — give the value an owner (store it, or invert control so the owning object captures it) instead.
