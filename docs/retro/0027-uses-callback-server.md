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
