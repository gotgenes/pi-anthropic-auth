import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { PiAiNamespace } from "#src/host-transport";
import { pickAnthropicStreamSimple } from "#src/host-transport";

// Guards that the compat entrypoint — which the host loader aliases the bare
// `@earendil-works/pi-ai` specifier to on 0.80.x — still exports
// `streamSimpleAnthropic`.  On 0.80.x the bare-root `import()` in
// `resolveBuiltinAnthropicStreamSimple` lands on compat at host runtime (via
// jiti's alias), but vitest's Node resolver hits the devDep root barrel
// (dist/index.js), which on 0.80.x no longer re-exports `streamSimpleAnthropic`.
// Importing from `/compat` directly mirrors the actual runtime resolution path
// and fails here if a future pi-ai removes the alias.
// Note: the live `pi -e` repro is still required to verify the full host
// resolution chain end-to-end.
test("streamSimpleAnthropic is present on the pi-ai compat entrypoint", async () => {
  const namespace = (await import(
    "@earendil-works/pi-ai/compat"
  )) as PiAiNamespace;
  const transport = pickAnthropicStreamSimple(namespace);

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
