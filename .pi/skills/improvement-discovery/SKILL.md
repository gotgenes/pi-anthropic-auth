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
Lead with the cause hypothesis, not the tool: fallow finds symptoms by construction (it is syntactic), so running it first frames the whole analysis around symptoms.

### 1. Read the architecture document and form a cause hypothesis

Load `docs/architecture.md` for the current domain model, health metrics table, and dependency bag inventory.
Check which bags/hotspots have already been addressed vs. remain open.
Before touching any tool, write down a **cause hypothesis** — the first-principles structural problem the next phase should dissolve (structural fusion, a coupling/boundary flaw, a dead subsystem).
The later steps corroborate, refine, or refute it.
The prior phase's plan carries candidates beyond any explicit "leading candidate" line: a ⚠️ metric miss in its health-metrics table and any in-step "deferred" remark are implicit candidates, and each metric miss gets an explicit disposition in the new roadmap (re-target / accept with rationale / supersede) — never a silent drop.
A cause-level finding must trace to a named target concept in the architecture doc's first-principles section (the pattern, from another Pi package: pi-permission-system's "The authority model").
When no such section exists, writing one — naming the organizing concept and recording resolved design directions — is itself a phase deliverable, not an emergent artifact: settled-in-writing directions are what make the next phase's plan cheap.

### 2. Sweep open issues

Run `gh issue list --state open` and cross-check it against the architecture doc's claims about which issues remain open — doc/tracker drift otherwise causes re-planning filed work or missing a parked candidate.
An open issue that already names a cause-level finding is a pre-discovered candidate — adopt it as a phase step under its existing number rather than re-deriving it.
Track repeat deferrals: an issue swept as out-of-scope across multiple consecutive phases gets an explicit decision this phase — schedule it into the phase, or recommend closing it as not-planned — never a silent re-defer.
Structural phases must not starve feature and bug work indefinitely.

### 3. Run fallow for corroboration and baseline

Fallow **corroborates** the cause hypothesis and supplies outcome baselines — it does not set the agenda.
The `fallow:*` scripts live in this repo's own `package.json`.
Run the analysis commands directly:

```bash
pnpm fallow health --score --hotspots --targets 2>&1 || true
pnpm fallow dead-code 2>&1 || true
pnpm fallow dupes 2>&1 || true
```

Capture: health score, dead exports, production duplication (`fallow dupes` excludes test files by default), hotspots, refactoring targets.

Fallow is blind to repeated discriminators — scattered one-line conditionals never form a token-run clone — so sweep for them alongside it:

```bash
grep -rhoE '[A-Za-z_.]+ [!=]== "[a-z0-9_-]+"' src --include="*.ts" | sort | uniq -c | sort -rn | awk '$1 >= 3'
```

Read each family with 3+ production sites and judge it against the Category C "Repeated discriminator" row; a single `never`-exhaustive switch at one dispatch site, per-variant presentation dispatch, and validation-edge type guards are idiomatic, not findings.
The phase spine must not be fallow-sourced-only: at least the primary cause must trace to the Step 1 reading, with fallow signals cited as symptoms of that cause, not as a step's motivation.

### 4. Start from the entry point and work inward

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

Scale the trace to the package's maturity: on a package with an extensive phase history, trace selectively (hypothesis targets, churn hotspots, files the issue sweep implicates) and spot-verify the architecture doc's claims — an exhaustive per-import read re-derives what the doc already records.

### 5. Identify smells using the taxonomy below

### 6. Prioritize using the severity framework

### 7. Group into issue-sized steps with a dependency graph

Nine steps is a ceiling, not a target — a phase may have one step, or none.
If discovery surfaced no cause-level finding (Category A–C) and the candidates are polish-only (Category B unit-size, D, E, G symptoms), do not manufacture a full phase — but split the "polish" verdict before defaulting to defer:

