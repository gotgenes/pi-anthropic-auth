# Plan: Add Anthropic OAuth Usage Dashboard

**Target repository:** `pi-anthropic-auth`

**Status:** Implementation complete.

**Implementation started after the pre-implementation gates passed.**

**Plan location:** `Plan.md` is intentionally at the repository root per user instruction and is not intended to participate in the repository's `docs/plans/` automation.

## Overview

Add an `/anthropic-usage` Pi command that reads usage and account information through Anthropic OAuth endpoints using Pi's existing OAuth credential.

The feature will not use Claude web cookies, browser sessions, DOM scraping, or browser automation.

The feature will preserve the existing provider override and `/anthropic-auth:status` behavior.

## Problem Frame

Pi already stores an Anthropic OAuth access token and uses it for Claude requests.

Users need a clear view of the subscription usage windows and account metadata available through the OAuth control plane.

Anthropic's usage response can expose different quota windows for different accounts.

The UI must therefore render the windows returned in the response instead of assuming a fixed number of bars.

## Requirements

1. Register an `/anthropic-usage` command.
2. Use the existing Anthropic OAuth credential without exposing access or refresh tokens.
3. Fetch usage data from `https://api.anthropic.com/api/oauth/usage`.
4. Fetch account identity from `https://api.anthropic.com/api/oauth/profile`.
5. Normalize legacy usage fields and newer self-describing `limits[]` entries into one internal window model.
6. Render one usage bar for every normalized quota window present in the response.
7. Render five-hour and seven-day windows using clear labels when those fields are present.
8. Render model-scoped windows such as Sonnet and Opus using the model or scope supplied by Anthropic.
9. Render additional scoped windows such as Cowork or Routines when Anthropic supplies them.
10. Render extra-usage credit information when the usage response supplies it.
11. Show account identity and subscription metadata returned by the OAuth profile or usage response.
12. Preserve the last successful snapshot during transient fetch failures and mark it stale instead of displaying zero usage.
13. Cache successful usage data and avoid aggressive repeated polling that could trigger rate limits.
14. Support TUI, headless print, and RPC contexts using the repository's existing command-handler conventions.

## Planned User Interface

The command will open a dashboard with three tabs.

### Usage tab

The Usage tab will contain one bar per usage window returned by Anthropic.

Each bar will show a label, used percentage, and reset time when available.

The number of bars will be dynamic.

An account with two returned windows will show two bars.

An account with six returned windows will show six bars.

Missing windows will be omitted rather than displayed as zero.

### Account tab

The Account tab will show email, account UUID, organization name, organization UUID, subscription type, rate-limit tier, subscription status, and last update time when those values are available.

### Extra Usage tab

The Extra Usage tab will show enabled state, used credits, monthly limit, remaining credits, utilization percentage, currency, and disabled reason when those values are available.

## Data Sources

### OAuth usage endpoint

Use `GET https://api.anthropic.com/api/oauth/usage` with the OAuth access token as a Bearer token.

Send the Anthropic OAuth beta header required by the endpoint.

Treat the endpoint as an undocumented external contract whose response shape may evolve.

The parser will accept both legacy named fields and newer `limits[]` entries.

Expected usage data includes five-hour, seven-day, model-scoped, and other scoped quota windows with utilization and reset timestamps.

Expected extra-usage data includes enabled state, used credits, monthly limit, utilization, currency, and disabled reason.

### OAuth profile endpoint

Use `GET https://api.anthropic.com/api/oauth/profile` with the OAuth access token as a Bearer token.

Use the profile response for account and organization identity fields.

### Local Pi credential

Resolve the Anthropic credential through Pi's supported provider-auth or API-key mechanism.

Do not read, print, duplicate, or persist raw access or refresh tokens outside Pi's existing credential storage.

## Data Model Direction

Normalize every quota entry into a window containing an identifier, display label, optional model or scope, utilization percentage, optional reset timestamp, and source field.

Normalize legacy fields such as `five_hour`, `seven_day`, `seven_day_sonnet`, `seven_day_opus`, `seven_day_cowork`, and `seven_day_routines` into the same window list.

