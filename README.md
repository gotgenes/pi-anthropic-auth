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
Background agents that run their own agent loop are shaped when they issue requests through `ctx.modelRegistry.streamSimple()`, as pi-observational-memory does; those that call pi-ai's `compat.streamSimple` directly are not.
See [docs/architecture.md](docs/architecture.md) for how this works, and for the supported path if you write such an extension.

Pi's own extra-usage warning still appears on every Anthropic OAuth session and is not suppressed by this extension — see [Pi warns about extra usage on every OAuth session](#pi-warns-about-extra-usage-on-every-oauth-session).

## Install

Requires Pi 0.86.0 or newer.
Pi 0.86.0 restructured its system prompt into XML-tagged sections, and this extension shapes that structure directly; the `2.x` line supports Pi 0.80.8 through 0.85.x.

```bash
pi install npm:@gotgenes/pi-anthropic-auth
```

To try it without permanently installing:

```bash
pi -e npm:@gotgenes/pi-anthropic-auth
```

## Usage

1. Run `/login anthropic` as usual — Pi's native Anthropic login flow is preserved.
   On pi 1.0.0 and later, that includes **Copy code login (headless)**, for when the browser runs on another machine: sign in there, then paste the code Anthropic shows into pi.
2. Select a Claude Pro/Max model and start chatting. The extension handles compatibility transparently.
3. API-key behavior is unaffected; the extension's changes apply only to OAuth sessions.

### Additional Anthropic subscriptions

