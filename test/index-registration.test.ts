import assert from "node:assert/strict";
import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  clearApiProviders,
  createAssistantMessageEventStream,
  getApiProvider,
  registerApiProvider,
  registerBuiltInApiProviders,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, onTestFinished, test, vi } from "vitest";

// `onTestFinished` is invoked inside each test (vitest requires it in test scope).

const OAUTH_TOKEN = "sk-ant-oat01-example-access-token";

const MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic",
} as unknown as Model<"anthropic-messages">;

const CONTEXT = { messages: [] } as unknown as Context;

/**
 * Stubbed transport recorded as the pi-ai 0.79.8 "bare built-in"
 * `streamSimpleAnthropic`.
 *
 * The `vi.mock` factory references it, so it must be created inside
 * `vi.hoisted` — Vitest hoists `vi.mock` above ordinary declarations, which
 * would otherwise leave the stub `undefined` when the factory runs.
 */
const { delegateCalls, streamSimpleAnthropicMock } = vi.hoisted(() => {
  const delegateCalls: Array<{ options?: SimpleStreamOptions }> = [];
  const streamSimpleAnthropicMock = vi.fn(
    (
      _model: Model<Api>,
      _context: Context,
      options?: SimpleStreamOptions,
    ): AssistantMessageEventStream => {
      delegateCalls.push({ options });
      return createAssistantMessageEventStream();
    },
  );
  return { delegateCalls, streamSimpleAnthropicMock };
});

vi.mock("@earendil-works/pi-ai/anthropic", () => ({
  streamAnthropic: streamSimpleAnthropicMock,
  streamSimpleAnthropic: streamSimpleAnthropicMock,
}));

/**
 * Simulates the pi-ai 0.79.8 lazy-stub registry entry for `anthropic-messages`.
 *
 * On first call it re-registers the bare built-in transport (the mocked
 * `streamSimpleAnthropic`), mirroring `anthropic.ts`'s `register()` overwrite,
 * then forwards the call (with its `options`) to that bare built-in — exactly
 * what `createLazySimpleStream`'s `loadAndRegisterProvider` does.
 */
function lazyStubStreamSimple(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  registerApiProvider({
    api: "anthropic-messages",
    stream: streamSimpleAnthropicMock,
    streamSimple: streamSimpleAnthropicMock,
  });
  return streamSimpleAnthropicMock(model, context, options);
}

/**
 * Mirrors `ModelRegistry.applyProviderConfig`'s `streamSimple` branch: when an
 * extension registers a `streamSimple`, both `stream` and `streamSimple` are
 * routed through it via `registerApiProvider` with a `provider:<name>` source
 * id.
 */
function createFakePi(): ExtensionAPI {
  return {
    registerProvider(name: string, config: ProviderConfig): void {
      if (config.streamSimple) {
        const streamSimple = config.streamSimple;
        registerApiProvider(
          {
            api: config.api ?? "anthropic-messages",
            stream: (m, c, o) => streamSimple(m, c, o as SimpleStreamOptions),
            streamSimple,
          },
          `provider:${name}`,
        );
      }
    },
  } as unknown as ExtensionAPI;
}

function samplePayload() {
  return {
    model: "claude-haiku-4-5",
    stream: true,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Summarize the repository status." }],
      },
    ],
    system: [
      {
        type: "text",
        text: "You are Claude Code, Anthropic's official CLI for Claude.",
      },
    ],
  };
}

function systemTexts(payload: unknown): string[] {
  const system = (payload as { system?: Array<{ text?: string }> }).system;
  return Array.isArray(system)
    ? system.map((block) => (typeof block.text === "string" ? block.text : ""))
    : [];
}

/** True when the delegate received an `onPayload` that injects our billing header. */
async function delegateCallWasShaped(call: {
  options?: SimpleStreamOptions;
}): Promise<boolean> {
  const onPayload = call.options?.onPayload;
  if (typeof onPayload !== "function") return false;
  const shaped = await onPayload(samplePayload(), MODEL);
  return systemTexts(shaped).some((text) =>
    text.includes("x-anthropic-billing-header:"),
  );
}

describe("index registration survives the pi-ai 0.79.8 lazy re-register clobber (#28)", () => {
  beforeEach(() => {
    clearApiProviders();
    delegateCalls.length = 0;
    streamSimpleAnthropicMock.mockClear();

    // Seed the registry with the 0.79.8 lazy stub, as pi-ai would at import.
    registerApiProvider({
      api: "anthropic-messages",
      stream: lazyStubStreamSimple,
      streamSimple: lazyStubStreamSimple,
    });
  });

  test("every OAuth call resolves our wrapper and is shaped across multiple calls", async () => {
    onTestFinished(() => {
      // Restore real built-ins so the singleton registry is clean for later tests.
      clearApiProviders();
      registerBuiltInApiProviders();
    });

    const { default: registerExtension } = await import("#src/index");
    registerExtension(createFakePi());

    // Simulate two Anthropic OAuth calls (e.g. compaction via completeSimple,
    // which issues requests with no caller-provided onPayload).
    for (let i = 0; i < 2; i += 1) {
      const provider = getApiProvider("anthropic-messages");
      assert.ok(provider, "anthropic-messages transport must be registered");
      provider.streamSimple(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });
    }

    assert.equal(
      delegateCalls.length,
      2,
      "both calls must reach the built-in transport delegate",
    );
    assert.equal(
      await delegateCallWasShaped(delegateCalls[0]),
      true,
      "first OAuth call must be shaped with the billing header",
    );
    assert.equal(
      await delegateCallWasShaped(delegateCalls[1]),
      true,
      "second OAuth call must still be shaped — the lazy re-register must not displace our wrapper",
    );
  });
});
