---
name: improvement-discovery
description: |
  Heuristics and process for discovering structural improvements in this package.
  Load when planning a new improvement round — contains the smell taxonomy,
  analysis workflow, and prioritization framework. Tool-agnostic; this repo has
  no fallow, so analysis relies on grep/read/wc and the test suite.
---

# Improvement Discovery

Use this skill when planning the next round of structural improvements.
It codifies the smell categories and analysis workflow that have proven effective across refactoring rounds.

This repo does **not** have `fallow` installed.
Where the original workflow ran fallow, substitute manual analysis: `grep`, `read`, `wc -l`, the test suite, `pnpm run check`, and `pnpm run lint`.

## Analysis workflow

Follow this order — each step builds context for the next.

### 1. Survey size and surface manually

Since there is no static-analysis tool, gather the same signals by hand:

```bash
wc -l src/*.ts                 # oversized modules / god files
grep -rn "export " src/        # export surface per module
grep -rn "as unknown as\|as any" src test   # cast smells (often DIP/ISP signals)
```

Capture: largest modules, export width per module, cast hotspots, and any helper that has grown its own implicit responsibilities.

### 2. Read the plans

Load `docs/plans/` (`minimal-anthropic-override.md`, `gap-analysis-and-next-steps.md`) for the current design intent, known gaps, and what has already been addressed vs. remains open.
Cross-check `AGENTS.md` "Architecture" and "Upstream Findings" sections.

### 3. Start from the entry point and work inward

Begin at `src/index.ts` (the extension composition root) and trace outward into `src/anthropic-oauth.ts`, `src/request-shaping.ts`, and `src/system-prompt-shaping.ts`.
This "outside-in" traversal reveals:

- **Wiring overhead** — boilerplate between the Pi extension API and compatibility logic.
- **Coupling at the boundary** — which Pi SDK types leak into helper modules that should stay SDK-independent.
- **Initialization ordering** — fragile temporal coupling between registration and hooks.

For each module, note size (lines), number and width of exports, fan-out, and whether it is a pure function or an SDK consumer.

### 4. Identify smells using the taxonomy below

### 5. Prioritize using the severity framework

### 6. Group into issue-sized steps with a dependency graph

## Smell taxonomy

Ordered from most impactful (structural) to least (cosmetic).

### Category A: Dead or redundant code

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Unused exports | No import chain reaches them | Remove |
| Unused files | No import chain reaches them | Delete |
| Production duplication | Shared logic copy-pasted between helpers | Extract shared module |

### Category B: Oversized structures

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| God file (300+ lines) | `wc -l` + mixed responsibilities | Extract concerns into focused modules |
| God function | Deeply nested branches | Extract sub-functions per branch |
| God interface (10+ fields) | Dependency bag mixing concerns | Split by cohesion; nest related groups |

### Category C: Coupling and boundaries

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Mutable closure state | `let` shared across closures/callbacks | Introduce a lifecycle object that owns the state |
| Relay-only dependencies | A function stores fields it only passes along | Move the fields to the consumer |
| Platform type threading | Pi SDK types deep in pure helpers | Push to the boundary; capture a value object |
| Wide parameter lists | 5+ params, some always travel together | Group into value objects |
| Provider-gating in the wrong hook | OAuth logic gated on absent provider metadata | Gate on payload shape (`isOAuthAnthropicPayload`) |

### Category D: Testability

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| `as unknown as` casts in tests | Constructing wide mocks for narrow usage | Narrow the interface the code depends on |
| Untestable pure logic | Logic embedded in an SDK consumer | Extract as a pure function into a helper |
| Fixture complexity | Inline fixture needs its own helper | Narrow the production interface (ISP) |

### Category E: Naming and organization

| Signal | Evidence | Typical fix |
| --- | --- | --- |
| Unclear module boundaries | Same concept lives in multiple files | Co-locate; single responsibility |
| `deps.` prefix noise | Every access is `deps.foo` | Destructure in signature or dissolve small bags (≤4 fields) |

## Prioritization framework

Score each finding on two axes:

1. **Impact** (1–5): How much does fixing this reduce coupling, improve testability, or reduce future churn?
2. **Risk** (1–5): How likely is the fix to introduce regressions? (Higher = riskier.)

Priority = Impact × (6 − Risk)

| Priority | Action |
| --- | --- |
| ≥ 20 | Must-fix this round |
| 12–19 | Should-fix this round |
| 6–11 | Nice-to-have or next round |
| ≤ 5 | Defer indefinitely |

## Grouping heuristics

- **One issue per extraction** — each "extract X from Y" is a single issue.
- **Dependency order** — if Step B depends on Step A's output, order them.
- **Test duplication gets its own step** — shared fixture extraction is a distinct concern from production refactoring.

## Lessons

- **Don't rewrite an entire large test file in one step** — use lift-and-shift (introduce new alongside old, migrate incrementally, remove old last).
- **Dissolve bags ≤ 4 fields into plain parameters** — the interface adds ceremony without clarity at that size.
- **Keep bags ≥ 5 fields but destructure in the signature** — eliminates `deps.` noise while keeping the grouped contract.
- **Push platform types (Pi SDK types) to boundaries** — compatibility helpers should depend on minimal local interfaces and inline payload fixtures, not SDK imports.
- **Pure function > method on a wide class** — if the logic doesn't need instance state, extract it.
- **Test setup is a production-design signal** — when a unit needs wide `as unknown as` casts or an elaborate fixture, the production object is hard to construct. The test is the symptom; the production object is the disease.
- **Keep the override thin** — prefer the smallest Pi integration seam that works, and reuse upstream behavior from `@earendil-works/pi-ai/oauth` over copying it locally.