Preserve unknown entries from `limits[]` instead of dropping them so new Anthropic windows can appear without a code change.

Represent missing values as absent or null rather than inventing zeroes.

Represent the last successful response separately from the current fetch error so stale data remains distinguishable from live data.

## Scope Boundaries

- Do not access Claude web cookies or `claude.ai` browser-session endpoints.
- Do not implement prepaid-credit, auto-reload, payment-method, or browser billing integrations.
- Do not modify Pi core or replace Pi's built-in Anthropic transport.
- Do not change API-key Anthropic behavior.
- Do not add background polling.
- Do not log OAuth tokens or full authorization headers.
- Do not infer missing quotas from plan names or display missing quotas as zero.
- Do not promise a fixed number of usage bars.

## Key Technical Decisions

- **Use a dedicated usage client:** Keep usage requests separate from the Anthropic message transport because the usage endpoint uses a different request shape.
- **Use OAuth-only authentication:** Reuse Pi's resolved Anthropic OAuth credential and reject non-OAuth credentials with a clear user-facing message.
- **Normalize dynamic windows:** Store quota windows in a list so legacy and future response formats share one renderer.
- **Render dynamically:** The UI creates bars from normalized windows and does not hardcode a quota count.
- **Cache conservatively:** Cache successful snapshots for a bounded interval and reuse stale data after fetch failures.
- **Keep enrichment best-effort:** Profile and optional metadata failures should not discard valid usage data.
- **Keep output token-safe:** Reports and errors must contain endpoint status and field-level failure information without credential values.

## Pre-Implementation Gates

These gates must be resolved before implementation units begin because they can change the architecture and user interface.

### G1. Verify an out-of-band OAuth credential seam

Confirm from the installed Pi extension API and runtime behavior whether an extension command can resolve the stored Anthropic OAuth credential outside a `streamSimple` request.

The plan must use a supported public seam such as provider-auth resolution or API-key resolution and must not depend on private Pi internals.

If no supported seam exists, stop and revise U2 before implementing the usage client.

The fallback must either descope direct usage fetching or define an explicitly supported credential handoff rather than scraping Pi's credential files.

### G2. Verify interactive custom TUI support

Confirm from the installed Pi extension API and runtime behavior whether a command can open a stateful custom component with tab selection and rerendering.

If supported, retain the three-tab dashboard in U4.

If unsupported, replace the tabbed dashboard with a flat scrollable report or separate command views while preserving the same normalized data model.

Do not implement an unsupported tab component based only on assumptions.

### G3. Verify the OAuth endpoint contract

Capture or otherwise validate the current usage request headers, beta header, status behavior, and representative response shape before U2 is considered ready.

Record whether the endpoint accepts Pi's OAuth credential and whether profile enrichment succeeds with the same credential.

If the endpoint rejects the request because of header, beta, scope, or client restrictions, revise the client design before proceeding.

### Gate Results

- **G1 passed:** Pi 0.84.0 exposes `ctx.modelRegistry.getProviderAuth("anthropic")`, and the live runtime resolved an OAuth credential without a model request.
- **G2 passed:** Pi 0.84.0 exposes `ctx.ui.custom()` with a stateful component factory, keyboard input, rerender support, and a completion callback.
- **G3 passed:** The live OAuth credential received HTTP 200 from both usage and profile endpoints using Bearer authentication and the `oauth-2025-04-20` beta header.
- **Observed usage keys:** `five_hour`, `seven_day`, `seven_day_cowork`, `seven_day_oauth_apps`, `seven_day_omelette`, `seven_day_opus`, `seven_day_sonnet`, `limits`, `extra_usage`, and provider-supplied metadata fields.
- **Observed profile keys:** `account`, `application`, `enabled_plugins`, and `organization`.

## Implementation Units

- [x] U1. **Define usage and account response models**

**Goal:** Define internal types for normalized quota windows, account metadata, extra usage, snapshots, freshness, and errors.

