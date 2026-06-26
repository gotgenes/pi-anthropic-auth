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

## Stage: Final Retrospective (2026-06-26T13:51:10Z)

### Session summary

Executed the docs-only `/build-plan`, then — after the operator asked to discuss before finalizing — reframed both docs from "expose / resolve the built-in transport" to "register a provider-bound payload transform," filed the durable ask upstream as `pi#6089` (operator-authored), shipped Issue [#35] in `v0.6.4`, and closed it.
Housekeeping followed: recorded the near-term direction on Issue [#31], closed Issue [#32] (rejected parent-walk) as not planned.
The core value came from a mid-session design discussion that changed the deliverable's thesis, not just its wording.

### Observations

#### What went well

1. The operator's "let's discuss first" redirect unlocked the central insight: `src/oauth-transport.ts` exists solely to set `onPayload`, so the transport-resolution problem is second-order.
   That reframed the upstream ask from "expose the transport" to "register a transform" — a materially stronger request.
2. Every mechanics claim was grounded against the live pi workspace (`~/development/pi/pi` @ 0.80.2): `onPayload` is applied by every api transport, the registry is replace-only (`Map.set`), and `isOAuth` is computed before `onPayload`.
   This kept a doc meant to back an upstream issue free of hand-waving.
3. Clean collaborative upstream-issue loop: mapped specific → generic vocabulary (`Api`/`KnownApi`, `ApiProvider`, `StreamFunction`), reviewed the operator's hand-written issue, caught the shortcoming-4 timeline imprecision, and respected the human-voice constraint (no AI-drafted upstream text).
4. Used `git reset --soft f71e6b6` to replace the misframed commits with cleanly reframed ones rather than stacking revision commits — kept history legible.

#### What caused friction (agent side)

1. `wrong-abstraction` (user-caught) — executed `/build-plan` mechanically (write artifact, verify, commit, run pre-completion) on a tracking issue whose deliverable was the reasoning itself, instead of discussing the framing first.
   The operator: "I was hoping we would discuss this before writing an artifact."
   Impact: full reframe of both docs and a `git reset --soft` + rewrite of all build commits ("get the transport" → "register a transform").
   Real rework, though the discussion materially improved the result.
2. `other` (self-identified) — `gh search issues --state all` silently failed (invalid flag) and returned empty, which nearly read as "no upstream prior art exists."
   Caught via a sanity-check search; switched to `gh issue list --search`.
   Impact: one extra search round; an uncaught false negative would have weakened the upstream issue's prior-art framing.
3. `other` (self-identified, minor) — the `pre-completion-reviewer` ran against the first framing, then the operator-driven discussion reframed both docs.
   Same root cause as item 1 (design not settled before the gate).
   Impact: none direct — the WARN findings were about deferred code and stayed valid; noted as a sequencing observation.

#### What caused friction (user side)

1. The "discuss before drafting" expectation surfaced only after the first artifacts existed.
   Opportunity, not criticism: for a tracking/decision issue, a one-line steer at `/build-plan` kickoff ("talk through the framing before writing") would have pre-empted the rewrite — the planning `ask_user` gates reasonably looked settled.

### Diagnostic details

1. Model-performance correlation: one subagent dispatch — `pre-completion-reviewer` (default model) — reviewed the pre-reframe docs; findings were sound (deferred WARNs), no model mismatch.
2. Escalation-delay: no error streak exceeded 5 calls; the `gh`-flag issue resolved in ~2 calls.
3. Unused-tool: none needed — targeted greps against the pi workspace were efficient, and GitHub search was the right tool once the flag was fixed.
4. Feedback-loop: lint ran incrementally after each doc commit; the only sequencing gap was pre-completion firing before the strategic discussion (item 1 / agent-side item 3).

### Changes made

1. `.pi/prompts/build-plan.md` — added a discussion-checkpoint rule to the "Execute the plan steps" section: for steps whose deliverable is the reasoning itself (decision record, design analysis, upstream-request brief), present findings and proposed framing for the user's alignment before writing and committing.

[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#32]: https://github.com/gotgenes/pi-anthropic-auth/issues/32
