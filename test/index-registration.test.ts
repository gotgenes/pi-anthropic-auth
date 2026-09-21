import assert from "node:assert/strict";
import type {
  Api,
  AssistantMessageEventStream,
  Model,
  SimpleStreamOptions,
  TranscriptContext,
} from "@earendil-works/pi-ai";
import {
  createAssistantMessageEventStream,
  normalizeContext,
} from "@earendil-works/pi-ai";
import {
  getApiProvider,
  registerApiProvider,
  resetApiProviders,
} from "@earendil-works/pi-ai/compat";
import type {
  ExtensionAPI,
  ProviderConfig,
} from "@earendil-works/pi-coding-agent";
import type { Mock } from "vitest";
import { beforeEach, describe, onTestFinished, test, vi } from "vitest";
import type { StatusCommandContext } from "#src/diagnostics";

const OAUTH_TOKEN = "sk-ant-oat01-example-access-token";

const MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic",
} as unknown as Model<"anthropic-messages">;

/**
 * A model on an extra Anthropic subscription another extension registered,
 * the way pi-multi-pass registers `anthropic-2` (Issue #70).
 */
const EXTRA_PROVIDER_MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic-2",
} as unknown as Model<"anthropic-messages">;

// `normalizeContext` is the only producer of the brand pi-ai's stream
// signature requires, so the fake is minted rather than cast.
const CONTEXT = normalizeContext({ messages: [] });

/**
 * Stubbed transport standing in for the bare built-in Anthropic transport that
 * the host resolver hands `src/index.ts`.
 *
 * `src/index.ts` resolves the delegate via `#src/host-transport`, so mocking
 * that module's resolver is the seam that controls the delegate without
 * touching jiti's subpath resolution (which only the live `pi` loader
 * exercises).  The `vi.mock` factory references the stub, so it must be
 * created inside `vi.hoisted` — Vitest hoists `vi.mock` above ordinary
 * declarations, which would otherwise leave the stub `undefined` when the
 * factory runs.
 */
const { delegateCalls, builtinTransportMock } = vi.hoisted(() => {
  const delegateCalls: Array<{ options?: SimpleStreamOptions }> = [];
  const builtinTransportMock: Mock<
    (
      model: Model<Api>,
      context: TranscriptContext,
      options?: SimpleStreamOptions,
    ) => AssistantMessageEventStream
  > = vi.fn((_model, _context, options) => {
    delegateCalls.push({ options });
    return createAssistantMessageEventStream();
  });
  return { delegateCalls, builtinTransportMock };
});

vi.mock("#src/host-transport", () => ({
  resolveBuiltinAnthropicStreamSimple: () =>
    // The resolver returns the narrow built-in transport type; the wide mock
    // satisfies it structurally (the registry only ever invokes it for
    // `anthropic-messages` models).
    Promise.resolve(builtinTransportMock),
}));

/**
 * Counts how many times the seeded api-registry entry was invoked.
 *
 * The wrapper must never consult the api registry, so every test that seeds
 * the hostile stub expects this to stay at zero.
 */
let registryStubCalls = 0;

/**
 * A deliberately hostile pi-ai api-registry entry for `anthropic-messages`.
 *
 * It mimics the pi-ai 0.79.8 lazy stub: on first call it re-registers the bare
 * built-in transport (the stub above), mirroring
 * `anthropic.ts`'s `register()` overwrite, then forwards the call to that bare
 * built-in — exactly what `createLazySimpleStream`'s `loadAndRegisterProvider`
 * does.
 *
 * Seeding it pins the invariant behind Issue #28: the wrapper resolves its
 * delegate from `#src/host-transport`, never from the api registry, so nothing
 * living in the registry can displace our shaping.  Reaching this stub at all
 * means the wrapper consulted the registry.
 */
function lazyStubStreamSimple(
  model: Model<Api>,
  context: TranscriptContext,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  registryStubCalls += 1;
  registerApiProvider({
    api: "anthropic-messages",
    stream: builtinTransportMock,
    streamSimple: builtinTransportMock,
  });
  return builtinTransportMock(model, context, options);
}

type CapturedCommand = {
  description?: string;
  handler: (args: string, ctx: StatusCommandContext) => Promise<void>;
};

/**
 * Mirrors how pi >=0.80.8 actually applies an extension's provider config.
 *
 * `registerProvider` only stores the config in pi's own `extensionProviders`
 * map; `provider-composer.ts`'s `streamWith` then applies it when a request
 * arrives through `modelRuntime`, via
 * `if (extension?.streamSimple && model.api === extension.api)`.
 * The returned `dispatch` models exactly that lane.
 *
 * Up to pi 0.80.7, `ModelRegistry.applyProviderConfig` additionally bridged the
 * config into pi-ai's api registry through `registerApiProvider`.  The
 * `ModelRuntime` rewrite in 0.80.8 dropped that call, so an extension's
 * `streamSimple` no longer reaches pi-ai's own dispatch at all (Issue #46).
 * This fake therefore leaves the api registry untouched, as the real host does.
 *
 * Also captures `registerCommand` calls so tests can assert on and invoke
 * registered commands without needing the full Pi runtime.
 */