**Dependencies:** Pre-implementation gates G1, G2, and G3.

**Files:**

- Create: `src/usage-types.ts`
- Test: `test/usage-types.test.ts`

**Approach:** Separate transport response representations from normalized UI data so Anthropic schema drift does not leak into rendering code.

**Patterns to follow:** Use the small value-object and formatter style established in `src/diagnostics.ts`.

**Test scenarios:**

- Happy path: Normalize legacy five-hour and seven-day entries into two windows with utilization and reset timestamps.
- Happy path: Normalize model-scoped Sonnet and Opus entries with model labels.
- Happy path: Preserve unknown `limits[]` entries as normalized windows.
- Edge case: Preserve null reset timestamps without inventing a reset time.
- Edge case: Preserve zero utilization as a real value rather than treating it as missing.
- Error path: Ignore malformed individual optional entries while retaining valid entries.

**Verification:** The normalized model can represent every planned bar and account field without requiring a fixed window count.

- [x] U2. **Implement OAuth usage client**

**Goal:** Fetch and decode usage and profile data through Anthropic's OAuth control-plane endpoints.

**Dependencies:** U1 and pre-implementation gates G1 and G3.

**Files:**

- Create: `src/usage-client.ts`
- Test: `test/usage-client.test.ts`

**Approach:** Use a dedicated HTTP client with Bearer authentication, required OAuth headers, bounded request context, status validation, and tolerant JSON decoding.

Resolve the credential through the supported seam confirmed by G1.

Do not modify `src/host-transport.ts` unless G1 specifically identifies that file as the supported integration boundary.

If G1 finds no supported seam, pause this unit and revise the plan instead of reading Pi credential files directly.

The client must not reuse the regular Messages API `x-api-key` request path.

Profile enrichment should be best-effort after usage data succeeds.

**Patterns to follow:** Follow the repository's test strategy of mocked `fetch` responses and narrow helper modules.

**Test scenarios:**

- Happy path: Usage request sends Bearer authorization and the required OAuth beta header.
- Happy path: Usage response containing legacy fields is decoded successfully.
- Happy path: Usage response containing `limits[]` is decoded successfully.
- Happy path: Profile response supplies account and organization identity.
- Error path: Missing OAuth credential returns a safe actionable error without making a request.
- Error path: HTTP 401, 403, 429, and 5xx responses return classified errors without response secrets.
- Error path: Malformed JSON returns a parse error without exposing the access token.
- Integration: A successful usage response remains usable when profile enrichment fails.

**Verification:** Client tests prove exact request authentication, response parsing, and safe failure behavior.

- [x] U3. **Add snapshot cache and freshness handling**

**Goal:** Prevent repeated command invocations from aggressively polling the undocumented usage endpoint and preserve the last successful result during transient failures.

**Dependencies:** U1 and U2.

**Files:**

- Create: `src/usage-cache.ts`
- Test: `test/usage-cache.test.ts`

**Approach:** Keep an in-memory cache scoped to the extension process, store fetch time and source status, apply a 60-second freshness interval by default, and return stale snapshots with an explicit stale marker after failures.

The 60-second interval is a conservative starting value and may be tuned after controlled endpoint observation without changing the cache contract.

Do not persist OAuth tokens or usage snapshots to a new credential store in this phase.

**Test scenarios:**

- Happy path: A fresh cached snapshot avoids a second network request.
- Happy path: An expired snapshot triggers a fresh request.
- Error path: A failed refresh returns the previous snapshot marked stale.
- Edge case: No previous snapshot returns a clear failure instead of an empty zero-valued dashboard.
- Edge case: Concurrent requests do not create uncontrolled duplicate fetches.

**Verification:** Repeated command use is rate-limit-conscious and never confuses missing data with zero usage.

- [x] U4. **Implement dashboard rendering and command registration**

**Goal:** Register `/anthropic-usage` and render Usage, Account, and Extra Usage tabs in TUI, headless, and RPC contexts.

**Dependencies:** U1, U2, U3, and pre-implementation gate G2.

**Files:**

