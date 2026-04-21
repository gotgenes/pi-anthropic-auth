# pi-anthropic-auth

Pi extension package for Anthropic Claude Pro/Max OAuth compatibility.

## Status

This repository is being bootstrapped to implement a minimal override of Pi's built-in `anthropic` provider.

The initial goal is to preserve Pi's normal Anthropic experience while adding the extra compatibility layers needed for third-party Claude Pro/Max OAuth.

The first target is a minimal override of Pi's built-in `anthropic` provider rather than a full replacement.

## Package Manager

This project uses `pnpm`.

## Development

Install dependencies:

```bash
pnpm install
```

Run a basic typecheck:

```bash
pnpm check
```

## Intended Usage

This repository is being set up as a Pi package with a TypeScript extension entrypoint declared through the `pi` manifest in `package.json`.

The package will eventually be loadable through Pi's extension and package mechanisms while preserving the native Anthropic login and model-selection workflow.

## Plan

See `docs/plans/minimal-anthropic-override.md`.