- **Scattered trivia** (isolated findings across cold, low-churn files) → **defer**.
  A phase step is an _area_, not a scattered list; a rename here and a split there is boy-scout-rule work for the implementation prompts (`/tdd-plan`, `/build-plan` via the `tidy-first` skill), not a planned phase.
- **Concentrated quality/test debt in a hot area** (3+ findings clustered in one churn hotspot or one oversized test file) → a legitimate **craftsmanship lean phase**, whose spine is "pay down concentrated debt in `<area>`."
  This is Beck/Metz craftsmanship, not filler: a hot file whose test-design or naming debt taxes every change earns a focused phase the same way a coupling flaw does.
  Present it as a first-class `ask_user` option alongside defer.

Classify each cluster explicitly as **concentrated** or **scattered** so this gate is evidence-based, not a guess.
When the architecture doc's declared target is complete _and_ only scattered trivia remains, the fired gate is the improvement process reaching its intended terminal state — report it as success, not as a failure to find work.
The next phase's trigger is then a new cause (a feature's structural needs, a bug cluster, a newly named concept, or concentrated craftsmanship debt), not the calendar.
Before committing any step whose outcome depends on the SDK/type surface, feasibility-probe it — confirm the named type or export exists in the real surface before promising the outcome.

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
| Repeated discriminator | Same condition at 3+ sites across modules (grep sweep; fallow is blind to it) | Decide once at a boundary: strategy/flavor object, predicate on the owning object, or behavior on the discriminated value |

### Category D: Testability

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| `vi.mock()` at module level | Module-level mocking in test files | Inject dependency via IO interface |
| `as any` casts in tests | Constructing wide mocks for narrow usage | Narrow the interface the code depends on |
| Test duplication (high) | Read test files directly (`fallow dupes` excludes `**/*.test.*` by default) | Extract shared fixtures or test factories (never wrap the SUT act) |
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

### Category G: Test design (Test-Driven Design)

Category D is about _production_ testability (can the object be constructed and injected).
Category G is about the _test code itself_ as a first-class design artifact — the London/Chicago-school premise that a test's shape is design feedback, not a chore.
`fallow` is blind to all of it (a giant test body is just a large function to it); reading — not grepping — the largest test files is the detector.

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Giant test body | One `it`/`test` arrow spanning 100s of lines | Split into behavior-named cases; one behavior per test |
| Test-per-method | `describe("resolve")` asserting mechanics, not `it("denies …")` | Rename around behavior; the contract, not the shape |
| Over-mocking | A test stubs 10+ methods to exercise one, or mocks a real-constructible collaborator | Narrow the production interface (ISP); construct the real object |
| Assert-on-implementation | `mock.calls[0]![0]`, private-state reach-through, incidental order | `toHaveBeenCalledWith`; assert on the observable outcome |
| Unclear arrange/act/assert | Setup, exercise, verification interleaved | One clear AAA per test; extract setup to a fixture |
| Missing behavior coverage | A public behavior untested, or only the happy path | Add edge/boundary/error cases where the risk lives |

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

> **Fallow-CRAP gotcha.**
> Fallow estimates CRAP from static reference tracing when no coverage file is supplied, and the estimate is unreliable — a module with a real test file can report a CRAP in the 70s.
> Before citing a CRAP score as a step's motivation, either run `fallow health --coverage <file>` with a real coverage file or confirm whether a test file exists for the module.
> Treat estimated CRAP as a hint, not a finding — never let a step earn its place on an estimated score.

## Grouping heuristics

- **One issue per extraction** — each "extract X from Y" is a single issue.
- **Dependency order** — if Step B depends on Step A's output, order them.
- **Independent tracks** — identify parallel tracks (e.g., "bag decomposition" vs. "complexity reduction") that can proceed without blocking each other.
- **Max 9 steps per phase** — beyond 9, split into two phases.
- **Test duplication gets its own step** — shared fixture extraction is a distinct concern from production code refactoring.
- **Group steps into release batches** — a release batch is a coherent set of steps meant to ship together (e.g. a lift-and-shift spine where intermediate steps leave the package in a transitional state).
  A step that can land and release on its own is independently releasable.
  This is the source of truth `/plan-issue` reads to recommend a release decision and `/ship-issue` confirms — so it must be grep-able, not prose (see Output format).

