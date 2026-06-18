---
name: mermaid
description: |
  Authoring and reviewing Mermaid diagrams — pitfall categories (semicolons, angle-bracket tokens, quoted headings),
  renderer verification, and state-machine disambiguation with note blocks.
  Load when authoring or reviewing Mermaid diagrams in any doc type.
---

# Mermaid

Load this skill before authoring or reviewing Mermaid diagrams in any doc type (plans, retros, architecture docs, READMEs).

## Pitfalls

### Backslash-n in node labels

`\n` inside a quoted node label is rendered as a literal backslash followed by the letter n — not a line break.
Use `<br/>` for line breaks in node labels.

```text
WRONG:  A["Step 1\nDo the thing"]
RIGHT:  A["Step 1<br/>Do the thing"]
```

### Semicolons

Mermaid uses `;` as a statement terminator.
A semicolon inside an arrow message, `Note over` block, or `stateDiagram-v2` transition label breaks rendering silently in vivify and GitHub, even though `mmdc` may accept it.

```text
WRONG:  A --> B : pop (depth > 0; return to parent layer)
RIGHT:  A --> B : pop (depth > 0 — return to parent layer)

WRONG:  Note over A,B: Step 1; Step 2
RIGHT:  Note over A,B: Step 1, then Step 2
```

### Angle-bracket tokens

Raw `<word>` tokens in arrow messages and participant aliases are HTML-parsed by the markdown processor before Mermaid sees them.
`mmdc` accepts them; vivify and GitHub do not.

```text
WRONG:  participant <id>
RIGHT:  participant id

WRONG:  A --> B : <sessionID>-<slug>.md
RIGHT:  A --> B : sessionID-slug.md   (or use curly braces: {sessionID}-{slug}.md)

WRONG:  A --> B : send `payload` with > marker
RIGHT:  A --> B : send payload with → marker
```

### Quoted headings

`"## Heading"` inside a node label is rejected by some renderers.

```text
WRONG:  A["## Overview"]
RIGHT:  A["Overview"]
```

## Verify in a real renderer

Structural validators (`rumdl`) check Markdown syntax but not Mermaid semantics.
`mmdc` catches most parser errors but not angle-bracket cases (the markdown pre-parse happens before Mermaid sees the input).
Both checks must pass before a diagram is considered done:

1. Run `mmdc -i <file>` (or pipe the fenced block) — catches semicolons and most syntax errors.
2. Confirm rendered output in vivify (`:MarkdownPreview`) or GitHub preview — catches angle-bracket cases that `mmdc` misses.

## State machines

When a state machine has a layer-stack or other dimension beyond the rendered states, accompany self-edges with a `note right of <state>` block to disambiguate the operation.

```mermaid
stateDiagram-v2
    REFACTOR --> REFACTOR : commit
    note right of REFACTOR
        commit: record refactoring commit,
        re-dispatch stays in REFACTOR
    end note
```

Without the note, a self-edge looks like the state doesn't change at all — the operation and its effect are invisible.
