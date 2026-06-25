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

[#31]: https://github.com/gotgenes/pi-anthropic-auth/issues/31
[#32]: https://github.com/gotgenes/pi-anthropic-auth/issues/32