## Output format

The plan should produce:

1. **Updated health metrics** — table comparing before/after for the phase.
   Prefer cause-level metrics recomputable by a single command (a `grep -c`, `wc -l`, or fallow field — e.g. `canConfirm` occurrences in `src/`, role-interface count) and record the recompute command with the metric, so a later phase review can verify delivered vs. predicted deterministically.
   Verify the command against the _predicted_ end state, not only today's tree — a command counting the mechanism being replaced reads 0, not the target, once the replacement lands.
   The fallow health score alone is a poor phase metric — it is blind to the type-level wins (a bug class made unrepresentable) that cause-driven phases produce.
2. **Step list** — numbered steps, each with:
   - Title and issue reference
   - **Cause** — the first-principles structural cause the step dissolves (name it explicitly), with any fallow signal cited as the _symptom_ of that cause, not the motivation.
     A step whose only stated justification is a fallow finding is a symptom-driven step; trace it to a cause or drop it.
   - What smell it addresses (Category A–G)
   - Specific files/functions targeted
   - Expected measurable outcome (LOC reduction, complexity drop, bag field reduction)
   - **Impact / Risk / Priority** — the per-step scores from the prioritization framework (`Priority = Impact × (6 − Risk)`), published on the step so the ranking is auditable in the committed roadmap (and at `/plan-issue` time), not left in the session transcript.
3. **Step dependency diagram** — Mermaid flowchart showing which steps unblock others.
4. **Tracks** — group steps into named parallel tracks.
5. **Release batches** — make release coordination grep-able, in two artifacts:
   - A per-step `Release:` tag on its own line in each step (alongside `Smell:`/`Outcome:`), exactly one of:
     - `Release: independent` — the step ships on its own; no coordination.
     - `Release: batch "<batch-name>"` — the step is a member of the named batch and is meant to ship together with the rest of that batch.
   - A `Release batches` subsection (after the parallel tracks) naming each batch and listing its member steps in dependency order; the **last listed member is the batch tail** — the step whose landing completes the batch.
     List independently releasable steps separately.

     ```markdown
     ### Release batches

     - **Batch "activity-disentanglement":** Steps 1, 2, 3 (ship together; tail = Step 3).
     - Independently releasable: Steps 4, 5.
     ```

   Agents locate the data by grepping for the `Release:` line (per step) and the `Release batches` heading (per phase) — never by parsing prose.
   A step with no `Release:` tag defaults to independently releasable.
   A phase may mix commit types: a `fix:` (or unhidden `docs:`) step is the phase's release vehicle, while `refactor:`/`test:` steps are hidden changelog types that cut no release on their own — name the release vehicle in the `Release batches` subsection instead of assuming a refactor-only phase.

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
- **Dispatch once > re-derived discriminator** — when the same semantic condition (`platform === "win32"`, `status === "running" || status === "queued"`) is evaluated at 3+ sites, capture the decision at a boundary and hand consumers its product; severity rises when the sites must agree (a re-derived case-fold that diverges is a silent bug) and when the branching is silent `===` rather than a compiler-enforced exhaustive switch.
- **Pass the resolved capability, not the raw discriminator** — when every consumer of a parameter opens with the same mapping (`platform === "win32" ? winPath : posixPath`), thread the mapping's product (the impl, the flavor object, the options literal) instead of the raw string.
- **Events > outbound bridges** — when package A needs to notify package B, prefer emitting events that B listens for over A calling B directly via a bridge module.
  This keeps A closed for modification when new consumers (C, D, …) arrive.
- **Single source of truth for policy** — when two packages both enforce the same kind of restriction (tool filtering, access control), the duplication creates confusion about where to configure it.
  Remove the duplicate and direct users to the authoritative package.
