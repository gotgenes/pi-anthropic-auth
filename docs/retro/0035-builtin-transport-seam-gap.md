---
issue: 35
issue_title: "Wrapping the built-in Anthropic transport has no durable, loader-safe seam"
---

# Retro: #35 — Wrapping the built-in Anthropic transport has no durable, loader-safe seam

## Stage: Planning (2026-06-25T00:00:00Z)

### Session summary

Planned a docs-only response to the seam-gap tracking issue.
The plan produces two new flat docs — a decision record (`docs/builtin-transport-seam-gap.md`) and an operator-facing upstream request brief (`docs/builtin-transport-seam-upstream-request.md`) — plus a single cross-reference from `docs/architecture.md`.
No `src/host-transport.ts` change lands here; the near-term code switch is committed as a recommendation but deferred to a follow-up issue.

### Observations

- Issue is the operator's own (gotgenes) and explicitly a tracking issue: it asks to land on a deliberate direction before touching `host-transport.ts` again.
- Used `ask_user` three times to resolve genuine ambiguity: artifact (ADR + upstream brief), near-term path (bare-root `compat` import), and code scope (docs now, code deferred).
- Key operator constraint surfaced mid-flow: the pi project rejects AI-composed GitHub issues, so the upstream artifact must be **source material the operator authors from**, not a paste-ready issue body.
- The operator declined to pre-select an upstream ask; the brief must first establish the mechanics and the alternatives available from pi-ai's actual API, then rank the candidate directions (extension seam vs. subpath aliasing vs. stable core handle) without deciding.
- Recommendation rejects the Issue [#32] parent-`node_modules` walk (breaks in Bun-binary mode) and the status-quo hold (leaves Issue [#31] unfixed), committing instead to the bare-root `compat` import with an explicit compat-removal-cliff TODO.
- Release: ships independently — no roadmap/batch reference in `docs/architecture.md`.
- Next step is `/build-plan` (docs-only, no test cycles); the build step must verify loader-mode and handle-table claims against the pi workspace at `~/development/pi/pi` rather than restating the issue body.

## Stage: Implementation — Build (2026-06-25T00:00:00Z)

### Session summary

Wrote the two docs-only artifacts and the `docs/architecture.md` cross-reference, then revised both docs after a design discussion with the operator.
The discussion reframed the upstream ask away from "expose / resolve the built-in transport" toward "register a provider-bound payload transform," because our wrapper exists only to inject `onPayload` — a primitive pi-ai already applies on every call path.
No `src/` or `test/` files changed; the near-term bare-root `compat` import switch stays deferred to a follow-up issue.

### Observations

- Operator pushed back on jumping straight to artifacts; the substance is the design analysis, not the doc. Held a discussion before finalizing.
- Key design finding (verified in source): `src/oauth-transport.ts` does nothing but set `onPayload` and delegate to pi's built-in transport. `onPayload` is a first-class `SimpleStreamOptions` field (`types.ts`) that every api applies (`api/anthropic-messages.ts` calls it after `buildParams`). pi wires its `onPayload` seam (`before_provider_request`) only into the main loop (`sdk.ts`), so reaching compaction + foreign `agentLoop` forces us down to the replace-only api-registry transport (`compat.ts` `registerApiProvider` = `Map.set`) — and delegating from there is what creates the whole resolution/`compat` problem.
- Layering constraint confirmed: `before_provider_request` is a coding-agent event; foreign background agents call pi-ai `agentLoop` directly, below the extension host, so a durable transform must live at the pi-ai registry/dispatch layer.
- Decided (Decide gate): foreign background-agent coverage is a real requirement (all call paths must stay covered), so the registry seam is unavoidable and the reframed ask stands.
- Reframed upstream ask, ranked: (1) provider-bound payload transform (`registerProvider("anthropic", { oauth, onPayload })`, applied at the pi-ai registry layer, given the `isOAuth` signal pi already computes); (2) composable registration (hand back / decorate the previous provider — also kills the Issue [#28] clobber); (3) fallbacks — alias `/api/*` subpaths or a stable core handle (least elegant, keep wrap-and-delegate alive).
- Near-term decision unchanged: bare-root `compat` import to fix Issue [#31] across loader modes, deferred to a follow-up issue with a compat-cliff TODO.
- Pre-completion reviewer (run against the first framing): WARN, no FAILs, deterministic checks PASS. Its two WARNs (AGENTS.md "Related Files" not listing the new docs; architecture.md's "(jiti-aliased, works)" annotation) remain deferred to the follow-up code issue.
- Commits were reset and rewritten to carry the reframed framing rather than the original "get the transport" framing.
- Searched `earendil-works/pi` for prior art: the exact seam ask is unfiled. Closest are the withdrawn `pi#4980` (compaction-bypass slice, never resubmitted — our ask supersedes it) and the landed `pi#3262` (export `AssistantMessageEventStream` for `streamSimple` wrappers, same Claude Pro/Max domain — precedent the use case is accepted). Both docs now cite these. Adjacent asks `pi#3987`/`pi#5061` (fetch hook) and `pi#4038` (post-`onPayload` hook) were closed without landing, two labeled `possibly-openclaw-clanker` — reinforcing that the operator must author the upstream issue in a human voice.

[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#32]: https://github.com/gotgenes/pi-anthropic-auth/issues/32
