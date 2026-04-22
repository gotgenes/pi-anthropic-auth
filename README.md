# pi-anthropic-auth

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-anthropic-auth?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-anthropic-auth)
[![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-anthropic-auth/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-anthropic-auth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

Minimal Pi extension package for Anthropic Claude Pro/Max OAuth compatibility.

## Purpose

This package minimally overrides Pi's built-in `anthropic` provider to improve Claude Pro/Max OAuth compatibility while preserving Pi's normal Anthropic behavior wherever possible.

The design goal is to preserve:

1. built-in provider name: `anthropic`
2. built-in model list
3. normal Anthropic API-key behavior
4. native `/login anthropic` UX

## Current Behavior

The extension currently does the following:

1. re-registers the built-in `anthropic` provider with only an `oauth` override
2. reuses Pi's native Anthropic login and refresh helpers from `@mariozechner/pi-ai/oauth`
3. preserves the old refresh token when refresh responses omit `refresh_token`
4. shapes OAuth Anthropic request payloads through `before_provider_request`
5. prepends the Anthropic billing/content-consistency header block to `system[]`
6. avoids adding `cache_control` to the injected billing block
7. normalizes assistant `[tool_use..., text]` ordering for Anthropic OAuth payloads
8. replaces Pi's default prompt body with a minimal neutral prompt for Anthropic OAuth when the default Pi harness prompt is detected, while preserving project context

The extension does not currently replace Pi's built-in Anthropic streaming transport.

## Install

```bash
pi install npm:@gotgenes/pi-anthropic-auth
```

To try it without permanently installing:

```bash
pi -e npm:@gotgenes/pi-anthropic-auth
```

## Usage Notes

1. `/login anthropic` should continue using Pi's native Anthropic UX.
2. API-key Anthropic behavior should remain the baseline behavior.
3. The extension's compatibility logic is intended to affect only Anthropic OAuth requests.

## Development

### Requirements

1. `pnpm`
2. a local `pi` installation
3. Anthropic OAuth credentials configured through Pi

### Install Dependencies

```bash
pnpm install
```

### Typecheck

```bash
pnpm run check
```

### Run Tests

```bash
pnpm test
```

### Build

```bash
pnpm run build
```

### Load Local Build In Pi

```bash
pi -e /absolute/path/to/pi-anthropic-auth/dist/index.js
```

### Fast Repro Loop

The most useful non-interactive repro loop is:

```bash
pi \
  --model anthropic/claude-sonnet-4-6 \
  --no-session \
  --tools read,grep,find,ls \
  -e /Users/chris/development/pi-anthropic-auth/dist/index.js \
  -p "How many lines are in @AGENTS.md ?"
```

That path was used to validate:

1. simple prompts
2. tool use
3. multi-turn continuation
4. structured output
5. expired-token refresh

## Project Skills

Project-local skills live in `.agents/skills/`:

1. `anthropic`: Anthropic OAuth debugging workflow and lessons learned
2. `pi-cli-repro`: repeatable `pi -p ... -e ...` repro workflow
3. `frontmatter`: Pi skill frontmatter template and rules

## Key Files

1. `src/index.ts`
2. `src/anthropic-oauth.ts`
3. `src/request-shaping.ts`
4. `src/system-prompt-shaping.ts`
5. `docs/plans/minimal-anthropic-override.md`
6. `docs/plans/gap-analysis-and-next-steps.md`
7. `AGENTS.md`
8. `.agents/skills/`

## Acknowledgments

This project was inspired by [opencode-anthropic-auth](https://github.com/ex-machina-co/opencode-anthropic-auth/), which solved the same Anthropic OAuth compatibility problem for [OpenCode](https://opencode.ai/).

## License

MIT
