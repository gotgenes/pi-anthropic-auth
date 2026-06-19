---
issue: 27
issue_title: "fix: set usesCallbackServer on anthropicOAuthOverride"
---

## Stage: PR Review (2026-06-19T15:29:27Z)

### Session summary

PR #27 (third-party, `@sinkarusa`) adds `usesCallbackServer: true` to `anthropicOAuthOverride` in `src/anthropic-oauth.ts`.
The underlying problem is a parity gap: Pi's built-in `anthropicOAuthProvider` sets this flag, but our override dropped it, disabling the manual redirect-URL paste input in environments where the local callback server is unreachable (Docker, SSH, remote dev).
The operator chose to adopt the one-line fix mostly as-is and add a regression test pinning the flag.

### Evaluation

- **Problem is real and verified.** The built-in provider sets `usesCallbackServer: true` (`@earendil-works/pi-ai/dist/utils/oauth/anthropic.js:317`). Our `anthropicOAuthOverride` omitted it. `model-registry.js` `applyProviderConfig` registers the override verbatim (`{ ...config.oauth, id: providerName }` → `registerOAuthProvider`) — a full replace, not a merge — so the built-in flag is lost. Interactive mode reads `providerInfo?.usesCallbackServer ?? false` (`interactive-mode.js:4099`) to decide whether to render the manual-paste input (`:4127`); with the flag missing it defaults to `false` and the login flow freezes when the callback server can't be reached.
- **Approach is idiomatic and right-sized.** A one-line parity restoration that mirrors the built-in provider's exact shape. `usesCallbackServer` is already optional on `OAuthProviderInterface` (`@earendil-works/pi-ai/dist/utils/oauth/types.d.ts`), so no type change. No speculative generality, over-wide threading, or divergent pattern — nothing to collapse.
- **Behavior/breaking.** Restores intended built-in behavior rather than changing a default we deliberately set; correctly typed `fix:`, non-breaking.
- **Security surface.** The manual-paste path is identical to the built-in provider's; nothing new is exposed or gated. Least-privilege preserved.
- **Gap to close on adoption.** No existing test asserts the override exposes `usesCallbackServer: true` (`test/anthropic-oauth.test.ts` covers callback parsing and refresh fallback only). A small parity assertion prevents silent regression if the override object is refactored.

### Decision and attribution

- **Direction:** Adopt mostly as-is — apply the one-line `usesCallbackServer: true` addition to `anthropicOAuthOverride`, and add a regression test in `test/anthropic-oauth.test.ts` asserting the override sets the flag.
- **Scope / non-goals:** Restore parity only; do not merge or modify the built-in provider, do not broaden the override surface, do not add new OAuth fields beyond `usesCallbackServer`.
- **Attribution:** The implementation commit(s) must carry, at the end of the body after a blank line:

  ```text
  Co-authored-by: sinanus <sinankaraveli@gmail.com>
  ```

  The ship-stage close comment thanks `@sinkarusa` by name and links the implementing SHA(s). Reference the PR as `Refs #27` / `(#27)`; never use `Closes #27`.

### Review checklist (adopt-as-is)

1. **Correctness** — `usesCallbackServer: true` present on `anthropicOAuthOverride`; matches built-in `anthropicOAuthProvider`.
2. **Convention fit** — mirrors built-in shape; field optional on `OAuthProviderInterface`, no type churn.
3. **Test coverage** — add parity assertion in `test/anthropic-oauth.test.ts`; `pnpm test` + `pnpm run check` green.
4. **Behavior-change/breaking** — `fix:`, non-breaking (restores dropped built-in behavior).
5. **Attribution** — `Co-authored-by: sinanus <sinankaraveli@gmail.com>` trailer on implementation commit; `@sinkarusa` credited in close comment.

## Stage: Final Retrospective (2026-06-19T16:02:33Z)

### Session summary

Shipped PR #27 end-to-end: rebase-merged `@sinkarusa`'s one-line fix (`ae2996f`, native authorship preserved), added a co-authored parity test (`dcba062`), posted a credit comment, and released `0.6.2` (tag `v0.6.2`, npm published).
The ship was clean, but diagnosing why the release-please PR's CI sat in `action_required` consumed most of the session and went through two wrong theories before comparative `gh api` queries settled it.