Pi applies an extension's transport per provider **name**, so by default only the provider named `anthropic` is shaped.
If another extension registers a Claude subscription under its own name ([pi-multi-pass](https://github.com/hjanuschka/pi-multi-pass) registers `anthropic-2`, `anthropic-3`, …), name those providers in the extension's config file:

```json
{
  "providers": ["anthropic-2", "anthropic-3"]
}
```

The file is read from two places, and the providers from both are shaped:

1. `~/.pi/agent/extensions/pi-anthropic-auth/config.json`, when the extension loads
2. `<project>/.pi/extensions/pi-anthropic-auth/config.json`, at session start, and only when the project is trusted

`anthropic` is always shaped and does not need listing.
A malformed file or entry is ignored with a warning rather than failing the extension; run `/anthropic-auth:status` to see which providers are shaped and any config warnings.
A provider removed from the file stays shaped until you run `/reload`.

## Troubleshooting

### Verify the extension is loaded

Run `/anthropic-auth:status` in Pi to print a diagnostics report:

```text
pi-anthropic-auth diagnostics
  version: 0.6.5
  module:  /root/.pi/agent/.../src/index.ts
  built-in Anthropic transport: resolved
  shaped providers: anthropic, anthropic-2 (global)
  accounts:
    anthropic: claude_max, rate limit default_claude_max_20x, subscription active, extra usage off
    anthropic-2: claude_team, seat team_standard, rate limit default_raven, subscription active, extra usage on
```

The `module` line shows which copy of the extension loaded.
If the command is not found, the extension is not loaded at all.
The `shaped providers` line lists `anthropic` and every provider named in a config file, with the file (`global` or `project`) that named it.

The `accounts` block asks Anthropic which subscription each shaped provider's OAuth login belongs to: plan type, seat, rate-limit tier, subscription status, and whether extra usage is enabled.
A provider logged in with an API key, with no login, or whose token could not be refreshed shows `no OAuth login`; a failed lookup shows `unavailable` with the reason.

To tell several logins apart, run `/anthropic-auth:status --account`, which also shows each account's email and organization name:

```text
    anthropic: person@example.com (person@example.com's Organization), claude_max, ...
```

The plain report leaves these out so it is safe to paste into an issue; a personal organization is named after its email, so the organization name is identifying too.

### Another Anthropic provider fails with "You're out of extra usage"

```text
400 invalid_request_error: You're out of extra usage. Add more at claude.ai/settings/usage and keep going.
```

When this appears on a provider such as `anthropic-2` while the same account works on `anthropic`, the request most likely reached Anthropic without the Claude Code billing header, so it was billed as third-party usage.
Short prompts can pass without the header, so the failure often shows up only in real sessions.

Check `/anthropic-auth:status`.
If the failing provider is missing from `shaped providers`, name it in the config file (see [Additional Anthropic subscriptions](#additional-anthropic-subscriptions)).
Its line under `accounts` shows which subscription that provider's login belongs to, and whether extra usage is enabled on it.

### Pi warns about extra usage on every OAuth session

Pi prints this warning once per interactive session whenever an Anthropic model is selected and your stored Anthropic credentials are OAuth:

> Anthropic subscription auth is active. Third-party harness usage draws from extra usage and is billed per token, not your Claude plan limits. Manage extra usage at <https://claude.ai/settings/usage>. Disable this warning in `/settings`.

Installing this extension does not silence it, and that is not a sign the extension is broken.
Pi's check looks only at which provider the selected model belongs to and whether the stored credential is an OAuth token.
It has no way to see that a provider registration is in place, so no extension can suppress it.

The warning is also not entirely wrong.
Interactive turns, compaction, and extension calls through `ctx.modelRegistry.streamSimple()` go through this extension's request shaping; requests that extensions send through pi-ai's `compat.streamSimple` do not, and for those the warning describes exactly what happens.
See [docs/architecture.md](docs/architecture.md) for the full call-path table.

This is a startup notice, not a failure.
A request that actually fails with an HTTP 400 saying `You're out of extra usage.` is a different problem — start with [Verify the extension is loaded](#verify-the-extension-is-loaded).

Pi owns the switch for this warning, so the extension leaves it alone.
Turn it off yourself with `/settings` → Warnings → "Anthropic extra usage", or set it in `~/.pi/agent/settings.json`:

```json
{
  "warnings": {
    "anthropicExtraUsage": false
  }
}
```

Because the warning concerns real billing on paths this extension does not cover, that call is yours to make; the extension will never write the setting for you.

### Pi uses the 5-hour window faster than Claude Code

The billing header this extension sends reports `cc_entrypoint=sdk-cli`.
That is the label Claude Code itself sends from its non-interactive print mode; captured from Claude Code 2.1.309:

| Claude Code mode | `cc_entrypoint` |
| --- | --- |
| `claude -p` (print mode) | `sdk-cli` |
| interactive `claude` | `cli` |

Several controlled measurements in [anthropics/claude-code#97074](https://github.com/anthropics/claude-code/issues/97074) show requests labeled `sdk-cli` (or `sdk-ts`, from the Agent SDK) using the 5-hour window about twice as fast as the interactive labels for the same tokens.
The same reports find the weekly limit apparently unaffected, so on that evidence a plan without a 5-hour window is unaffected too.
Anthropic has not said whether the weighting is intended.

The extension will not report another Anthropic client's label (`cli`, `claude-desktop`, `claude-vscode`), by default or as an option: Pi is none of those apps.
A label naming Pi itself would likely avoid the weighting, but it waits on Anthropic's answer; see [#83](https://github.com/gotgenes/pi-anthropic-auth/issues/83).

### `ANTHROPIC_API_KEY` is ignored when OAuth credentials exist

Pi's auth resolver gives stored credentials priority over environment variables.
If you have previously run `/login anthropic` and credentials are stored in `~/.pi/agent/auth.json`, Pi uses the stored OAuth token on every request — even when `ANTHROPIC_API_KEY` is also set.

To use the API key instead, run `/logout anthropic` inside Pi to remove the stored credentials, or delete `auth.json` before starting the session.

### A new model is rejected as `claude_code_version_too_old`

Anthropic gates newly released models on a minimum Claude Code version:

```text
400 invalid_request_error: Claude Code 2.1.260 does not support this model;
version 2.1.280 or newer is required.
details.error_code: claude_code_version_too_old
```

This package reports a bundled Claude Code version in the OAuth billing header, and Anthropic gates on that value.
The bundled version is a **floor**, not a fixed value: when the Pi you are running reports a newer Claude Code version in its own `user-agent`, this extension adopts it automatically for the billing header.
So upgrading Pi is usually enough to reach a newly gated model.

When Anthropic raises the floor faster than either Pi or this package ships, the extension recovers on its own.
The rejection names the required version, so the extension rebuilds the billing header at that version and retries the request once.
It remembers that version for the rest of the session, so only the first request after a floor rise pays for the rejected attempt.

If the error still reaches you, it ends with a `[pi-anthropic-auth]` hint saying what to do: raise or unset an override, set one, or upgrade Pi.
To pin the version yourself:

```bash
export PI_ANTHROPIC_AUTH_CLAUDE_CODE_VERSION=2.1.280
```

The value must be a bare `X.Y.Z` version; anything else fails fast with an explicit error.
An override is absolute: it is taken verbatim, never raised from Pi's version, and turns off automatic recovery, so a stale override can itself cause this error.
Check the current release with `npm view @anthropic-ai/claude-code dist-tags`.

Do not derive the value from a local `claude --version`.
Claude Code's `stable` release channel lags `latest`, so an installed copy is often *below* the floor a new model requires.

### `/compact` fails with a Terms of Service message

```text
Compaction failed: Turn prefix summarization failed: This request was blocked as it seems to
violate Anthropic's Terms of Service restrictions on reverse engineering or duplicating model
outputs.
```

**Fixed in pi 0.87.1. If you see this, upgrade pi.**

This was Anthropic's `reasoning_extraction` classifier responding to pi's turn-prefix summarization prompt, which asserted "This is the PREFIX of a turn that was too large to keep" while sending a transcript of only a few hundred characters, mostly model output.
On `claude-fable-5-1` that combination was refused.

Nothing in this extension caused it or fixed it: the fix is entirely upstream, in [earendil-works/pi#9908](https://github.com/earendil-works/pi/pull/9908).

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
- a local `pi` installation, version 0.86.0 or newer
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
