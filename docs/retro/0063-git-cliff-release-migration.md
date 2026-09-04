---
issue: 63
issue_title: "Releases are broken: pi-github-tools 5.0.0 removed the release-please PR tools"
---

# Retro: #63 — Releases are broken: pi-github-tools 5.0.0 removed the release-please PR tools

## Stage: Planning and implementation (2026-09-04)

### Session summary

Diagnosed a silent release breakage — `@gotgenes/pi-github-tools` 5.0.0 removed `release_pr_find`, `release_pr_merge`, and `release_watch`, which both ship prompts still called — and migrated this repository from release-please to a dispatched git-cliff release, ported from `pi-packages` and adapted to a single package.
Six commits landed: `cliff.toml`, `scripts/release/`, `.github/workflows/release.yml`, the retirement of the release-please jobs and config, the ship-prompt rewrite, and the `AGENTS.md` documentation.
CI is green on `7a25829`, PR [#58] is closed, and the first dispatch is deliberately deferred.

### Observations

The breakage was invisible from inside this repository.
Nothing here changed; a dependency pinned at `@latest` dropped three tools, and the only symptom was a release pull request quietly going unmerged.
`main` sat two commits past `v2.0.6` with npm still on 2.0.6 and no failure anywhere to notice.
A `@latest` pin on tooling that prompts call by name is a coupling with no compile-time check behind it.

Parity was measured before anything was deleted, which is what made the migration cheap to trust.
Regenerating the `v2.0.6` section with a spike `cliff.toml` reproduced release-please's five entries in the same order with the same links, so the section mapping was verified rather than asserted.
One rendering difference was found and accepted: release-please auto-linked a bare `#52` in a subject, while git-cliff links only the parenthesised `(#N)` form and appends `closes [#N]` from the body's issue-reference trailer.

The link parser bites its own hand.
The first `cliff.toml` commit message quoted an issue-reference trailer *as prose* while explaining that very rendering difference, and git-cliff dutifully attached a spurious `closes [#52]` to the entry.
It was caught by the rehearsal and fixed by rewording before the push.
Prose in a commit body is not inert — it is parsed.

Rehearsing `prepare-release.sh` against a throwaway clone pushing to a throwaway bare remote was worth more than reading it.
It exercised the version derivation, the `package.json` write, the changelog splice, the commit, the tag, and the push, and confirmed the release commit is correctly skipped from its own GitHub Release notes — which is the one thing the two `chore(release)`/`chore(main): release` skip parsers exist for and the one thing a dry read cannot show.

The behaviour change worth remembering is the exclusion set.
`release-please-config.json` declared no `exclude-paths`, so `v2.0.5` and `v2.0.6` shipped nothing but plans and retros.
`docs/plans/**` and `docs/retro/**` are now out of the release scope, and this session's own plan commit is the first to be dropped by it.

The first dispatch was deferred by operator choice.
`v2.0.7` would ship a byte-identical `src/` to `v2.0.6` — only tooling and docs are unreleased — so the pipeline's first real run will instead happen alongside a genuine fix (PRs [#61] and [#62]).
The residual risk is named rather than hidden: `prepare` is verified locally, but `publish` and `github-release` are OIDC- and token-bound and remain unproven until that run.
The npm Trusted Publisher has already been repointed from `ci.yml` to `release.yml`, so the gate that would have failed is closed.

[#58]: https://github.com/gotgenes/pi-anthropic-auth/pull/58
[#61]: https://github.com/gotgenes/pi-anthropic-auth/pull/61
[#62]: https://github.com/gotgenes/pi-anthropic-auth/pull/62
