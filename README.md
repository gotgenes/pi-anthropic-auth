# pi-anthropic-auth

[![npm version](https://img.shields.io/npm/v/@gotgenes/pi-anthropic-auth?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@gotgenes/pi-anthropic-auth)
[![CI](https://img.shields.io/github/actions/workflow/status/gotgenes/pi-anthropic-auth/ci.yml?style=flat&logo=github&label=CI)](https://github.com/gotgenes/pi-anthropic-auth/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9-F69220?style=flat&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Pi Package](https://img.shields.io/badge/Pi-Package-6366F1?style=flat)](https://pi.mariozechner.at/)

A [Pi](https://pi.mariozechner.at/) extension that improves compatibility with Anthropic Claude Pro/Max OAuth (i.e., your Claude subscription) while preserving Pi's normal Anthropic behavior.

## What It Does

Pi works great with Anthropic API keys out of the box.
This extension fills in the gaps for users who want to use their **Claude Pro or Max subscription** via OAuth instead.

It keeps everything you'd expect — the built-in `anthropic` provider, the full model list, API-key behavior, and the native `/login anthropic` flow — and layers on the compatibility fixes needed to make OAuth subscriptions work reliably.

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

## Similar Projects

- [opencode-anthropic-auth](https://github.com/ex-machina-co/opencode-anthropic-auth/) — Anthropic OAuth compatibility work for [OpenCode](https://opencode.ai/).
- [pi-anthropic-oauth](https://github.com/leohenon/pi-anthropic-oauth) — a Pi extension that takes a fuller provider-override approach.

For notes on how this project compares to similar work, see [docs/comparison-to-similar-projects.md](docs/comparison-to-similar-projects.md).

## Acknowledgments

This project was inspired by [opencode-anthropic-auth](https://github.com/ex-machina-co/opencode-anthropic-auth/), which solved the same Anthropic OAuth compatibility problem for [OpenCode](https://opencode.ai/).

## License

MIT