function createFakePi(): {
  pi: ExtensionAPI;
  commands: Map<string, CapturedCommand>;
  calls: string[];
  registrations: Map<string, ProviderConfig>;
  dispatch: (
    model: Model<Api>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ) => AssistantMessageEventStream;
} {
  const commands = new Map<string, CapturedCommand>();
  // Ordered log of provider lifecycle calls so tests can assert that the
  // defensive `unregisterProvider` runs before `registerProvider`.
  const calls: string[] = [];
  // Keyed by provider name, because pi stores one `ProviderConfig` per
  // provider and `provider-composer` looks it up by the request's provider.
  const registrations = new Map<string, ProviderConfig>();
  const pi: ExtensionAPI = {
    unregisterProvider(name: string): void {
      calls.push(`unregister:${name}`);
      registrations.delete(name);
    },
    registerProvider(name: string, config: ProviderConfig): void {
      calls.push(`register:${name}`);
      // Mirrors pi's merge contract: defined values overlay the previous
      // registration, undefined keys are preserved.
      registrations.set(name, { ...registrations.get(name), ...config });
    },
    registerCommand(
      name: string,
      options: { description?: string; handler: CapturedCommand["handler"] },
    ): void {
      commands.set(name, options);
    },
  } as unknown as ExtensionAPI;

  const dispatch = (
    model: Model<Api>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream => {
    const registered = registrations.get(model.provider);
    if (!registered?.streamSimple || model.api !== registered.api) {
      throw new Error(
        `no extension streamSimple registered for provider "${model.provider}"`,
      );
    }
    return registered.streamSimple(model, context, options);
  };

  return { pi, commands, calls, registrations, dispatch };
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

// These tests exercise the one lane the wrapper sits on: `modelRuntime` ->
// `provider-composer.streamWith` -> our registered `streamSimple`.  A hostile
// api-registry entry is seeded throughout so the Issue #28 invariant stays
// pinned: the delegate comes from `#src/host-transport`, never from the
// registry, so nothing living there can displace our shaping.
describe("index registration: wrapper shapes every request on the provider-composer lane (#28 regression guard)", () => {
  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    registryStubCalls = 0;
    builtinTransportMock.mockClear();

    // Seed the registry with the lazy-stub, simulating a provider that
    // re-registers itself on first call (the 0.79.x clobber pattern).
    registerApiProvider({
      api: "anthropic-messages",
      stream: lazyStubStreamSimple,
      streamSimple: lazyStubStreamSimple,
    });
  });

  test("every OAuth call is shaped, and the api registry is never consulted", async () => {
    onTestFinished(() => {
      // Restore real built-ins so the singleton registry is clean for later tests.
      resetApiProviders();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, dispatch } = createFakePi();
    await registerExtension(pi);

    // Simulate two Anthropic OAuth calls on the covered lane (e.g. an
    // interactive turn, then compaction, which reuses `agent.streamFunction`
    // and issues requests with no caller-provided onPayload).
    for (let i = 0; i < 2; i += 1) {
      dispatch(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });
    }

    assert.equal(
      delegateCalls.length,
      2,
      "both calls must reach the built-in transport delegate",
    );
    assert.equal(
      registryStubCalls,
      0,
      "the wrapper must resolve its delegate from #src/host-transport, never from the api registry",
    );
    assert.equal(
      await delegateCallWasShaped(delegateCalls[0]),
      true,
      "first OAuth call must be shaped with the billing header",
    );
    assert.equal(
      await delegateCallWasShaped(delegateCalls[1]),
      true,
      "second OAuth call must still be shaped — a hostile registry entry must not displace our wrapper",
    );
  });

  test("unregisters anthropic before re-registering, clearing a stale merged oauth (#43 hardening)", async () => {
    onTestFinished(() => {
      resetApiProviders();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, calls } = createFakePi();
    await registerExtension(pi);

    assert.deepEqual(
      calls,
      ["unregister:anthropic", "register:anthropic"],
      "unregisterProvider('anthropic') must run before registerProvider so a co-loaded stale copy's oauth cannot survive the merge",
    );
  });
});

// pi keys an extension's `streamSimple` by provider name, so an Anthropic
// OAuth subscription another extension registers under its own name
// (pi-multi-pass's `anthropic-2`) runs on the bare built-in transport unless
// this extension wraps that name too (Issue #70).
describe("index registration: extra providers named by PI_ANTHROPIC_AUTH_PROVIDERS (#70)", () => {
  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    registryStubCalls = 0;
    builtinTransportMock.mockClear();
    vi.unstubAllEnvs();
  });

  test("shapes requests on a provider another extension registered", async () => {
    vi.stubEnv("PI_ANTHROPIC_AUTH_PROVIDERS", "anthropic-2");
    onTestFinished(() => {
      vi.unstubAllEnvs();
      resetApiProviders();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, dispatch } = createFakePi();
    await registerExtension(pi);

    dispatch(EXTRA_PROVIDER_MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

    assert.equal(
      delegateCalls.length,
      1,
      "the extra provider's request must reach the built-in transport delegate",
    );
    assert.equal(
      await delegateCallWasShaped(delegateCalls[0]),
      true,
      "an OAuth request on the extra provider must be shaped with the billing header",
    );
  });

  test("never unregisters an extra provider, so its owner's models and oauth survive", async () => {
    vi.stubEnv("PI_ANTHROPIC_AUTH_PROVIDERS", "anthropic-2");
    onTestFinished(() => {
      vi.unstubAllEnvs();
      resetApiProviders();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, calls, registrations } = createFakePi();
    // The owning extension registered first, as pi-multi-pass does when it
    // loads ahead of this extension.
    pi.registerProvider("anthropic-2", {
      api: "anthropic-messages",
      oauth: { name: "Anthropic #2" } as never,
      models: [{ id: "claude-haiku-4-5" }] as never,
    });
    calls.length = 0;

    await registerExtension(pi);

    assert.equal(
      calls.includes("unregister:anthropic-2"),
      false,
      "unregistering a provider owned by another extension would drop its models and oauth",
    );
    const merged = registrations.get("anthropic-2");
    assert.ok(merged, "the owner's registration must still exist");
    assert.ok(merged.oauth, "the owner's oauth registration must survive");
    assert.ok(merged.models, "the owner's models must survive");
    assert.equal(
      typeof merged.streamSimple,
      "function",
      "the shaping wrapper must be merged onto the owner's registration",
    );
  });

  test("leaves extra providers unshaped when the variable is unset", async () => {
    onTestFinished(() => resetApiProviders());

    const { default: registerExtension } = await import("#src/index");
    const { pi, calls } = createFakePi();
    await registerExtension(pi);

    assert.deepEqual(
      calls,
      ["unregister:anthropic", "register:anthropic"],
      "no extra provider may be registered without the user naming it",
    );
  });
});

// Registering an api-registry override would place this extension in the
// dispatch path of every `anthropic-messages` provider — not just `anthropic` —
// because the registry is keyed by api and `registerApiProvider` is a
// `Map.set`.  That is the coverage boundary `docs/architecture.md` documents,
// and this pins it (Issue #46).
describe("index registration: the extension does not write to the pi-ai api registry (#46)", () => {
  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    registryStubCalls = 0;
    builtinTransportMock.mockClear();
  });

  test("leaves the built-in anthropic-messages registry entry untouched", async () => {
    onTestFinished(() => {
      resetApiProviders();
    });

    const builtin = getApiProvider("anthropic-messages");
    assert.ok(
      builtin,
      "pi-ai must register a built-in anthropic-messages transport",
    );

    const { default: registerExtension } = await import("#src/index");
    const { pi } = createFakePi();
    await registerExtension(pi);

    assert.equal(
      getApiProvider("anthropic-messages"),
      builtin,
      "registering an api-registry override would put this extension in the dispatch path of every anthropic-messages provider; see docs/architecture.md",
    );
  });
});

