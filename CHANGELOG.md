# Changelog

## [2.0.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v1.0.0...v2.0.0) (2026-07-17)


### ⚠ BREAKING CHANGES

* Pi 0.80.0 through 0.80.7 hosts are no longer supported; upgrade to @earendil-works/pi-coding-agent@0.80.8 or later.  Dropping the oauth override also removes the mergeRefreshedCredentials refresh-token guard that preserved a rotated refresh_token when the refresh response omitted one; Pi's built-in anthropicOAuth now owns login and refresh, and recovery from a dropped rotation token is a manual /login anthropic.

### Bug Fixes

* require @earendil-works/pi-ai and pi-coding-agent &gt;=0.80.8 ([6e84d5d](https://github.com/gotgenes/pi-anthropic-auth/commit/6e84d5d5f5cfea1fae3266302b2844f2ffcac4e0))
* restore /login on Pi 0.80.8 by dropping the removed-API oauth override ([9624771](https://github.com/gotgenes/pi-anthropic-auth/commit/9624771dc2987ec18229a23f71667dce5221d9c5))


### Documentation

* caveat upstream oauth-override note after Issue [#43](https://github.com/gotgenes/pi-anthropic-auth/issues/43) ([0178c8c](https://github.com/gotgenes/pi-anthropic-auth/commit/0178c8c789310c6651f2bb3be5392fcc9d4d487e))
* document the registerProvider merge migration hazard for [#43](https://github.com/gotgenes/pi-anthropic-auth/issues/43) ([8f5618b](https://github.com/gotgenes/pi-anthropic-auth/commit/8f5618bb25bd02c5459c4697da7d5fefce4d28f2))
* drop OAuth override references after delegating login/refresh to Pi ([8f12fc2](https://github.com/gotgenes/pi-anthropic-auth/commit/8f12fc21da9650481c296eb683cdb5c965d9d260))
* plan re-enabling pi-anthropic-auth on Pi 0.80.8+ ([#43](https://github.com/gotgenes/pi-anthropic-auth/issues/43)) ([07df94d](https://github.com/gotgenes/pi-anthropic-auth/commit/07df94d564243b1eab50de4758ba1f4c295af55c))
* **retro:** add build stage notes for issue [#43](https://github.com/gotgenes/pi-anthropic-auth/issues/43) ([cf8fee1](https://github.com/gotgenes/pi-anthropic-auth/commit/cf8fee11ad90abc35f276e5fae45918317d67b4f))
* **retro:** add planning stage notes for issue [#43](https://github.com/gotgenes/pi-anthropic-auth/issues/43) ([cb3c506](https://github.com/gotgenes/pi-anthropic-auth/commit/cb3c506c459784ea1f63a2548250bd78d3cb0da6))
* **retro:** add retro notes for issue [#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40) ([b4dd58b](https://github.com/gotgenes/pi-anthropic-auth/commit/b4dd58bc19bd4aa1ccd4ead8af7b68f2f64e2284))

## [1.0.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.7.0...v1.0.0) (2026-06-29)


### ⚠ BREAKING CHANGES

* pi 0.79.x hosts are no longer supported. Upgrade pi to 0.80.0 or later. pi-anthropic-auth 0.6.3 remains usable on pi 0.79.x as a fallback. Refs #40.

### Bug Fixes

* require pi-ai/pi-coding-agent &gt;=0.80.0 to fix multi-turn OAuth 400 ([#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40)) ([1cdd14e](https://github.com/gotgenes/pi-anthropic-auth/commit/1cdd14eb922f01fc093ee6cb007cbfabf6da17ef))


### Documentation

* drop pi 0.79.x dual-layout notes after raising the floor ([#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40)) ([3a7fed9](https://github.com/gotgenes/pi-anthropic-auth/commit/3a7fed97d78495fc5c74af6d2a58e949e9283c09))
* plan raising host floor to pi-ai 0.80.0 to fix multi-turn OAuth 400 ([#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40)) ([3a49518](https://github.com/gotgenes/pi-anthropic-auth/commit/3a495180f96a684c08afc774c659d63497d779d5))
* **retro:** add build stage notes for issue [#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40) ([afe0077](https://github.com/gotgenes/pi-anthropic-auth/commit/afe00775cd9b063370c90241f98194cc69947041))
* **retro:** add planning stage notes for issue [#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40) ([d8377ec](https://github.com/gotgenes/pi-anthropic-auth/commit/d8377ec9d1569033a6efd2dac83c9d2ea566267e))
* **retro:** add retro notes for issue [#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37) ([63ea6e0](https://github.com/gotgenes/pi-anthropic-auth/commit/63ea6e0f51434d0dd82d0b4293f9860bee3b2e42))
* scope host-transport resolution to the pi-ai 0.80.x compat entry ([#40](https://github.com/gotgenes/pi-anthropic-auth/issues/40)) ([87987b8](https://github.com/gotgenes/pi-anthropic-auth/commit/87987b8d2ba2299305f5967107195ccc7ad32003))

## [0.7.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.5...v0.7.0) (2026-06-26)


### Features

* add anthropic-auth:status command handler ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([7a6d352](https://github.com/gotgenes/pi-anthropic-auth/commit/7a6d3529891b2998707fa766931318dcc2d73343))
* add diagnostics report formatter ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([7134b0c](https://github.com/gotgenes/pi-anthropic-auth/commit/7134b0cadcc9ed52bbdf7be7e173dadb352e2ec5))
* register /anthropic-auth:status diagnostics command ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([b022ca3](https://github.com/gotgenes/pi-anthropic-auth/commit/b022ca36f422588b13b3d6af4401c1dcb203406b))


### Documentation

* document container auth precedence and the diagnostics command ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([29abb77](https://github.com/gotgenes/pi-anthropic-auth/commit/29abb77e216b1d48746a6d5e4daeb4f367713fb1))
* fix command name in diagnostics JSDoc comment ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([e271d3e](https://github.com/gotgenes/pi-anthropic-auth/commit/e271d3e22c470064fdb6adf72434c8543cfd9f93))
* plan diagnostics command and container auth-precedence docs ([#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37)) ([39d939c](https://github.com/gotgenes/pi-anthropic-auth/commit/39d939c3a6395179a31cb8695755e87ebac84bc7))
* **retro:** add planning stage notes for issue [#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37) ([4f4da8e](https://github.com/gotgenes/pi-anthropic-auth/commit/4f4da8edd6fb3a1343794514c243ef330fdcde2c))
* **retro:** add retro notes for issue [#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31) ([989c945](https://github.com/gotgenes/pi-anthropic-auth/commit/989c945ec095f4b2999f33cbcc4912de33632182))
* **retro:** add TDD stage notes for issue [#37](https://github.com/gotgenes/pi-anthropic-auth/issues/37) ([459188e](https://github.com/gotgenes/pi-anthropic-auth/commit/459188e52f02146d83d5163cf4e3a9e3cbba1ec5))

## [0.6.5](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.4...v0.6.5) (2026-06-26)


### Bug Fixes

* resolve built-in Anthropic transport via bare-root import ([#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31)) ([ee3013a](https://github.com/gotgenes/pi-anthropic-auth/commit/ee3013ab44ace44a129f6c4a30de597332c77d65))


### Documentation

* clarify bare-root import keeps the &gt;=0.79.1 peer floor ([#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31)) ([f061fa6](https://github.com/gotgenes/pi-anthropic-auth/commit/f061fa615b6032c4772e3cf7df51d511642ce5e0))
* describe bare-root host-transport resolution ([#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31)) ([4dcdbba](https://github.com/gotgenes/pi-anthropic-auth/commit/4dcdbba04d11957e2eda171a3e5a3eb79cad2877))
* plan bare-root host-transport import fix ([#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31)) ([f07d96e](https://github.com/gotgenes/pi-anthropic-auth/commit/f07d96e5b32685952f0d118f3dfb6113f0b4a346))
* **retro:** add planning stage notes for issue [#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31) ([be88420](https://github.com/gotgenes/pi-anthropic-auth/commit/be88420358dd048c5da0f538d23d3bcbc29d21e6))
* **retro:** add retro notes for issue [#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35) ([17f9e3f](https://github.com/gotgenes/pi-anthropic-auth/commit/17f9e3f0970814016f2e88fc271d1d5ea96d4a86))
* **retro:** add TDD stage notes for issue [#31](https://github.com/gotgenes/pi-anthropic-auth/issues/31) ([6fb64cc](https://github.com/gotgenes/pi-anthropic-auth/commit/6fb64cc3d61e1a77b4f61986c047dae8c4c0e2f2))

## [0.6.4](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.3...v0.6.4) (2026-06-26)


### Documentation

* add upstream brief for a provider-bound payload transform ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([98cead6](https://github.com/gotgenes/pi-anthropic-auth/commit/98cead67b2db8e8c389c972a4b0f4255dd395294))
* cite upstream prior art (supersedes pi[#4980](https://github.com/gotgenes/pi-anthropic-auth/issues/4980), precedent pi[#3262](https://github.com/gotgenes/pi-anthropic-auth/issues/3262)) ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([bd53b09](https://github.com/gotgenes/pi-anthropic-auth/commit/bd53b09960956b627e2368977cb6f8e0106676df))
* cross-reference the transport seam decision record from architecture ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([854fecd](https://github.com/gotgenes/pi-anthropic-auth/commit/854fecdb5255eb459df05ac03fd01e7e7804eebb))
* link the decision record from the upstream brief ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([687a766](https://github.com/gotgenes/pi-anthropic-auth/commit/687a7663ed7e29347476e026a1c31e17b643ba45))
* plan transport seam gap doc + upstream brief ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([f53e68b](https://github.com/gotgenes/pi-anthropic-auth/commit/f53e68b601552d72e237ca9952d04de3700c16ad))
* record the OAuth payload-shaping seam gap and near-term direction ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([3c92752](https://github.com/gotgenes/pi-anthropic-auth/commit/3c92752b438d115f2e3aa1505ce1e69d20a0fba0))
* record upstream filing as pi[#6089](https://github.com/gotgenes/pi-anthropic-auth/issues/6089) ([#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35)) ([eda6eb0](https://github.com/gotgenes/pi-anthropic-auth/commit/eda6eb01ae2bab17efa95dd734ab740dc5d7f769))
* **retro:** add build stage notes for issue [#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35) ([67b451f](https://github.com/gotgenes/pi-anthropic-auth/commit/67b451f3fc1e63d0a80043a62063ca8508da5a4b))
* **retro:** add planning stage notes for issue [#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35) ([f71e6b6](https://github.com/gotgenes/pi-anthropic-auth/commit/f71e6b631c97303ead5b6772a3e8c44ad15b33c5))
* **retro:** add retro notes for issue [#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33) ([1b9855f](https://github.com/gotgenes/pi-anthropic-auth/commit/1b9855f993a778e580ed9f03376c2847b9f1c03e))
* **retro:** note upstream prior-art search for issue [#35](https://github.com/gotgenes/pi-anthropic-auth/issues/35) ([34e115d](https://github.com/gotgenes/pi-anthropic-auth/commit/34e115d0bdc11bc6defa724023911e936bbe81f4))

## [0.6.3](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.2...v0.6.3) (2026-06-23)


### Bug Fixes

* resolve built-in Anthropic transport across pi-ai layout change ([#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33)) ([9fcdc28](https://github.com/gotgenes/pi-anthropic-auth/commit/9fcdc287137500df03b78feb93464aa60409ea61))


### Documentation

* describe dual-layout host-transport resolution ([#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33)) ([4217f35](https://github.com/gotgenes/pi-anthropic-auth/commit/4217f35d25baa85d2b40ad72db1b7f916457e8a2))
* plan dual-layout host-transport resolution ([#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33)) ([d6e7a4e](https://github.com/gotgenes/pi-anthropic-auth/commit/d6e7a4e3942478c42968dd39fc698067811a75fa))
* remove version-specific streamSimpleAnthropic from AGENTS.md ([#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33)) ([3bb330f](https://github.com/gotgenes/pi-anthropic-auth/commit/3bb330f16163dc75d5a014b5b44f4dbdc492c3ed))
* **retro:** add planning stage notes for issue [#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33) ([2f93524](https://github.com/gotgenes/pi-anthropic-auth/commit/2f9352405f11556c77aa148a4a1c688ce08a4ba5))
* **retro:** add retro notes for issue [#27](https://github.com/gotgenes/pi-anthropic-auth/issues/27) ([abe718f](https://github.com/gotgenes/pi-anthropic-auth/commit/abe718f99a304b63caf2887f0f23f7345ae4450b))
* **retro:** add TDD stage notes for issue [#33](https://github.com/gotgenes/pi-anthropic-auth/issues/33) ([aac077e](https://github.com/gotgenes/pi-anthropic-auth/commit/aac077ef3c5bc178b7319cb23e4bb6fdd92b5575))

## [0.6.2](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.1...v0.6.2) (2026-06-19)


### Bug Fixes

* set usesCallbackServer on anthropicOAuthOverride ([ae2996f](https://github.com/gotgenes/pi-anthropic-auth/commit/ae2996f0507e0432f1d7f05a057c0299c90e052c))


### Documentation

* **pr-review:** triage PR [#27](https://github.com/gotgenes/pi-anthropic-auth/issues/27) → adopt-as-is ([ae34ece](https://github.com/gotgenes/pi-anthropic-auth/commit/ae34eced8f35722a08859bb04e8a92693ad04dca))
* **retro:** add retro notes for issue [#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28) ([f605a36](https://github.com/gotgenes/pi-anthropic-auth/commit/f605a360e6e36a43354b7f3d669a59674871361c))

## [0.6.1](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.6.0...v0.6.1) (2026-06-19)


### Bug Fixes

* import streamSimpleAnthropic directly to avoid lazy re-register clobber ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([c7b8078](https://github.com/gotgenes/pi-anthropic-auth/commit/c7b8078e6122cbd6e6e4fc2090fba4b5a0cee31a))
* resolve built-in Anthropic transport at runtime for jiti loader ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([8ba196e](https://github.com/gotgenes/pi-anthropic-auth/commit/8ba196e0565209a5507b69e5b1da470f64844d6c))
* use pathToFileURL for provider module resolution ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([27301da](https://github.com/gotgenes/pi-anthropic-auth/commit/27301da9656cf05523f6ed7dd63fec4576710a3f))


### Documentation

* describe anchor-driven prompt sanitizer that preserves extension contributions ([#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10)) ([ec64b66](https://github.com/gotgenes/pi-anthropic-auth/commit/ec64b6682f7acb0e730db7b6917888bd6af42e92))
* describe runtime host-transport resolution for jiti loader ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([bfecd63](https://github.com/gotgenes/pi-anthropic-auth/commit/bfecd6367d62b9df468f8d0e921f9eb2ba885376))
* fix stale index.ts description in architecture related-files ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([4e65899](https://github.com/gotgenes/pi-anthropic-auth/commit/4e65899b3bf9f34a9492fcd4d70cb78852268238))
* plan fix for pi-ai 0.79.8 lazy registration clobber ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([26aa85e](https://github.com/gotgenes/pi-anthropic-auth/commit/26aa85ee785ccd8baa597332646b1cc5699e8f0f))
* plan sanitizer close-out for extension snippets and guidelines ([#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10)) ([d1813ee](https://github.com/gotgenes/pi-anthropic-auth/commit/d1813eec1c6b21c644799ced628ccb293a58c6c4))
* **retro:** add build stage notes for issue [#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10) ([47d1696](https://github.com/gotgenes/pi-anthropic-auth/commit/47d1696bc82893923ca914454a88ea4726956235))
* **retro:** add planning stage notes for issue [#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10) ([dfcf0a2](https://github.com/gotgenes/pi-anthropic-auth/commit/dfcf0a2cc406f4f936f149e48ad3bdc330b7284f))
* **retro:** add planning stage notes for issue [#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28) ([b548477](https://github.com/gotgenes/pi-anthropic-auth/commit/b5484776c03cdc4b1bc92632460bd20706b52bc2))
* **retro:** add retro notes for issue [#10](https://github.com/gotgenes/pi-anthropic-auth/issues/10) ([a495775](https://github.com/gotgenes/pi-anthropic-auth/commit/a495775a48a87355f405a87eb1e308e2734f8c39))
* **retro:** add retro notes for issue [#23](https://github.com/gotgenes/pi-anthropic-auth/issues/23) ([34de7f7](https://github.com/gotgenes/pi-anthropic-auth/commit/34de7f7b545283672bf628d08b27a540e6731fdc))
* **retro:** add runtime-resolution stage notes for issue [#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28) ([8a58432](https://github.com/gotgenes/pi-anthropic-auth/commit/8a5843210d480c3c68aa018063b95dec8a19e9a1))
* **retro:** add TDD stage notes for issue [#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28) ([9303393](https://github.com/gotgenes/pi-anthropic-auth/commit/9303393f1082c979382b10dc2a4ea2cbe90aeffd))
* **retro:** note post-review polish for issue [#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28) ([2a38838](https://github.com/gotgenes/pi-anthropic-auth/commit/2a38838edf9a50b064450f727368d4091c08e5d6))
* reword oauth-transport JSDoc for direct-import delegate ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([2d6e7ec](https://github.com/gotgenes/pi-anthropic-auth/commit/2d6e7ecf8ea851233326fdb72119e8e3592ec926))
* update architecture for direct-import transport delegate ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([d42b2a8](https://github.com/gotgenes/pi-anthropic-auth/commit/d42b2a805f25ecea2a4dc44bc6569768230ff73b))


### Miscellaneous Chores

* load local extension copy and suppress global npm package ([#28](https://github.com/gotgenes/pi-anthropic-auth/issues/28)) ([51e5bf9](https://github.com/gotgenes/pi-anthropic-auth/commit/51e5bf90deaeb293bdb485365485a1febe7e7c80))

## [0.6.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.5.1...v0.6.0) (2026-06-18)


### Features

* add adapted workflow prompt subset from pi-packages ([792a3f4](https://github.com/gotgenes/pi-anthropic-auth/commit/792a3f4ebd06c08f9420afcfe5bbf58e620288f5))
* add fallow, pre-completion skills and pre-completion-reviewer agent ([6fde1d7](https://github.com/gotgenes/pi-anthropic-auth/commit/6fde1d7ad3b800eefa240db938e080b7b8feed3d))


### Bug Fixes

* bump Claude Code version to 2.1.169 in billing header ([c0b7617](https://github.com/gotgenes/pi-anthropic-auth/commit/c0b76171254bedbcc373ef7c9209f49199a28cff))


### Documentation

* document .pi prompts, agents, and fallow/github-tools in AGENTS.md ([739b228](https://github.com/gotgenes/pi-anthropic-auth/commit/739b2281ebe8c0055db24b7c12a462c21b44ced3))
* plan reducing duplicated test setup flagged by fallow ([#23](https://github.com/gotgenes/pi-anthropic-auth/issues/23)) ([da85f5b](https://github.com/gotgenes/pi-anthropic-auth/commit/da85f5ba0138b7cee4a2eb46080357ac7ca2ed3f))
* port plan-driven release batching from pi-packages ([#434](https://github.com/gotgenes/pi-anthropic-auth/issues/434)) ([5b1f1b0](https://github.com/gotgenes/pi-anthropic-auth/commit/5b1f1b0681e924b742f6c379adc1a55493e9e849))
* **retro:** add build stage notes for issue [#23](https://github.com/gotgenes/pi-anthropic-auth/issues/23) ([dd3d7d0](https://github.com/gotgenes/pi-anthropic-auth/commit/dd3d7d09f9936a3e70198c90a867bdefa1e27d2b))
* **retro:** add planning stage notes for issue [#23](https://github.com/gotgenes/pi-anthropic-auth/issues/23) ([59de205](https://github.com/gotgenes/pi-anthropic-auth/commit/59de20503ea7dbe9a0c9057be571528de6e7fec7))
* sync mermaid and pi-extension-lifecycle skills from pi-packages ([7673a25](https://github.com/gotgenes/pi-anthropic-auth/commit/7673a2574c61b0d9c2ab42ebb5ca9d057956c109))
* sync shared workflow skills from pi-packages ([059a182](https://github.com/gotgenes/pi-anthropic-auth/commit/059a18264dd3fec9f77503210d296c79ae6397f2))


### Miscellaneous Chores

* migrate skills to .pi/skills and wire up fallow ([7e280b4](https://github.com/gotgenes/pi-anthropic-auth/commit/7e280b49353b56e4c1ae607786336add94048126))

## [0.5.1](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.5.0...v0.5.1) (2026-06-11)


### Bug Fixes

* shape Anthropic OAuth requests at the transport layer ([a8c2015](https://github.com/gotgenes/pi-anthropic-auth/commit/a8c2015c293c6b60d1110f73620dd3825057c6e6))


### Documentation

* document the OAuth transport-wrapper architecture ([6ce28a4](https://github.com/gotgenes/pi-anthropic-auth/commit/6ce28a484189a3f1500bc0eb3e18c87fcb1e5c6f))
* note prek rumdl-fmt pre-commit hook in markdown-conventions skill ([5838075](https://github.com/gotgenes/pi-anthropic-auth/commit/58380753961e3fa1bb0b10c1cd72ca936b926e48))
* port reusable skills from pi-packages ([1e606a9](https://github.com/gotgenes/pi-anthropic-auth/commit/1e606a97d2dfd509ad4b8c5b29f9b2eea2771afc))


### Miscellaneous Chores

* bump dependencies and establish Pi 0.79.1 base ([62696c9](https://github.com/gotgenes/pi-anthropic-auth/commit/62696c97934a3bdbd67091fb30ee2af7d8959f8b))

## [0.5.0](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.6...v0.5.0) (2026-05-24)


### Features

* add ESLint with type-aware rules matching pi-packages ([645e145](https://github.com/gotgenes/pi-anthropic-auth/commit/645e14517681c3ff37e798a5d8c8db94374b3fa1))


### Documentation

* clarify that non-OAuth requests pass through untouched ([1706c1f](https://github.com/gotgenes/pi-anthropic-auth/commit/1706c1f188af2dee2ec1229596d169e61ff2f0a4))
* update AGENTS.md for new build and import conventions ([01c923a](https://github.com/gotgenes/pi-anthropic-auth/commit/01c923a41405641485ec95f454d4962058a8d72f))


### Miscellaneous Chores

* bump CLAUDE_CODE_VERSION to 2.1.150 ([76081d2](https://github.com/gotgenes/pi-anthropic-auth/commit/76081d2f57b2809ef7eba49bc7703b55689129f2))
* bump pi packages to 0.75.5 and update tooling deps ([23e360d](https://github.com/gotgenes/pi-anthropic-auth/commit/23e360d408640e12b65ff92bd9ac8a893444bcec))
* update linting toolchain to match pi-packages ([40ddc5a](https://github.com/gotgenes/pi-anthropic-auth/commit/40ddc5aa6f9f18b69a6340c0bcf1a92c8614cbd8))
* update pnpm ([629f2b7](https://github.com/gotgenes/pi-anthropic-auth/commit/629f2b78c8730a2a64f1941d0d1607c6bd6ef7c3))

## [0.4.6](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.5...v0.4.6) (2026-05-08)


### Bug Fixes

* bump CLAUDE_CODE_VERSION to 2.1.119 ([119e8e5](https://github.com/gotgenes/pi-anthropic-auth/commit/119e8e5b6c725dd20907747d52852b15bbeafc83))

## [0.4.5](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.4...v0.4.5) (2026-05-08)


### Bug Fixes

* pin pnpm to 11.0.6 via packageManager field ([0fa7cea](https://github.com/gotgenes/pi-anthropic-auth/commit/0fa7cea1e1622db75448c4d8ccebc730daf7b021))

## [0.4.4](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.3...v0.4.4) (2026-05-08)


### Miscellaneous Chores

* approve build of "@google/genai" ([30d595e](https://github.com/gotgenes/pi-anthropic-auth/commit/30d595e0168a038aae45d8c4e338a96b5c168bf6))
* update dev dependencies to latest ([c5c6d69](https://github.com/gotgenes/pi-anthropic-auth/commit/c5c6d6921b108b63f70aa2280852b9ede3926cc2))

## [0.4.3](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.2...v0.4.3) (2026-05-08)


### Miscellaneous Chores

* migrate from [@mariozechner](https://github.com/mariozechner) to [@earendil-works](https://github.com/earendil-works) pi packages ([e36ab59](https://github.com/gotgenes/pi-anthropic-auth/commit/e36ab598733a2ff6501d007363a4398fff15140c))

## [0.4.2](https://github.com/gotgenes/pi-anthropic-auth/compare/v0.4.1...v0.4.2) (2026-05-02)


### Documentation

* update badge to pnpm 10 ([77b0ae8](https://github.com/gotgenes/pi-anthropic-auth/commit/77b0ae8964ef857d4094df09bf099dc27dc862a4))


### Miscellaneous Chores

* bump CLAUDE_CODE_VERSION to 2.1.112 ([be65bc8](https://github.com/gotgenes/pi-anthropic-auth/commit/be65bc85822bc1752bc0d75bd2fd44cca7da8342))

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
