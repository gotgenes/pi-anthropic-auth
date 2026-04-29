# Changelog

## [0.4.2](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.1...v0.4.2) (2026-04-29)


### Documentation

* update badge to pnpm 10 ([77b0ae8](https://github.com/gotgenes/pi-anthropic-auth/commit/77b0ae8964ef857d4094df09bf099dc27dc862a4))

## [0.4.1](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.0...v0.4.1) (2026-04-27)


### Bug Fixes

* refine OAuth prompt shaping and add debug logging ([7c2b2af](https://github.com/gotgenes/pi-anthropic-auth/commit/7c2b2afb351a18fbb3569b8552d59a9d321ef7f8))


### Documentation

* add comparison notes for similar Anthropic OAuth projects ([b6ab2de](https://github.com/gotgenes/pi-anthropic-auth/commit/b6ab2defa7f7b220d159692ed39598a84d8a8197))
* add final pull step after release merge ([9f33ca4](https://github.com/gotgenes/pi-anthropic-auth/commit/9f33ca4d06813a1a35a0821e77b7f951e775edb3))
* add git workflow and Haiku repro guidance ([a2a193a](https://github.com/gotgenes/pi-anthropic-auth/commit/a2a193a03ded63029009a57de197759ccf00d816))
* capture repo workflow and model alias gotchas ([99aa8f6](https://github.com/gotgenes/pi-anthropic-auth/commit/99aa8f6e80b40e28c5c8ee67d87aef2205459b75))
* clarify release-please end-of-workflow ([c1f83a6](https://github.com/gotgenes/pi-anthropic-auth/commit/c1f83a63691f4403e9c8333c85b87e6d9f07a68b))
* refine release workflow steps ([17480a1](https://github.com/gotgenes/pi-anthropic-auth/commit/17480a1d8605d2273e21ddc5754b546d87c0ab73))
* require explicit PR number for release merge ([59a8665](https://github.com/gotgenes/pi-anthropic-auth/commit/59a86655d9e02fe3ab45b0484975fcbf4211ab1e))


### Miscellaneous Chores

* remove pi-ask-user package ([0e51ce0](https://github.com/gotgenes/pi-anthropic-auth/commit/0e51ce05f87019bd063d99dd05e011876fe8bd68))

## [0.4.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.3.0...v0.4.0) (2026-04-25)


### Features

* adopt anchor-driven sanitizer for system prompt shaping (issue [#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10)) ([f740a35](https://github.com/gotgenes/pi-anthropic-auth/commit/f740a3524e255b9153227e1f67eef342a5b57196))


### Bug Fixes

* preserve content appended after Pi default preamble for OAuth shaping ([52b2ca8](https://github.com/gotgenes/pi-anthropic-auth/commit/52b2ca83903d84c63471841c6ff90f3971c8643d)), closes [#9](https://github.com/gotgenes/pi-anthropic-auth/issues/9)
* remove body-level anthropic-beta injection that caused 400 rejection ([4ab21db](https://github.com/gotgenes/pi-anthropic-auth/commit/4ab21dbafd30f2e1d8190370cfa04a7417e5f2c5))


### Documentation

* refresh AGENTS.md testing guidance for vitest harness ([ed1b344](https://github.com/gotgenes/pi-anthropic-auth/commit/ed1b3444e001dbff74ee5197d1c37b4fe21f7602))


### Miscellaneous Chores

* switch test runner from node:test to vitest ([e0200f9](https://github.com/gotgenes/pi-anthropic-auth/commit/e0200f9308b5ee2cb31a085ac1aa256ccc3f95dd))

## [0.3.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.2.1...v0.3.0) (2026-04-24)


### Features

* add ask_user tool via pi-ask-user plugin ([8cb181a](https://github.com/gotgenes/pi-anthropic-auth/commit/8cb181a6824074f9fe3ad1f0e16bf608f3a99f68))


### Bug Fixes

* always inject required OAuth betas regardless of upstream anthropic-beta header ([a048535](https://github.com/gotgenes/pi-anthropic-auth/commit/a048535098d5ed8cfd189ac9c6e146e044b135b1))
* bump CLAUDE_CODE_VERSION to 2.1.108 ([641c406](https://github.com/gotgenes/pi-anthropic-auth/commit/641c40628f9c665790da9f3ebbab492d133b1f78))


### Documentation

* add Conventional Commits guidelines to AGENTS.md ([72dc990](https://github.com/gotgenes/pi-anthropic-auth/commit/72dc990e154a708600902ed95a11c5d6e8a45c4d))
* simplify README to focus on what, not how ([2becbd8](https://github.com/gotgenes/pi-anthropic-auth/commit/2becbd8b5c23a06ba2b52e39c5513bea4a311d6f))

## [0.2.1](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.2.0...v0.2.1) (2026-04-22)


### Documentation

* add badges and acknowledgments to README ([e963e64](https://github.com/gotgenes/pi-anthropic-auth/commit/e963e642414e73e1724d7ee3e28bc00cc9a73e5b))


### Miscellaneous Chores

* upgrade TypeScript 5 -&gt; 6.0.3 ([bd227e0](https://github.com/gotgenes/pi-anthropic-auth/commit/bd227e0bfd8165d7dd68a517fd405f1bb1ecb33a))

## [0.2.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.1.0...v0.2.0) (2026-04-22)


### Features

* add minimal anthropic oauth compatibility override ([092da47](https://github.com/gotgenes/pi-anthropic-auth/commit/092da47c6390dff82cbf98b0e42acc473b69e41a))


### Bug Fixes

* avoid extra cached anthropic billing block ([a0e1c7e](https://github.com/gotgenes/pi-anthropic-auth/commit/a0e1c7eb70676e703bf5d7d4945ebf5211bd8a1e))
* move system prompt shaping into before_provider_request ([23e68e5](https://github.com/gotgenes/pi-anthropic-auth/commit/23e68e5c5e18a32846c17f9098e363eef91a6cbe))
* stabilize anthropic oauth prompt and payload shaping ([52819a9](https://github.com/gotgenes/pi-anthropic-auth/commit/52819a941573c64e440fddbcc4a828c4fa30609a))
* sync lockfile with package.json dependencies ([8db4a45](https://github.com/gotgenes/pi-anthropic-auth/commit/8db4a458a05d97b3e829b453f3093c90fd9a30a5))


### Documentation

* fix license copyright year ([75c2995](https://github.com/gotgenes/pi-anthropic-auth/commit/75c29954ea5b62f977be910eb174953a0abe07ce))
* update README with pi install instructions and NPM usage ([5cbdab8](https://github.com/gotgenes/pi-anthropic-auth/commit/5cbdab84017e619984dcccf8aa38e8e30fb0871c))


### Miscellaneous Chores

* fix prek hook ordering and add auto-fix flags ([204676d](https://github.com/gotgenes/pi-anthropic-auth/commit/204676d4c12732cee42c0110ce5d5e7bee54534b))
