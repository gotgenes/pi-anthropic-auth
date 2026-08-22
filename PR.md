# Pull Request Description

## Suggested title

`feat: add Anthropic OAuth usage dashboard`

## Summary

Pi users can now inspect Anthropic subscription usage, account metadata, and extra-usage credits directly through `/anthropic-usage`.

The command uses Pi's existing Anthropic OAuth credential and leaves the existing provider override and `/anthropic-auth:status` behavior unchanged.

## What changed

- Added `/anthropic-usage` command registration.
- Added Bearer-authenticated clients for Anthropic's OAuth usage and profile endpoints.
- Normalized legacy quota fields and newer `limits[]` entries into dynamic usage windows.
- Rendered one quota bar for every window returned by Anthropic.
- Added Usage, Account, and Extra Usage dashboard tabs.
- Added Neuralwatt-style bright-blue horizontal rules at the top and bottom of the TUI.
- Added local-time reset timestamps with timezone abbreviations.
- Added red styling and explanatory notes for Anthropic-defined additional quotas.
- Added server-severity-aware quota colors.
- Added extra-usage credit scaling using `decimal_places`.
- Added spend scaling using returned minor-unit exponents.
- Added Apple App Store and Google Play Store guidance for canceled subscriptions.
- Added a 60-second in-memory cache with stale-snapshot fallback after refresh failures.
- Added headless, RPC, and TUI output paths.
- Added token-gated OAuth behavior so API-key authentication cannot query this feature.

## Data source and scope

The Usage tab reads `GET https://api.anthropic.com/api/oauth/usage`.

The Account tab enriches usage data with `GET https://api.anthropic.com/api/oauth/profile`.

Both requests use Pi's stored Anthropic OAuth access token as a Bearer token and send `anthropic-beta: oauth-2025-04-20`.

These are undocumented Anthropic OAuth control-plane endpoints, so response fields are parsed defensively and omitted data is not represented as zero usage.

The implementation does not use Claude web cookies, browser sessions, DOM scraping, Pi's host transport, or the pi-ai API registry.

OAuth access and refresh tokens are never included in command output, logs, or persisted snapshots.

## Compatibility and failure behavior

The feature is additive and does not replace Pi's built-in Anthropic transport.

Missing OAuth credentials, API-key authentication, authorization failures, rate limits, server errors, and malformed responses produce user-facing errors without exposing credentials.

If profile enrichment fails, usage data remains available with a warning.

If a refresh fails after a successful fetch, the last successful snapshot remains visible and is marked stale instead of displaying zero usage.

## Validation

- `pnpm test` passed: 88 tests.
- `pnpm run check` passed.
- `pnpm run lint` passed.
- LSP diagnostics passed with no findings.
- Live Pi smoke test passed with local reset times, dynamic quota output, scaled credits, and store billing guidance.

