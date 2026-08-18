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

  test("returns anthropicMessagesApi().streamSimple", () => {
    const namespace: PiAiNamespace = {
      anthropicMessagesApi: () => ({ streamSimple: fakeTransport }),
    };

    const result = pickAnthropicStreamSimple(namespace);

    assert.equal(result, fakeTransport);
  });

  test("throws when the factory is absent", () => {
    const namespace: PiAiNamespace = { someOtherExport: fakeTransport };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("anthropicMessagesApi"),
          `expected message to name the factory, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  test("throws when the factory yields no streamSimple", () => {
    const namespace: PiAiNamespace = {
      anthropicMessagesApi: () => ({ streamSimple: undefined }),
    };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("streamSimple"),
          `expected message to name the expected export, got: ${err.message}`,
        );
        return true;
      },
    );
  });

  // Pins the Issue #54 decision: the deprecated `streamSimpleAnthropic` alias
  // is deliberately no longer consulted.  `anthropicMessagesApi` has shipped
  // from the compat entrypoint since pi v0.80.0, below the `>=0.80.8` peer
  // floor, so a host offering only the alias cannot exist — and reinstating
  // the fallback would silently bind the delegate to a deprecated handle.
  test("throws when only the deprecated streamSimpleAnthropic alias is present", () => {
    const namespace: PiAiNamespace = { streamSimpleAnthropic: fakeTransport };

    assert.throws(
      () => pickAnthropicStreamSimple(namespace),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("anthropicMessagesApi"),
          `expected message to name the factory, got: ${err.message}`,
        );
        assert.ok(
          !err.message.includes("streamSimpleAnthropic"),
          `expected message not to offer the deprecated alias, got: ${err.message}`,
        );
        return true;
      },
    );
  });
});