- Create: `src/usage-command.ts`
- Modify: `src/index.ts`
- Test: `test/usage-command.test.ts`
- Test: `test/index-registration.test.ts`

**Approach:** Reuse the existing command registration and headless notification conventions.

Use Pi custom UI components only for TUI mode after G2 confirms the required stateful surface.

If G2 fails, render a flat scrollable report or separate command views instead of inventing a tab implementation.

Render one bar for each normalized usage window and use server-provided labels and scopes.

Render stale state, last update time, and fetch errors without replacing valid data with zeroes.

Use compact text output for headless and RPC contexts.

**Test scenarios:**

- Happy path: Command registration exposes `/anthropic-usage`.
- Happy path: Usage tab renders exactly one bar per normalized window.
- Happy path: Account tab renders available identity fields.
- Happy path: Extra Usage tab renders credit usage fields.
- Edge case: Two returned windows produce two bars.
- Edge case: Unknown future `limits[]` windows receive readable labels.
- Error path: Missing OAuth credentials produce a clear message and no dashboard request.
- Error path: Stale data is labeled stale and retains its previous percentages.
- Integration: TUI, headless, and RPC paths route output through their appropriate existing interfaces.
- Regression: Existing `/anthropic-auth:status` registration and provider registration remain unchanged.

**Verification:** `/anthropic-usage` presents live or explicitly stale OAuth usage data without changing existing Anthropic request behavior.

- [x] U5. **Document usage command and operational behavior**

**Goal:** Document the command, dynamic bar behavior, supported fields, caching, and OAuth-only data source.

**Dependencies:** U4.

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture.md` if the new control-plane client changes architecture documentation.
- Test expectation: none -- documentation-only unit.

**Approach:** Explain that the dashboard renders one bar per quota entry returned by Anthropic and does not assume a fixed count.

Document that usage data is fetched with Pi's OAuth credential and that tokens are never displayed.

**Verification:** Documentation matches the implemented command and does not imply cookie or browser support.

## System-Wide Impact

- **Extension registration:** `src/index.ts` gains one command while preserving the existing provider registration.
- **Authentication:** The feature consumes Pi's existing Anthropic OAuth credential but does not change login or refresh behavior.
- **External contract:** Anthropic usage and profile endpoints are undocumented and may change response fields.
- **UI lifecycle:** TUI rendering must invalidate and rerender when data, tab selection, loading state, or stale state changes.
- **Error propagation:** Network, authorization, rate-limit, and parse errors become safe user-facing status messages.
- **Unchanged invariants:** API-key requests, request shaping, built-in model discovery, and `/anthropic-auth:status` remain unchanged.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Usage response schema changes | Tolerant decoding, generic `limits[]` normalization, and fixture-driven tests. |
| Endpoint rate limiting | In-memory caching, no background polling, and stale snapshot fallback. |
| OAuth-plane request rejection | Validate headers, beta flag, scopes, status behavior, and a representative response at G3 before committing to U2. |
| OAuth credential exposure | Bearer headers stay inside the HTTP client and are excluded from logs and reports. |
| Missing optional fields | Omit individual fields or bars rather than fabricating values. |
| Profile request failure | Keep valid usage data and mark only account enrichment as unavailable. |
| TUI complexity | Reuse Pi custom UI primitives and keep headless output independently testable. |

## Deferred Implementation Questions

- Confirm whether account and plan fields are present in the current profile response or require usage-response fallbacks.
- Confirm whether Anthropic adds new quota scopes that need label-specific presentation after the generic renderer is working.
- Tune the default 60-second cache interval only if controlled endpoint observation demonstrates a safer value.

## Success Criteria

- `/anthropic-usage` is available after extension load.
- OAuth usage and profile requests use Bearer authentication without token leakage.
- Every returned quota window can render as its own bar.
- The UI does not assume a fixed number of bars.
- Stale snapshots remain visibly distinct from live data.
- Existing provider behavior and diagnostics command remain unchanged.
- Automated tests cover parsing, authentication, caching, rendering, and failure paths.