### Observations

#### What went well

1. The adopt-as-is attribution flow executed cleanly: `gh pr merge --rebase 27` preserved `sinanus` as the git author of `ae2996f`, and the follow-up `test:` commit carried the `Co-authored-by` trailer — durable credit without a fabricated authorship line.
2. Verification was incremental, not end-loaded: `pnpm run check` + `pnpm test` ran immediately after the test edit and before the commit, so the green signal gated the commit rather than trailing it.
3. The CI mystery was ultimately settled by *comparative* `gh api` queries across two repos (this repo's release-branch run history vs. pi-packages' release PRs having zero check runs, plus PR #27's fork commit having no run) — a clean technique for isolating a non-workflow-file cause.

#### What caused friction (agent side)

1. `premature-convergence` — when first asked "will we keep hitting this approval?", I asserted a confident mechanism (`GITHUB_TOKEN` recursion guard) and then a second wrong one (fork/outside-contributor approval policy) before gathering evidence.
   Impact: two successive explanations were materially wrong and the user had to push back twice; explanation churn but no code rework.
2. `missing-context` — the data that settled the question (pi-packages release PRs have no check runs; PR #27's fork commit `58f08c0` has no check run; this repo has six historical `action_required` release-branch runs) was a couple of `gh api` calls away, but I ran them only after the user's "I haven't seen pi-packages held up" pushback.
   Impact: the decisive comparison arrived on roughly the third diagnostic turn instead of the first.
3. `missing-context` — I initially treated `release_pr_merge`'s `UNSTABLE` refusal as a hard blocker without checking whether branch protection actually required the parked check; only later did I note prior release PRs merged with empty check rollups.
   Impact: minor; briefly overstated the blocker before correcting.

#### What caused friction (user side)

1. The user held high-value empirical context — "I haven't seen workflows held up for pi-packages" — that, surfaced at the first theory, would have short-circuited both wrong explanations.
   Framed as opportunity: when the agent starts theorizing about CI/infra behavior, the user's lived observations are the fastest disconfirming evidence and are worth volunteering early.

### Diagnostic details

1. **Escalation-delay** — the `action_required` diagnosis was not a tight tool-loop on one error; it was an assert-before-verify pattern spread across ~4 user turns, with the comparative `gh api` queries (the right tool) deferred until after two wrong theories. The lesson is sequencing (verify the cheap comparison first), not loop-length.
2. **Unused-tool** — `web_search` on the exact mechanism ("GitHub Actions `action_required` release-please `GITHUB_TOKEN`") could have grounded the explanation before I theorized; the definitive answer still came from comparative `gh api`, so the gap was timing, not tool availability.
3. **Model-performance** — the entire session ran on one strong reasoning model (`claude-opus-4-8`) with no subagent dispatches; appropriate for the judgment-heavy PR review and diagnosis, nothing to flag.
4. **Feedback-loop** — verification (`check` + `test`) ran incrementally after the change and before the commit; no end-loaded-verification gap.

### Durable finding

This repo's release-please PRs park their `pull_request` CI run as `action_required` on every release (six historical occurrences on `release-please--branches--main--components--pi-anthropic-auth`).
It is a per-repo *Settings → Actions → General* approval condition (the workflow file and top-level Actions permissions match pi-packages, which instead produces *no* release-PR run at all), and it is not toggleable via the REST API available here.
It never blocks publishing — `publish` runs on the post-merge `push: main` event — and npm's latest matched the last release throughout (historical gap at `0.4.3`–`0.4.5` is unrelated early-setup churn, superseded by `0.4.6`).
The only practical impact is that `release_pr_merge` treats the parked run as not-`CLEAN`, so the operator must approve the run or admin-merge.
The user declined a follow-up issue to align the setting.

### Changes made

1. Appended this Final Retrospective stage entry to `docs/retro/0027-uses-callback-server.md`.
2. Proposed a tight `AGENTS.md` Git-Workflow note documenting the release-PR `action_required` parking behavior; the user declined it, so the finding stays in this retro only.
