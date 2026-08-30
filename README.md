# pi-anthropic-auth

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-anthropic-auth?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-anthropic-auth)
[![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-anthropic-auth/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-anthropic-auth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D10-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

A [Pi](https://pi.mariozechner.at/) extension that improves compatibility with Anthropic Claude Pro/Max OAuth (i.e., your Claude subscription) while preserving Pi's normal Anthropic behavior.

## What It Does

Pi works great with Anthropic API keys out of the box.
This extension fills in the gaps for users who want to use their **Claude Pro or Max subscription** via OAuth instead.

It keeps everything you'd expect — the built-in `anthropic` provider, the full model list, API-key behavior, and the native `/login anthropic` flow — and layers on the compatibility fixes needed to make OAuth subscriptions work reliably.

Requests to non-Anthropic providers and plain API-key Anthropic requests pass through completely untouched — the extension only activates when it detects an Anthropic OAuth access token (`sk-ant-oat`).

Shaping runs in a thin transport wrapper around Pi's own Anthropic transport, so it applies to interactive turns and to compaction — not just the main turn.
Background agents that run their own agent loop are a known exception on Pi 0.80.8 and later.
See [docs/architecture.md](docs/architecture.md) for how this works, and for the workaround if you write such an extension.

## Install

```bash
pi install npm:@gotgenes/pi-anthropic-auth
```

To try it without permanently installing:

```bash
pi -e npm:@gotgenes/pi-anthropic-auth
```

## Usage

1. Run `/login anthropic` as usual — Pi's native Anthropic login flow is preserved.
2. Select a Claude Pro/Max model and start chatting. The extension handles compatibility transparently.
3. API-key behavior is unaffected; the extension's changes apply only to OAuth sessions.
4. Run `/anthropic-usage` to view OAuth subscription windows, account metadata, and extra-usage credits.

`/anthropic-usage` uses Pi's stored Anthropic OAuth credential and the Anthropic OAuth control-plane endpoints.
It does not use Claude web cookies, browser sessions, or DOM scraping.
The Usage view renders one bar for each normalized quota window returned by Anthropic, so the number of bars can vary by account.
When Anthropic returns a non-empty `limits[]` array, it takes precedence over legacy quota fields to avoid duplicate windows; legacy fields remain the fallback when `limits[]` is absent or empty.
The dashboard includes Usage, Account, and Extra Usage views.
The Usage view also shows an Extra Usage summary bar when Anthropic reports enabled extra usage with a utilization value.
Reset timestamps render as compact local-time values with the timezone abbreviation.
Unrecognized legacy quota objects are labeled as additional quotas; `0%` means Anthropic reported no usage for that quota.
The opaque legacy `nimbus_quill` bucket is omitted instead of being shown as an unexplained quota.
Credit amounts use Anthropic's returned `decimal_places` metadata, while spend values use their returned minor-unit exponent.
When Spend duplicates Extra Usage after scaling, the duplicate detail is shown only once.
Store-managed canceled subscriptions show Apple App Store or Google Play Store guidance.
Usage snapshots are cached briefly to avoid aggressive polling, and failed refreshes are shown as stale data rather than zero usage.

### Anthropic data source

The Usage tab reads `GET https://api.anthropic.com/api/oauth/usage`.
The Account tab enriches it with `GET https://api.anthropic.com/api/oauth/profile`.
Both requests use Pi's stored Anthropic OAuth credential as a Bearer token and send `anthropic-beta: oauth-2025-04-20`.
A non-empty `limits[]` array takes precedence over legacy quota fields; legacy fields are used when `limits[]` is absent or empty.
Structured model and surface scope data from `limits[]` is used to label scoped windows, while unknown limit types receive fallback labels instead of breaking the report.
Credit values use `extra_usage.decimal_places`; spend values use their returned minor-unit `exponent`.
These are Anthropic OAuth control-plane endpoints, not the Messages API, Claude web cookies, or browser scraping, and they are undocumented endpoints that may change.

### Extra Usage requirements

The Extra Usage view displays credit and spend data only when Usage credits are enabled on the Anthropic account.
When Usage credits are disabled, Anthropic does not return those fields and the view displays no data.
Enable Usage credits in the Anthropic Console under Settings → Plans & Billing → Usage credits.

## Troubleshooting

### Verify the extension is loaded

Run `/anthropic-auth:status` in Pi to print a diagnostics report:

```text
pi-anthropic-auth diagnostics
  version: 0.6.5
  module:  /root/.pi/agent/.../src/index.ts
  built-in Anthropic transport: resolved
```

The `module` line shows which copy of the extension loaded.
If the command is not found, the extension is not loaded at all.

### `ANTHROPIC_API_KEY` is ignored when OAuth credentials exist

Pi's auth resolver gives stored credentials priority over environment variables.
If you have previously run `/login anthropic` and credentials are stored in `~/.pi/agent/auth.json`, Pi uses the stored OAuth token on every request — even when `ANTHROPIC_API_KEY` is also set.

To use the API key instead, run `/logout anthropic` inside Pi to remove the stored credentials, or delete `auth.json` before starting the session.

### Docker: extension missing after volume mount

If you install the extension at image build time with `RUN pi install npm:@gotgenes/pi-anthropic-auth` and then mount a persistent volume over `~/.pi/agent` at runtime, Docker may mask the build-time install.
Docker seeds a named volume with the image directory only on its first creation.
If the volume already exists from a previous image, the extension directory inside it may be empty or out of date.

To fix this, either:

- Remove the volume and let Docker re-seed it: `docker volume rm <volume-name>`.
- Or install the extension at container startup rather than at image build time, after the volume is mounted.

## Development

### Requirements

- `pnpm`
- a local `pi` installation
- Anthropic OAuth credentials configured through Pi

### Commands

```bash
pnpm install      # install dependencies
pnpm run check    # typecheck
pnpm test         # run tests
pnpm run build    # compile
```

### Load a Local Build

```bash
pi -e /absolute/path/to/pi-anthropic-auth/dist/index.js
```

### Debug Logging

Set `PI_ANTHROPIC_AUTH_DEBUG` to enable structured debug logs from the OAuth shaping layer.

Modes:

- `PI_ANTHROPIC_AUTH_DEBUG=all` — log all Anthropic OAuth shaping events
- `PI_ANTHROPIC_AUTH_DEBUG=tool-use` — log only requests that include `tool_use`

Example:

```bash
PI_ANTHROPIC_AUTH_DEBUG=tool-use \
pi \
  --model anthropic/claude-haiku-4-5 \
  --no-session \
  --tools read,grep,find,ls \
  -e /absolute/path/to/pi-anthropic-auth/src/index.ts \
  -p "How many lines are in @AGENTS.md ?"
```

## Similar Projects

- [opencode-anthropic-auth](https://github.com/ex-machina-co/opencode-anthropic-auth/) — Anthropic OAuth compatibility work for [OpenCode](https://opencode.ai/).
- [pi-anthropic-oauth](https://github.com/leohenon/pi-anthropic-oauth) — a Pi extension that takes a fuller provider-override approach.

For notes on how this project compares to similar work, see [docs/comparison-to-similar-projects.md](docs/comparison-to-similar-projects.md).

## Acknowledgments

This project was inspired by [opencode-anthropic-auth](https://github.com/ex-machina-co/opencode-anthropic-auth/), which solved the same Anthropic OAuth compatibility problem for [OpenCode](https://opencode.ai/).

## License

MIT
