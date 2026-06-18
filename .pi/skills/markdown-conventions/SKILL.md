---
name: markdown-conventions
description: |
  Project-specific markdown rules (one-sentence-per-line, compact tables, sequential numbering)
  and YAML frontmatter schema for plans/retros.
  Load when writing or editing markdown — contains rules that differ from standard markdownlint defaults.
---

# Markdown Conventions

Load this skill when writing or editing markdown files.

## Formatting rules

The enforcer is `rumdl` (runs as part of `pnpm run lint`, available standalone via `pnpm run lint:md`; also the pre-commit `rumdl fmt` hook).
Rules below are named by their markdownlint `MDxxx` IDs because `rumdl` implements the same rule family; use the IDs for reference, not the tool.

### Lines and sentences

- Use one sentence per line (unbroken) for better diffs.
  Each sentence occupies exactly one line; never wrap a sentence across lines or place two sentences on the same line.
  This applies to all prose, including list-item continuations.
- Author and append markdown with the `Write`/`Edit` tools, not shell heredocs (`cat <<EOF`) — heredocs don't interpolate `\uXXXX` escapes and make one-sentence-per-line slips easy, both of which trip the markdown linter.

### Code fences

- Always specify a language on fenced code blocks (e.g., ` ```typescript `, ` ```bash `, ` ```jsonc `, ` ```text `); use `text` for plain output.
- When embedding markdown that itself contains fenced code blocks, use a 4-backtick outer fence (` ````markdown `).

### Lists, headings, and emphasis

- Use sequential numbering (`1.` `2.` `3.`) in ordered lists, restarting at `1.` under each new heading — markdownlint's MD029 rejects continued numbering across section boundaries.
- Do not use bold text (`**...**`) as a substitute for headings — use proper heading syntax; markdownlint's MD036 rejects emphasis used as headings.

### Tables and blockquotes

- Use compact table style with no cell padding — markdownlint's MD060 enforces consistent column style and is not auto-fixable.
  Example: `| Header | Header |` / `| --- | --- |` / `| cell | cell |` — spaces inside pipes, no padding variation.
- Separate adjacent blockquotes with an HTML comment (`<!-- -->`) to satisfy markdownlint's MD028.

### Issue references

- When an issue number would begin a line outside a fenced code block, prefix it with `Issue` (e.g. `Issue #42`) to prevent `#N` from being misread as a Markdown heading.
- In long-lived docs (`docs/architecture/`, `docs/plans/`), reference GitHub issues with reference-style links — `[#42]` in the body, `[#42]: https://github.com/gotgenes/pi-anthropic-auth/issues/42` at the end of the file.
  Bare `#42` auto-links on GitHub but not in other renderers.
  Every `[#N]:` definition must have a matching `[#N]` reference in the body (markdownlint MD053 rejects unused definitions).
  Do not add a definition for the doc's own issue number — it lives in frontmatter, not as a body link.
  Link reference definitions are file-scoped: when appending a stage entry to a retro that already defines `[#N]:`, reference it without re-adding the definition — a duplicate trips MD053.

## Documentation frontmatter

Docs under `docs/plans/` and `docs/retro/` use YAML frontmatter for structured metadata.
Plans and retros live in `docs/plans/` and `docs/retro/`.
GitHub renders it as a table at the top of the file.

Schema (both fields are strings/numbers — quote any title containing backticks or colons):

```yaml
---
issue: 14 # optional: omit for plans that predate issue tracking
issue_title: "Short descriptive title" # required
---
```

- `issue` stores the number only, never a URL.
- Do not duplicate frontmatter fields as inline metadata in the body (e.g., `Issue #N` in the H1 is fine; a separate `**Issue:** #N` line is not).
- Other doc types (`README.md`) do not use frontmatter.
