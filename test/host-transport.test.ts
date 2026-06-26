import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { PiAiNamespace } from "#src/host-transport";
import {
  pickAnthropicStreamSimple,
  resolveBuiltinAnthropicStreamSimple,
} from "#src/host-transport";

// This exercises the real resolution path against the installed
// `@earendil-works/pi-ai` (not a mock): a bare-root `import(...)` of the
// package, resolving to the installed 0.79.1 root under vitest's Node
// resolver, then reading `streamSimpleAnthropic` off the namespace.  The
// registration regression test mocks this module out, so this is the only
// automated guard that the root namespace still exposes the expected function
// for the installed version — a future pi-ai that drops `streamSimpleAnthropic`
// fails here at test time.  Note: vitest resolves the devDependency root, not
// the host's aliased/virtualized entrypoint, so this does not by itself prove
// the `pi install` / Bun loader fix — the live `pi -e` repro does (Issue #28,
// Issue #31).
test("resolveBuiltinAnthropicStreamSimple resolves the built-in transport", async () => {
  const transport = await resolveBuiltinAnthropicStreamSimple();

  assert.equal(typeof transport, "function");
});

describe("pickAnthropicStreamSimple", () => {
  function fakeTransport(): void {
    /* placeholder function used as a stand-in for the real streamSimple */
  }

  test("returns the streamSimpleAnthropic export when it is a function", () => {
    const namespace: PiAiNamespace = { streamSimpleAnthropic: fakeTransport };

    const result = pickAnthropicStreamSimple(namespace);

    assert.equal(result, fakeTransport);
  });

  test("throws a clear error when streamSimpleAnthropic is absent", () => {
    const namespace: PiAiNamespace = { someOtherExport: fakeTransport };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("streamSimpleAnthropic"),
          `expected message to name the missing export, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  test("throws when streamSimpleAnthropic is present but not a function", () => {
    const namespace: PiAiNamespace = {
      streamSimpleAnthropic: "not a function",
    };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("streamSimpleAnthropic"),
          `expected message to name the export, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});