describe("index registration: diagnostics command", () => {
  beforeEach(() => {
    delegateCalls.length = 0;
    registryStubCalls = 0;
    builtinTransportMock.mockClear();
  });

  test("registers the anthropic-auth:status command", async () => {
    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);

    assert.ok(
      commands.has("anthropic-auth:status"),
      "anthropic-auth:status command must be registered",
    );
  });

  test("anthropic-auth:status handler report includes version, module path, and transport marker", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);

    const command = commands.get("anthropic-auth:status");
    assert.ok(command, "command must be registered before invoking handler");

    await command.handler("", {
      hasUI: false,
      ui: { notify: vi.fn() },
    });

    assert.equal(consoleSpy.mock.calls.length, 1);
    const [report] = consoleSpy.mock.calls[0];
    // Version from package.json (semver pattern)
    assert.match(report, /\d+\.\d+\.\d+/);
    // Filesystem path to src/index.ts (POSIX or Windows separator)
    assert.match(report, /src[/\\]index\.ts/);
    // Transport resolved marker
    assert.match(report, /resolved/i);
    // Shaped provider list
    assert.match(report, /anthropic/);
  });

  test("anthropic-auth:status handler report lists extra shaped providers", async () => {
    vi.stubEnv("PI_ANTHROPIC_AUTH_PROVIDERS", "anthropic-2");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    onTestFinished(() => {
      consoleSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);

    const command = commands.get("anthropic-auth:status");
    assert.ok(command, "command must be registered before invoking handler");

    await command.handler("", { hasUI: false, ui: { notify: vi.fn() } });

    const [report] = consoleSpy.mock.calls[0];
    assert.match(report, /anthropic, anthropic-2/);
  });
});
