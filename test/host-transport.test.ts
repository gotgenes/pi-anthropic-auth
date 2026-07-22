import assert from "node:assert/strict";
import { describe, test } from "vitest";
import type { PiAiNamespace } from "#src/host-transport";
import { pickAnthropicStreamSimple } from "#src/host-transport";

// Guards that the compat entrypoint — which the host loader aliases both the
// bare `@earendil-works/pi-ai` specifier and the `/compat` subpath to on
// 0.80.x — exposes a usable Anthropic transport.  `resolveBuiltinAnthropic‑
// StreamSimple` imports `/compat` directly (the path pi's own
// `custom-provider-gitlab-duo` example uses), which mirrors the actual runtime
// resolution path and fails here if a future pi-ai removes the alias.
// Note: the live `pi -e` repro is still required to verify the full host
// resolution chain end-to-end.
test("the pi-ai compat entrypoint exposes a resolvable Anthropic transport", async () => {
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

  test("prefers anthropicMessagesApi().streamSimple (the forward primitive)", () => {
    function legacyTransport(): void {
      /* deprecated alias that must not win when the factory is present */
    }
    const namespace: PiAiNamespace = {
      anthropicMessagesApi: () => ({ streamSimple: fakeTransport }),
      streamSimpleAnthropic: legacyTransport,
    };

    const result = pickAnthropicStreamSimple(namespace);

    assert.equal(result, fakeTransport);
  });

  test("falls back to streamSimpleAnthropic when the factory is absent", () => {
    const namespace: PiAiNamespace = { streamSimpleAnthropic: fakeTransport };

    const result = pickAnthropicStreamSimple(namespace);

    assert.equal(result, fakeTransport);
  });

  test("falls back to streamSimpleAnthropic when the factory yields no transport", () => {
    const namespace: PiAiNamespace = {
      anthropicMessagesApi: () => ({ streamSimple: undefined }),
      streamSimpleAnthropic: fakeTransport,
    };

    const result = pickAnthropicStreamSimple(namespace);

    assert.equal(result, fakeTransport);
  });

  test("throws a clear error when no usable transport is present", () => {
    const namespace: PiAiNamespace = { someOtherExport: fakeTransport };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("anthropicMessagesApi") &&
            err.message.includes("streamSimpleAnthropic"),
          `expected message to name both handles, got: ${err.message}`,
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
