---
name: improvement-discovery
description: |
  Heuristics and process for discovering structural improvements in this package.
  Load when planning a new improvement round — contains the smell taxonomy,
  analysis workflow, and prioritization framework distilled from many phases of
  refactoring.
---

# Improvement Discovery

Use this skill when planning the next round of structural improvements for this package.
It codifies the patterns, smell categories, and analysis workflow that have proven effective across many phases of refactoring.

## Analysis workflow

Follow this order — each step builds context for the next.

### 1. Run fallow

The `fallow:*` scripts live in this repo's own `package.json`.
Run the analysis commands directly:

```bash
pnpm fallow health --score --hotspots --targets 2>&1 || true
pnpm fallow dead-code 2>&1 || true
pnpm fallow dupes 2>&1 || true
```

Capture: health score, dead exports, duplication (production vs. test), hotspots, refactoring targets.

### 2. Read the architecture document

Load `docs/architecture/architecture.md` for the current domain model, health metrics table, and dependency bag inventory.
Check which bags/hotspots have already been addressed vs. remain open.

### 3. Start from the entry point and work inward

Begin at `src/index.ts` (or the package's composition root) and trace the dependency graph outward.
This "outside-in" traversal reveals:

- **Wiring overhead** — how much boilerplate sits between the extension API and domain logic
- **Coupling at the boundary** — what domain objects does the entry point directly touch
- **Forward references / initialization ordering** — fragile temporal coupling
- **Adapter closure density** — narrow interfaces are good, but 40+ adapter closures signal over-abstraction or missing intermediate objects

For each imported module, note:

- Size (lines)
- Number and width of exports
- How deep it goes (fan-out)
- Whether it's a pure function, stateful class, or adapter

### 4. Identify smells using the taxonomy below

### 5. Prioritize using the severity framework

### 6. Group into issue-sized steps with a dependency graph

## Smell taxonomy

These are the recurring patterns that have driven many phases of improvements.
They are ordered from most impactful (structural) to least (cosmetic).

### Category A: Dead or redundant code

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Unused exports | fallow dead-code reports | Remove or suppress with `@public` |
| Unused files | No import chain reaches them | Delete |
| Dead subsystems | Feature with zero runtime consumers | Remove entirely |
| Dual counting | Same metric tracked in two places | Single source of truth |
| Production duplication | Shared logic copy-pasted between modules | Extract shared module |

### Category B: Oversized structures

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| God file (300+ lines) | wc -l + mixed responsibilities | Extract domains into focused modules |
| God function (cyclomatic ≥ 15) | fallow targets | Extract sub-functions per branch |
| God interface (10+ fields) | Dependency bag mixing concerns | Split by cohesion; nest related groups |
| Churn hotspot | High commit frequency × complexity | Refactor the file structure to reduce change frequency |

### Category C: Coupling and boundaries

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Anemic domain model | Manager reaches into data objects 10+× to check state and call transitions | Move behavior onto the domain object (Tell-Don't-Ask) |
| Mutable closure state | `let` variables shared across closures/callbacks | Introduce a lifecycle object that owns the state |
| Relay-only dependencies | Class stores fields it only passes to another object | Move the fields to the consumer's construction |
| Platform type threading | `ExtensionContext` or SDK types deep in domain | Push to boundary, capture snapshot/value object |
| Wide parameter lists | Functions with 5+ params, some always travel together | Group into value objects or extract into class |
| Forward references | Closure captures a variable before it's assigned | Reorder initialization or use post-construction wiring |
| Adapter closure density (40+) | Entry point full of `(x) => obj.method(x)` | Create intermediate factory objects or use `.bind()` |
| Cross-layer imports | UI importing from lifecycle internals | Add a public interface layer |

### Category D: Testability

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| `vi.mock()` at module level | Module-level mocking in test files | Inject dependency via IO interface |
| `as any` casts in tests | Constructing wide mocks for narrow usage | Narrow the interface the code depends on |
| Test duplication (high) | fallow dupes in test/ | Extract shared fixtures or test factories |
| Shared factory complexity | Factory needs its own unit tests | Narrow the production interface (ISP) |
| Untestable pure logic | Logic embedded in stateful class | Extract as pure function |

### Category E: Naming and organization

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Flat directory (20+ files) | `ls src/` shows undifferentiated list | Group into domain subdirectories |
| `deps.` prefix noise | Every access in function body is `deps.foo` | Destructure in signature or dissolve small bags (≤4 fields) |
| Barrel re-export sprawl | `index.ts` re-exports everything | Remove barrel; use direct imports |
| Unclear module boundaries | Same concept lives in 3 files | Co-locate; single responsibility |

### Category F: Cross-package responsibility overlap

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Duplicate policy enforcement | Two packages both filter/restrict the same surface | Remove from one; establish single source of truth |
| Outbound bridge to known consumer | Package reaches out to a specific consumer via bridge module | Invert: emit events, let consumer hook in |
| Feature disguised as lifecycle | Config field claims lifecycle control but only filters post-hoc | Remove the disguise; move the policy to the package that owns enforcement |
| Blunt instrument | Boolean kills an entire subsystem when granular control exists | Remove the blunt flag; use the granular system (e.g., per-tool deny vs. no-tools) |

## Prioritization framework

Score each finding on two axes:

1. **Impact** (1–5): How much does fixing this reduce coupling, improve testability, or reduce future churn?
2. **Risk** (1–5): How likely is the fix to introduce regressions?
   (Higher = riskier)

Priority = Impact × (6 − Risk)

| Priority | Action |
| --- | --- |
| ≥ 20 | Must-fix this phase |
| 12–19 | Should-fix this phase |
| 6–11 | Nice-to-have or next phase |
| ≤ 5 | Defer indefinitely |

## Grouping heuristics

- **One issue per extraction** — each "extract X from Y" is a single issue.
- **Dependency order** — if Step B depends on Step A's output, order them.
- **Independent tracks** — identify parallel tracks (e.g., "bag decomposition" vs. "complexity reduction") that can proceed without blocking each other.
- **Max 9 steps per phase** — beyond 9, split into two phases.
- **Test duplication gets its own step** — shared fixture extraction is a distinct concern from production code refactoring.

## Output format

The plan should produce:

1. **Updated health metrics** — table comparing before/after for the phase.
2. **Step list** — numbered steps, each with:
   - Title and issue reference
   - What smell it addresses
   - Specific files/functions targeted
   - Expected measurable outcome (LOC reduction, complexity drop, bag field reduction)
3. **Step dependency diagram** — Mermaid flowchart showing which steps unblock others.
4. **Tracks** — group steps into named parallel tracks.

## Lessons from prior phases

These are failure modes and corrections discovered empirically.

### Planning and analysis

- **Don't plan a single step that rewrites an entire large test file** — use lift-and-shift (introduce new alongside old, migrate incrementally, remove old last).
- **Start from index.ts outward** — the composition root reveals wiring overhead, coupling, and initialization hazards that file-by-file analysis misses.
- **Test setup is a production-design signal** — `fallow`'s syntactic metrics miss god objects, closure density, and DIP violations.
  When a unit needs module-level `vi.mock`, wide `as unknown as` casts, or a multi-field fixture, the production object is hard to construct — fix the object, not the test.
  The test is the symptom; the production object is the disease.
- **Testability friction is a boundary probe.**
  When moving toward the _correct_ architecture makes something _harder_ to test, suspect a domain boundary drawn through the middle of a class before you blame the architecture.
  The friction is information: it marks a seam where two domains with different owners, change-rates, or directions of dependency are fused.
  Surface the seam (extract the domain) and the test usually gets _easier_, not harder — a better design is more straightforward to test.
  Worked example (from another Pi package): pushing pi-subagents toward a tell-don't-ask, dependency-inverted target made three things harder to test — constructing a passive record, a metrics firehose, and shared `resultConsumed` state — and each dissolved into a distinct domain (lifecycle state, a metrics projection, result delivery) once surfaced.
  The limit: this is a heuristic, not a law.
  A residue of friction is essential, not structural — asynchronous observation (subscription teardown, event ordering) is genuinely harder to test than a synchronous pull no matter how well the boundaries are drawn, and Pi itself pays that cost.
  Suspect a buried boundary first; force a redraw onto the irreducible async residue and you invent a seam that isn't there.
- **Audit the architecture doc against the code** — a doc's own rationalization of a smell ("kept inline per the anti-procedure-splitting rule") is a claim to verify, not a fact to repeat.

### Structural preferences

- **Dissolve bags ≤ 4 fields into plain parameters** — the interface adds ceremony without clarity at that size.
- **Keep bags ≥ 5 fields but destructure in the signature** — eliminates `deps.` noise while keeping the grouped contract.
- **Push platform types (ExtensionContext, SDK types) to boundaries** — domain code should depend on domain interfaces, not SDK imports.
- **Observer > callback threading** — when 3+ layers pass callbacks, replace with subscribe-at-the-boundary.
- **Snapshot > live reference** — when mutable parent state is read at spawn time and never updated, freeze it into a data object.
- **Pure function > method on wide class** — if the logic doesn't need instance state, extract it.
- **Lifecycle object > method extraction** — when mutable `let` variables are shared across closures, the fix is an object that owns that state, not extracting methods that still close over the variables.
- **Behavior on domain object > orchestration in manager** — when a manager reaches into a data object 10+× to check status and perform transitions, the object is anemic; move the behavior to the object itself.
- **Events > outbound bridges** — when package A needs to notify package B, prefer emitting events that B listens for over A calling B directly via a bridge module.
  This keeps A closed for modification when new consumers (C, D, …) arrive.
- **Single source of truth for policy** — when two packages both enforce the same kind of restriction (tool filtering, access control), the duplication creates confusion about where to configure it.
  Remove the duplicate and direct users to the authoritative package.
