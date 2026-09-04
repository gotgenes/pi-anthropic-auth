---
issue: 63
issue_title: "Releases are broken: pi-github-tools 5.0.0 removed the release-please PR tools"
---

# Migrate releases from release-please to a dispatched git-cliff workflow

## Release Recommendation

**Release:** ship independently

`docs/architecture.md` carries no `Release:` annotations and no roadmap step references this issue.
The change is also self-validating: the first dispatched release *is* the verification that the migration works, so batching it behind another issue would only delay the evidence.

## Problem Statement

`.pi/settings.json` installs `npm:@gotgenes/pi-github-tools@latest`, and that package is now at 5.0.0.
Its 5.0.0 release removed `release_pr_find`, `release_pr_merge`, and `release_watch` as a deliberate breaking change, because `pi-packages` retired release-please in favour of a dispatched git-cliff release (`gotgenes/pi-packages`, `docs/decisions/0002-git-cliff-release-automation.md`).

This repository did not migrate with it.
It still releases through release-please, and both ship prompts still call the three removed tools — `.pi/prompts/ship-issue.md` step 6 and `.pi/prompts/ship-no-issue.md` step 5.
The server side still runs, so nothing fails until a ship session reaches the release step and finds no tool to call.

That already happened: PR [#58] (`chore(main): release 2.0.7`) has been sitting open and unmerged, `main` is two commits past `v2.0.6`, and npm is still on 2.0.6.

## Goals

- Release this package with git-cliff from a `workflow_dispatch` workflow, so the ship prompts need no release-PR tooling.
- Reproduce the current changelog shape exactly, so the migration does not quietly change which commits users see.
- Stop plan- and retro-only commits from cutting releases.
- Leave the repository with no release-please configuration, workflow job, or prose reference.

This change is **not breaking** for consumers of the published package.
It changes only how versions are cut; the package contents, name, and versioning scheme are unchanged.

## Non-Goals

- Changing the version scheme.
  Tags stay `vX.Y.Z` and the next release is a patch off `v2.0.6`.
- Adopting `pi-packages`' multi-package machinery.
  This repo has one package, so the per-package tag patterns and path scoping in that repo's `scripts/release/lib.sh` collapse to a single tag pattern plus the docs exclusions.
- Pinning `@gotgenes/pi-github-tools` to a version range in `.pi/settings.json`.
  The `@latest` pin is what surfaced this breakage promptly; the fix is to stop depending on the removed tools, not to freeze the dependency.
- Adding a shell linter.
  `pi-packages` runs none for its own release scripts, and adding one here is a separate tooling decision.
- Touching `src/` or `test/`.
  No vitest suite is affected.

## Background

### What the repository does today

1. `.github/workflows/ci.yml` runs `check`, then a `release-please` job on `main`, then a `publish` job gated on `release_created`.
2. `release-please-config.json` declares one package at `.`, `include-v-in-tag: true`, `include-component-in-tag: false`, and an eleven-entry `changelog-sections` array.
3. `.release-please-manifest.json` records `{".": "2.0.6"}`.
4. npm Trusted Publishing is configured against `ci.yml`, because that is where `publish` lives.

### What this repo's shape changes relative to `pi-packages`

1. Tags are plain `vX.Y.Z`, so the tag pattern is a constant (`^v[0-9]`) and can live in `cliff.toml` rather than being passed per package on the command line.
2. `main` has no branch protection (`gh api repos/gotgenes/pi-anthropic-auth/branches/main/protection` returns 404) and the repository has no secrets (`gh secret list` is empty).
   The release commit can therefore be pushed by the default `GITHUB_TOKEN` with `contents: write`; `pi-packages` needs a PAT because its `main` is protected.
3. There is only one package, so `prepare-release.sh` takes no package list.
   The dispatch input reduces to the optional SHA guard.
4. `docs/architecture.md`, `docs/comparison-to-similar-projects.md`, and the two `builtin-transport-seam-*.md` files are shipped reference docs at the `docs/` root, not internal working notes.
   Only `docs/plans/**` and `docs/retro/**` are excluded from the release scope.

### Constraints from `AGENTS.md`

- Conventional Commits for every commit.
- One sentence per line in markdown; `rumdl` enforces it over `*.md` and `docs/**/*.md`, which includes `CHANGELOG.md`.
- The `Release:` marker convention in plans is read by `/ship-issue`, so the rewritten prompt must keep reading it.

## Design Overview

### The mechanism

git-cliff derives the next version and the changelog section from local tags and history:

```bash
git-cliff --exclude-path 'CHANGELOG.md' \
  --exclude-path 'docs/plans/**' --exclude-path 'docs/retro/**' \
  --bumped-version
```

A `workflow_dispatch` workflow runs three jobs: `prepare` (version, changelog, commit, tag, push), `publish` (npm), and `github-release` (release notes).
Releases become an explicit act rather than a standing pull request, which is the same trade `pi-packages` accepted: the release-PR review gate is exchanged for a single run, offset by `next-version.sh` answering "what would release?" locally and offline.

### Parity, measured

The rendering was verified before writing anything, with a spike config against real history.
Regenerating the `v2.0.6` section with no docs exclusions reproduces the five entries release-please wrote, in the same order, with the same commit and issue links.

One rendering difference is accepted: release-please auto-linked a bare `#52` inside a commit subject, while git-cliff links only the parenthesised `(#N)` form and appends `closes [#52]` from the body's `Refs #52` trailer.
`pi-packages` accepted the same difference, and a bare `#52` in a `CHANGELOG.md` does not auto-link on GitHub anyway.

Adding the docs exclusions drops the three plan/retro-only commits from that section, leaving two — which is the intended behaviour change, not a regression.

The current bump was checked the same way: `--bumped-version` prints `v2.0.7` both with and without the exclusions, matching the version release-please proposed in PR [#58].

### Why the changelog is spliced, not regenerated

`prepare-release.sh` renders only the new section and inserts it below the header, exactly as `pi-packages` does.
A full regeneration would rewrite `CHANGELOG.md` from history, and this file's older entries were written under a different exclusion set — regenerating silently rewrites released history.
The insertion point is the first line matching `^(## |<!-- )`, so the era marker added in step 4 also acts as the floor: new sections always land above it.

### Script split

The read-only derivation is split from the half that pushes, following the `AGENTS.md` rule `pi-packages` records for the same pair:

1. `next-version.sh` only prints, and is safe to run anywhere.
2. `prepare-release.sh` commits and pushes, and refuses to run unless `CI` is set or `ALLOW_LOCAL_PUSH=1` is passed deliberately.

## Module-Level Changes

### `cliff.toml` (new)

Adapted from `pi-packages`' file, with the monorepo scoping removed:

1. `[git] tag_pattern = "^v[0-9]"` — a constant here, so it belongs in config rather than on the command line.
2. `commit_parsers` reproduce `release-please-config.json`'s `changelog-sections` one entry for one entry: `feat`, `fix`, `perf`, `revert`, `docs`, and `chore` visible; `style`, `refactor`, `test`, `build`, and `ci` skipped.
   `chore` is visible because it was `hidden: false` under release-please.
3. Two release-commit skips ahead of the general `chore` rule: `^chore\(release\)` for the commits this mechanism will write, and `^chore\(main\): release` for the ones release-please already wrote.
   Both are load-bearing for `create-github-release.sh`, which runs `--latest` after the release commit exists.
4. `link_parsers` lifts `Refs #N` into `commit.links`, reproducing release-please's `closes [#N]` suffix.
5. `commit_preprocessors` rewrites a parenthesised `(#N)` subject reference into a markdown link.
6. Body template heading: `{{ version | trim_start_matches(pat="v") }}` for the bare version, with the compare link built from the full tags.
7. `<REPO>` postprocessor pointing at `https://github.com/gotgenes/pi-anthropic-auth`.

### `scripts/release/lib.sh` (new)

Sourced helpers: `cliff_args` (populates a `CLIFF_ARGS` array with the exclusions), `latest_tag`, and `package_json_version`.
`CLIFF_EXCLUDED_PATHS` is an array, not a space-separated string — `zsh` does not word-split an unquoted parameter, so a string collapses into one bogus glob when the file is sourced interactively.

### `scripts/release/next-version.sh` (new)

Prints `vX.Y.Z` when there is something to release and nothing when there is not; diagnostics go to stderr.
Exit status is 0 either way, so callers test the output.
Refuses when no `v*` tag exists rather than inventing a first version.

### `scripts/release/prepare-release.sh` (new)

1. Refuses to run outside CI without `ALLOW_LOCAL_PUSH=1`.
2. Honours the optional `EXPECTED_SHA` guard, aborting if `main` moved.
3. Derives the version before writing anything, and fails if the tag already exists.
4. Writes `package.json` `version` with `jq`, splices the rendered section into `CHANGELOG.md`, commits as `chore(release): <version>`, tags `vX.Y.Z`, and pushes commit and tag together.
5. Emits `tag` and `sha` to `$GITHUB_OUTPUT`.

### `scripts/release/publish-released.sh` (new)

Fetches tags, requires a `v*` tag at `HEAD`, and runs `pnpm publish --access public --no-git-checks --provenance`.
Refusing when `HEAD` carries no tag keeps a stray dispatch from publishing an untagged tree.

### `scripts/release/create-github-release.sh` (new)

Renders notes with `git-cliff --latest --strip header` and creates the GitHub Release for the tag at `HEAD`, skipping if it already exists.

### `.github/workflows/release.yml` (new)

`workflow_dispatch` only, one optional `sha` input, `concurrency: release`.
Three jobs mirroring `pi-packages`: `prepare` (`contents: write`, `taiki-e/install-action@git-cliff`), `publish` (`id-token: write`, checked out at `needs.prepare.outputs.sha` rather than `main`), and `github-release` (`contents: write`).
`prepare` checks out with the default `GITHUB_TOKEN` and `fetch-depth: 0`; a shallow clone would silently produce wrong versions.

### `.github/workflows/ci.yml`

Remove the `release-please` and `publish` jobs entirely, leaving `check`.
The `fetch-depth: 0` on the `check` checkout stays — `fallow audit --base origin/<base>` needs it.

### Deleted files

`release-please-config.json` and `.release-please-manifest.json`.

### `CHANGELOG.md`

Add an era marker directly below the `# Changelog` header, above the `## [2.0.6]` entry, recording that everything beneath it was generated by release-please.
This doubles as the splice floor described in Design Overview.

### `.pi/prompts/ship-issue.md`

1. Frontmatter `description`: "merge the release-please PR" becomes "dispatch the release".
2. Step 4b: drop the paragraph about `release-please-config.json`'s `changelog-sections` and `release_pr_find`; replace it with `./scripts/release/next-version.sh` as the authority on whether anything releases.
3. Step 5: the sentence crediting release-please for omitting `refactor:` commits stays true in substance but must name `cliff.toml`'s parsers instead.
4. Step 6: replace the five-item `release_pr_find` / `release_pr_merge` / `release_watch` sequence with `next-version.sh`, then `gh workflow run release.yml -f sha="$(git rev-parse HEAD)"`.
5. Step 6b: verify with `ci_find`/`ci_watch` against workflow `release`, including the "`prepare` failing is re-dispatchable, a later job failing is not" distinction, then `git pull --ff-only`.
6. Constraints: drop the two release-please merge constraints, add the never-re-dispatch-after-`prepare` constraint.

### `.pi/prompts/ship-no-issue.md`

The same treatment for its step 5 and constraints.
It has no plan to name the release, so it keeps its "show the operator what would release and ask" step, now driven by `next-version.sh`.

### `.pi/prompts/tdd-plan.md`, `.pi/prompts/build-plan.md`, `.pi/prompts/retro.md`

Each says "Do not edit `CHANGELOG.md` — release-please owns it."
Reword to name the release workflow as the owner; the instruction itself is unchanged.

### `AGENTS.md`

1. Lines 134–135 (Project Prompts list): `ship-issue` and `ship-no-issue` descriptions.
2. Lines 210–226 (Git Workflow): replace the five-step "watch CI, wait for release-please, merge the PR" sequence and the `gh pr merge --rebase` snippet with the dispatch command, the `next-version.sh` preflight, and the failure-recovery rule.
   The release-batching paragraph stays — the `Release:` marker convention is unchanged — but its final clause becomes "dispatching the release now" rather than "releasing now" via a PR merge.
3. Add a short `### Releases` subsection under Development covering: releases are dispatched and never automatic; the trusted-publisher requirement; and a link to `pi-packages`' decision record for the rationale.

`README.md` was grepped for `release` with no hits.
`docs/architecture.md` will be grepped in step 6; the prompts and `AGENTS.md` are the only known references.

## Test Impact Analysis

No vitest suite is affected — `src/` and `test/` are untouched, and the 60-test baseline should be unchanged at every step.

The verification this change needs is behavioural rather than unit-level, and is planned as gates instead of tests:

1. Rendering parity against real history, already measured during planning (Design Overview).
2. A full rehearsal of `prepare-release.sh` in a throwaway clone pushing to a throwaway bare remote, so the commit, splice, tag, and push are exercised without touching `origin`.
3. The first real dispatch, which exercises `publish` and `github-release` — the two jobs a local rehearsal cannot cover, because both are OIDC- or token-bound.

## Invariants at Risk

1. **The changelog's shape does not change across the migration.**
   Measured: the `v2.0.6` section regenerates identically modulo the accepted bare-`#N` difference.
   Re-checked in step 1 before anything is deleted.
2. **Released history is never rewritten.**
   Guarded by splicing rather than regenerating, and by the era marker acting as the insertion floor.
   Verified in the step 2 rehearsal by diffing the rehearsed `CHANGELOG.md` against `HEAD`'s and confirming only an insertion above the marker.
3. **The version in `package.json` and the tag never disagree.**
   `prepare-release.sh` derives both from the same `next-version.sh` output and strips the `v` prefix once, in one place.
4. **Nothing publishes from an untagged tree.**
   `publish-released.sh` refuses when `HEAD` carries no `v*` tag.
5. **A retro- or plan-only push cuts no release.**
   The deliberate behaviour change; confirmed in step 1 by regenerating `v2.0.6` with exclusions and observing the three plan/retro commits drop out.

## Build Order

1. **Add `cliff.toml` and verify parity.**
   Files: `cliff.toml`.
   Verify: `git-cliff --bumped-version` prints `v2.0.7`; `git-cliff --latest --strip header` reproduces the `v2.0.6` section; the same command with the docs exclusions drops the three plan/retro commits.
   Record the commands in the commit body.
   Commit: `chore: add git-cliff release configuration (#63)`.

2. **Add the release scripts.**
   Files: `scripts/release/lib.sh`, `next-version.sh`, `prepare-release.sh`, `publish-released.sh`, `create-github-release.sh`.
   Verify: `./scripts/release/next-version.sh` prints `v2.0.7`; `prepare-release.sh` refuses to run without `CI` or `ALLOW_LOCAL_PUSH`; then the throwaway-clone rehearsal — clone the repo to a scratch directory, repoint `origin` at a bare scratch remote, run with `ALLOW_LOCAL_PUSH=1`, and inspect the resulting commit, `package.json`, `CHANGELOG.md`, and tag.
   Commit: `chore: add the git-cliff release scripts (#63)`.

3. **Add the dispatched release workflow.**
   Files: `.github/workflows/release.yml`.
   Verify: `gh workflow view release.yml` parses it once pushed; no dispatch yet.
   Commit: `ci: add the dispatched git-cliff release workflow (#63)`.

4. **Retire release-please.**
   Files: `.github/workflows/ci.yml`, delete `release-please-config.json` and `.release-please-manifest.json`, add the `CHANGELOG.md` era marker.
   Verify: `pnpm run lint` green (rumdl covers `CHANGELOG.md`); `grep -rn "release-please" --exclude-dir=node_modules --exclude-dir=docs .` returns only the era marker and the prompts still pending step 5.
   Commit: `ci: retire the release-please workflow and configuration (#63)`.

5. **Rewrite the ship prompts.**
   Files: `.pi/prompts/ship-issue.md`, `ship-no-issue.md`, `tdd-plan.md`, `build-plan.md`, `retro.md`.
   Verify: `grep -rn "release_pr_find\|release_pr_merge\|release_watch" .pi/` returns nothing; `pnpm run lint:md` does not cover `.pi/`, so read the rewritten steps end to end instead.
   Commit: `docs: dispatch the release from the ship prompts (#63)`.

6. **Document the mechanism.**
   Files: `AGENTS.md`; grep `docs/` for any remaining `release-please` reference outside `docs/plans/` and `docs/retro/`, which are historical records and stay untouched.
   Verify: `pnpm run lint` green.
   Commit: `docs: document the dispatched git-cliff release (#63)`.

7. **Operator gates (no commit).**
   In order: update the npm Trusted Publisher on npmjs.org from `ci.yml` to `release.yml`; close PR [#58] and delete its branch; push; watch `ci`; then dispatch the first release and watch `release`.
   The trusted-publisher update must land before the dispatch, or `publish` fails on OIDC.

## Risks and Mitigations

1. **Risk: the first dispatch fails in `publish` on OIDC, after the tag is already pushed.**
   `prepare` succeeds and pushes the tag, so a re-dispatch would refuse on the existing tag.
   Mitigation: the trusted-publisher update is an explicit gate before the first dispatch (step 7), and the recovery path — re-run the failed job rather than re-dispatching — is written into both the workflow comments and the ship prompts.

2. **Risk: the changelog splice corrupts `CHANGELOG.md` on the first real run.**
   Mitigation: the step 2 rehearsal runs the real script against a real clone and diffs the result before any of this reaches `main`.

3. **Risk: a release-please reference survives somewhere and misleads a future session.**
   Mitigation: step 4 and step 6 each end in a repo-wide grep, and `docs/plans/`/`docs/retro/` are excluded deliberately as historical records rather than missed.

4. **Risk: losing the release-PR review gate lets an unintended release out.**
   This is the trade `pi-packages` accepted, and it is real.
   Mitigation: `next-version.sh` moves the review earlier and makes it local and offline, and the `sha` guard aborts a dispatch whose base moved.

5. **Risk: `GITHUB_TOKEN` cannot push to `main` after all.**
   Mitigation: verified today that `main` is unprotected and no ruleset applies.
   If that changes, the fallback is the same PAT arrangement `pi-packages` uses, and the failure is loud and confined to `prepare`.

## Open Questions

1. Should this repo carry its own `docs/decisions/` record?
   Deferred: the rationale is `pi-packages`' ADR 0002, and duplicating it here would create two records to keep in sync.
   `AGENTS.md` links it instead.
2. Should `next-version.sh` be exposed as a `package.json` script?
   Deferred until the direct path proves awkward; `pi-packages` calls the script directly and the ship prompts do the same.
3. No follow-up issues are filed by this plan.

[#58]: https://github.com/gotgenes/pi-anthropic-auth/pull/58
