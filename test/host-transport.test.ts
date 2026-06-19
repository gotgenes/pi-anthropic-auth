import assert from "node:assert/strict";
import { test } from "vitest";
import { resolveBuiltinAnthropicStreamSimple } from "#src/host-transport";

// This exercises the real resolution path against the installed
// `@earendil-works/pi-ai` (not a mock): `import.meta.resolve` of the root
// package, package-directory derivation, and the dynamic import of the
// concrete `dist/providers/anthropic.js`.  The registration regression test
// mocks this module out, so this is the only automated guard that the
// hardcoded provider path still lands on a module exporting
// `streamSimpleAnthropic` — a future pi-ai layout change fails here at test
// time instead of only at runtime under the live loader (Issue #28).
test("resolveBuiltinAnthropicStreamSimple resolves the built-in transport", async () => {
  const transport = await resolveBuiltinAnthropicStreamSimple();

  assert.equal(typeof transport, "function");
});
