---
name: markdown-conventions
description: |
  Project markdown rules (one-sentence-per-line, compact tables, sequential numbering, fenced-code languages)
  enforced by rumdl. Load when writing or editing markdown — contains rules that differ from standard markdownlint defaults.
---

# Markdown Conventions

Load this skill when writing or editing markdown files.

## Formatting rules

The enforcer is `rumdl`, run via `pnpm run lint:md` (`rumdl check *.md docs/**/*.md`), as part of `pnpm run lint`, and as a `rumdl-fmt` pre-commit hook (managed by `prek`, configured in `prek.toml`).
There is no markdownlint binary in this repo.
Rules below are named by their markdownlint `MDxxx` IDs because `rumdl` implements the same rule family; use the IDs for reference, not the tool.

- Use one sentence per line (unbroken) for better diffs.
  Each sentence occupies exactly one line; never wrap a sentence across lines or place two sentences on the same line.
  This applies to all prose, including list-item continuations.
- When an issue number would begin a line outside a fenced code block, prefix it with `Issue` (e.g. `Issue #42`) to prevent `#N` from being misread as a Markdown heading.
- Always specify a language on fenced code blocks (e.g., ` ```typescript `, ` ```bash `, ` ```jsonc `, ` ```text `); use `text` for plain output.
- Use sequential numbering (`1.` `2.` `3.`) in ordered lists, restarting at `1.` under each new heading — markdownlint's MD029 rejects continued numbering across section boundaries.
- Do not use bold text (`**...**`) as a substitute for headings — use proper heading syntax; markdownlint's MD036 rejects emphasis used as headings.
- When embedding markdown that itself contains fenced code blocks, use a 4-backtick outer fence (` ````markdown `).
- Use compact table style with no cell padding — markdownlint's MD060 enforces consistent column style and is not auto-fixable.
  Example: `| Header | Header |` / `| --- | --- |` / `| cell | cell |` — spaces inside pipes, no padding variation.
- Separate adjacent blockquotes with an HTML comment (`<!-- -->`) to satisfy markdownlint's MD028.
- Author and append markdown with the `Write`/`Edit` tools, not shell heredocs (`cat <<EOF`) — heredocs don't interpolate `\uXXXX` escapes and make one-sentence-per-line slips easy, both of which trip markdownlint.
- In long-lived docs (`docs/plans/`), reference GitHub issues with reference-style links — `[#42]` in the body, `[#42]: https://github.com/gotgenes/pi-anthropic-auth/issues/42` at the end of the file.
  Bare `#42` auto-links on GitHub but not in other renderers.
  Every `[#N]:` definition must have a matching `[#N]` reference in the body (markdownlint MD053 rejects unused definitions).

## Documentation layout

Plans live under `docs/plans/`.
They currently use a plain `# Title` heading plus `## Goal` section rather than YAML frontmatter — follow the existing files (`minimal-anthropic-override.md`, `gap-analysis-and-next-steps.md`) for structure.
`README.md` and `AGENTS.md` do not use frontmatter.
Skill files under `.agents/skills/` do require YAML frontmatter — see the `frontmatter` skill for the schema.
