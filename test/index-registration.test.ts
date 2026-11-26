import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import {
  afterEach,
  beforeEach,
  describe,
  onTestFinished,
  test,
  vi,
} from "vitest";
import type { StatusCommandContext } from "#src/diagnostics";
import { globalConfigPath, projectConfigPath } from "#src/extension-config";

const OAUTH_TOKEN = "sk-ant-oat01-example-access-token";

const MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic",
} as unknown as Model<"anthropic-messages">;

// `normalizeContext` is the only producer of the brand pi-ai's stream
// signature requires, so the fake is minted rather than cast.
const CONTEXT = normalizeContext({ messages: [] });

/**
 * A model on an extra Anthropic subscription another extension registered,
 * the way pi-multi-pass registers `anthropic-2` (Issue #70).
 */
const EXTRA_PROVIDER_MODEL = {
  id: "claude-haiku-4-5",
  api: "anthropic-messages",
  provider: "anthropic-2",
} as unknown as Model<"anthropic-messages">;

// `src/index.ts` reads the global config from `getAgentDir()`, which honours
// `PI_CODING_AGENT_DIR` at call time.  Every test points it at an empty temp
// dir so the developer's real `~/.pi/agent` config is never read.
let agentDir: string;

beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "pi-anthropic-auth-agent-"));
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(agentDir, { recursive: true, force: true });
});

function writeGlobalConfig(config: unknown): void {
  writeConfig(globalConfigPath(agentDir), JSON.stringify(config));
}

/** Writes a project config under a fresh temp cwd and returns that cwd. */
function writeProjectConfig(text: string): string {
  const cwd = mkdtempSync(join(tmpdir(), "pi-anthropic-auth-project-"));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  writeConfig(projectConfigPath(cwd), text);
  return cwd;
}

function writeConfig(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

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
  getArgumentCompletions?: (
    argumentPrefix: string,
  ) => { value: string; label: string; description?: string }[] | null;
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
 * Registrations are keyed by provider name and merged the way pi's
 * `ModelRuntime.registerProvider` merges them: defined values overlay the
 * previous registration, undefined keys are preserved.  `dispatch` looks the
 * config up by the request's provider, as `streamWith` does.
 *
 * Also captures `registerCommand` calls and `on()` handlers so tests can
 * invoke registered commands and fire `session_start` without needing the full
 * Pi runtime.
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
  fireSessionStart: (ctx: FakeSessionContext) => Promise<void>;
} {
  const commands = new Map<string, CapturedCommand>();
  // Ordered log of provider lifecycle calls so tests can assert that the
  // defensive `unregisterProvider` runs before `registerProvider`.
  const calls: string[] = [];
  const registrations = new Map<string, ProviderConfig>();
  const sessionStartHandlers: SessionStartHandler[] = [];
  const pi: ExtensionAPI = {
    unregisterProvider(name: string): void {
      calls.push(`unregister:${name}`);
      registrations.delete(name);
    },
    registerProvider(name: string, config: ProviderConfig): void {
      calls.push(`register:${name}`);
      const merged: Record<string, unknown> = {
        ...registrations.get(name),
      };
      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined) merged[key] = value;
      }
      registrations.set(name, merged);
    },
    registerCommand(name: string, options: CapturedCommand): void {
      commands.set(name, options);
    },
    on(event: string, handler: SessionStartHandler): void {
      if (event === "session_start") sessionStartHandlers.push(handler);
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

  const fireSessionStart = async (ctx: FakeSessionContext): Promise<void> => {
    for (const handler of sessionStartHandlers) {
      await handler({ type: "session_start", reason: "startup" }, ctx);
    }
  };

  return { pi, commands, calls, registrations, dispatch, fireSessionStart };
}

/** The `session_start` context fields `src/index.ts` reads. */
interface FakeSessionContext {
  cwd: string;
  hasUI: boolean;
  isProjectTrusted: () => boolean;
  ui: { notify: Mock<(message: string, type?: string) => void> };
}

type SessionStartHandler = (
  event: { type: "session_start"; reason: string },
  ctx: FakeSessionContext,
) => unknown;

function createSessionContext(
  overrides: Partial<Omit<FakeSessionContext, "ui">> = {},
): FakeSessionContext {
  return {
    cwd: overrides.cwd ?? "/nonexistent-project",
    hasUI: overrides.hasUI ?? false,
    isProjectTrusted: overrides.isProjectTrusted ?? (() => false),
    ui: { notify: vi.fn<(message: string, type?: string) => void>() },
  };
}

/**
 * A headless status command context.  No provider has a credential, so the
 * account lookups never reach the network.
 */
function createCommandContext(apiKey?: string): StatusCommandContext {
  return {
    hasUI: false,
    ui: { notify: vi.fn() },
    modelRegistry: { getApiKeyForProvider: () => Promise.resolve(apiKey) },
  };
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
// the config names it (Issue #70).
describe("index registration: extra providers named in the global config", () => {
  const OWNER_REGISTRATION = {
    api: "anthropic-messages",
    oauth: { name: "Anthropic #2" },
    models: [{ id: "claude-haiku-4-5" }],
  } as unknown as ProviderConfig;

  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    registryStubCalls = 0;
    builtinTransportMock.mockClear();
  });

  describe("shaping", () => {
    test("shapes OAuth requests on a named provider", async () => {
      writeGlobalConfig({ providers: ["anthropic-2"] });

      const { default: registerExtension } = await import("#src/index");
      const { pi, dispatch } = createFakePi();
      await registerExtension(pi);

      dispatch(EXTRA_PROVIDER_MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });

      assert.equal(delegateCalls.length, 1);
      assert.equal(
        await delegateCallWasShaped(delegateCalls[0]),
        true,
        "an OAuth request on the named provider must carry the billing header",
      );
    });

    test("registers the same wrapper instance as anthropic, so they share one learned floor", async () => {
      writeGlobalConfig({ providers: ["anthropic-2"] });

      const { default: registerExtension } = await import("#src/index");
      const { pi, registrations } = createFakePi();
      await registerExtension(pi);

      const anthropic = registrations.get("anthropic")?.streamSimple;
      assert.equal(typeof anthropic, "function");
      assert.equal(registrations.get("anthropic-2")?.streamSimple, anthropic);
    });

    test("registers only anthropic when there is no config file", async () => {
      const { default: registerExtension } = await import("#src/index");
      const { pi, calls } = createFakePi();
      await registerExtension(pi);

      assert.deepEqual(calls, ["unregister:anthropic", "register:anthropic"]);
    });
  });

  describe("the owning extension's registration", () => {
    test("survives when the owner registered first, and is never unregistered", async () => {
      writeGlobalConfig({ providers: ["anthropic-2"] });

      const { default: registerExtension } = await import("#src/index");
      const { pi, calls, registrations } = createFakePi();
      pi.registerProvider("anthropic-2", OWNER_REGISTRATION);
      await registerExtension(pi);

      assert.equal(calls.includes("unregister:anthropic-2"), false);
      const merged = registrations.get("anthropic-2");
      assert.ok(merged, "the owner's registration must still exist");
      assert.deepEqual(merged.oauth, OWNER_REGISTRATION.oauth);
      assert.deepEqual(merged.models, OWNER_REGISTRATION.models);
      assert.equal(typeof merged.streamSimple, "function");
    });

    test("keeps our wrapper when the owner registers afterwards", async () => {
      writeGlobalConfig({ providers: ["anthropic-2"] });

      const { default: registerExtension } = await import("#src/index");
      const { pi, registrations } = createFakePi();
      await registerExtension(pi);
      pi.registerProvider("anthropic-2", OWNER_REGISTRATION);

      const merged = registrations.get("anthropic-2");
      assert.ok(merged, "the owner's registration must still exist");
      assert.deepEqual(merged.oauth, OWNER_REGISTRATION.oauth);
      assert.equal(
        merged.streamSimple,
        registrations.get("anthropic")?.streamSimple,
      );
    });
  });

  test("the status report lists the named provider with its layer", async () => {
    writeGlobalConfig({ providers: ["anthropic-2"] });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);
    await commands
      .get("anthropic-auth:status")
      ?.handler("", createCommandContext());

    const [report] = consoleSpy.mock.calls[0];
    assert.match(report, /shaped providers: anthropic, anthropic-2 \(global\)/);
  });
});

// The project layer needs a cwd and a trust decision, which only arrive with
// `session_start`.
describe("index registration: the project config at session start", () => {
  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    builtinTransportMock.mockClear();
  });

  describe("project trust", () => {
    test("a trusted project's config adds its providers", async () => {
      const cwd = writeProjectConfig('{ "providers": ["anthropic-3"] }');

      const { default: registerExtension } = await import("#src/index");
      const { pi, dispatch, fireSessionStart } = createFakePi();
      await registerExtension(pi);
      await fireSessionStart(
        createSessionContext({ cwd, isProjectTrusted: () => true }),
      );

      dispatch({ ...EXTRA_PROVIDER_MODEL, provider: "anthropic-3" }, CONTEXT, {
        apiKey: OAUTH_TOKEN,
      });
      assert.equal(await delegateCallWasShaped(delegateCalls[0]), true);
    });

    test("an untrusted project's config is never applied", async () => {
      const cwd = writeProjectConfig('{ "providers": ["anthropic-3"] }');

      const { default: registerExtension } = await import("#src/index");
      const { pi, calls, fireSessionStart } = createFakePi();
      await registerExtension(pi);
      await fireSessionStart(
        createSessionContext({ cwd, isProjectTrusted: () => false }),
      );

      assert.deepEqual(calls, ["unregister:anthropic", "register:anthropic"]);
    });
  });

  describe("config warnings", () => {
    test("are notified as warnings when a UI is available", async () => {
      writeGlobalConfig({ providers: "anthropic-2" });
      const cwd = writeProjectConfig("not json");

      const { default: registerExtension } = await import("#src/index");
      const { pi, fireSessionStart } = createFakePi();
      await registerExtension(pi);
      const ctx = createSessionContext({
        cwd,
        hasUI: true,
        isProjectTrusted: () => true,
      });
      await fireSessionStart(ctx);

      expectWarnings(
        ctx.ui.notify.mock.calls.map(([message, type]) => {
          assert.equal(type, "warning");
          return message;
        }),
      );
    });

    test("go to console.warn without a UI", async () => {
      writeGlobalConfig({ providers: "anthropic-2" });
      const cwd = writeProjectConfig("not json");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      onTestFinished(() => warnSpy.mockRestore());

      const { default: registerExtension } = await import("#src/index");
      const { pi, fireSessionStart } = createFakePi();
      await registerExtension(pi);
      const ctx = createSessionContext({ cwd, isProjectTrusted: () => true });
      await fireSessionStart(ctx);

      expectWarnings(warnSpy.mock.calls.map(([message]) => String(message)));
      assert.equal(ctx.ui.notify.mock.calls.length, 0);
    });

    test("are not reported when there are none", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      onTestFinished(() => warnSpy.mockRestore());

      const { default: registerExtension } = await import("#src/index");
      const { pi, fireSessionStart } = createFakePi();
      await registerExtension(pi);
      await fireSessionStart(createSessionContext());

      assert.equal(warnSpy.mock.calls.length, 0);
    });

    /** One global warning, then one project warning, each attributed. */
    function expectWarnings(messages: string[]): void {
      assert.equal(messages.length, 2);
      assert.match(
        messages[0],
        /^\[pi-anthropic-auth\] .*config\.json: "providers" must be an array/,
      );
      assert.match(
        messages[1],
        /^\[pi-anthropic-auth\] .*config\.json: is not valid JSON/,
      );
    }
  });

  test("the status report lists providers from both layers", async () => {
    writeGlobalConfig({ providers: ["anthropic-2"] });
    const cwd = writeProjectConfig('{ "providers": ["anthropic-3"] }');
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands, fireSessionStart } = createFakePi();
    await registerExtension(pi);
    await fireSessionStart(
      createSessionContext({ cwd, isProjectTrusted: () => true }),
    );
    await commands
      .get("anthropic-auth:status")
      ?.handler("", createCommandContext());

    const [report] = consoleSpy.mock.calls[0];
    assert.match(
      report,
      /shaped providers: anthropic, anthropic-2 \(global\), anthropic-3 \(project\)/,
    );
  });
});

// The config files' `entrypoint` key sets the billing header's
// `cc_entrypoint` label; a trusted project's value wins (Issue #91).
describe("index registration: the entrypoint label", () => {
  beforeEach(() => {
    resetApiProviders();
    delegateCalls.length = 0;
    builtinTransportMock.mockClear();
  });

  /** Registers the extension, fires `session_start`, and sends one request. */
  async function sentEntrypoint(
    ctx: FakeSessionContext = createSessionContext(),
  ): Promise<string | undefined> {
    const { default: registerExtension } = await import("#src/index");
    const { pi, dispatch, fireSessionStart } = createFakePi();
    await registerExtension(pi);
    await fireSessionStart(ctx);

    dispatch(MODEL, CONTEXT, { apiKey: OAUTH_TOKEN });
    const onPayload = delegateCalls[0]?.options?.onPayload;
    assert.ok(onPayload);
    const shaped = await onPayload(samplePayload(), MODEL);
    const billing = systemTexts(shaped).find((text) =>
      text.startsWith("x-anthropic-billing-header:"),
    );
    return /cc_entrypoint=([^;]*);/.exec(billing ?? "")?.[1];
  }

  test("is sdk-cli without a config file", async () => {
    assert.equal(await sentEntrypoint(), "sdk-cli");
  });

  test("comes from the global config", async () => {
    writeGlobalConfig({ entrypoint: "pi-agent" });

    assert.equal(await sentEntrypoint(), "pi-agent");
  });

  test("comes from a trusted project's config over the global one", async () => {
    writeGlobalConfig({ entrypoint: "global-label" });
    const cwd = writeProjectConfig('{ "entrypoint": "project-label" }');

    assert.equal(
      await sentEntrypoint(
        createSessionContext({ cwd, isProjectTrusted: () => true }),
      ),
      "project-label",
    );
  });

  test("ignores an untrusted project's config", async () => {
    writeGlobalConfig({ entrypoint: "global-label" });
    const cwd = writeProjectConfig('{ "entrypoint": "project-label" }');

    assert.equal(
      await sentEntrypoint(
        createSessionContext({ cwd, isProjectTrusted: () => false }),
      ),
      "global-label",
    );
  });

  test("is shown in the status report with its layer", async () => {
    writeGlobalConfig({ entrypoint: "pi-agent" });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    onTestFinished(() => consoleSpy.mockRestore());

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);
    await commands
      .get("anthropic-auth:status")
      ?.handler("", createCommandContext());

    const [report] = consoleSpy.mock.calls[0];
    assert.match(report, /^ {2}entrypoint: pi-agent \(global\)$/m);
  });

  test("warns about an invalid label and keeps sdk-cli", async () => {
    writeGlobalConfig({ entrypoint: "a b" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    onTestFinished(() => warnSpy.mockRestore());

    assert.equal(await sentEntrypoint(), "sdk-cli");
    assert.equal(warnSpy.mock.calls.length, 1);
    assert.match(
      String(warnSpy.mock.calls[0]?.[0]),
      /^\[pi-anthropic-auth\] .*config\.json: "entrypoint" must be a label/,
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

    await command.handler("", createCommandContext());

    assert.equal(consoleSpy.mock.calls.length, 1);
    const [report] = consoleSpy.mock.calls[0];
    // Version from package.json (semver pattern)
    assert.match(report, /\d+\.\d+\.\d+/);
    // Filesystem path to src/index.ts (POSIX or Windows separator)
    assert.match(report, /src[/\\]index\.ts/);
    // Transport resolved marker
    assert.match(report, /resolved/i);
  });

  test("anthropic-auth:status reports the account behind an OAuth login", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn((_input: string, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            account: { email: "person@example.com" },
            organization: {
              organization_type: "claude_max",
              has_extra_usage_enabled: false,
            },
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    onTestFinished(() => {
      consoleSpy.mockRestore();
      vi.unstubAllGlobals();
    });

    const { default: registerExtension } = await import("#src/index");
    const { pi, commands } = createFakePi();
    await registerExtension(pi);
    await commands
      .get("anthropic-auth:status")
      ?.handler("--account", createCommandContext(OAUTH_TOKEN));

    assert.equal(fetchMock.mock.calls.length, 1);
    const [report] = consoleSpy.mock.calls[0];
    assert.match(
      report,
      /\n {2}accounts:\n {4}anthropic: person@example\.com, claude_max, extra usage off$/,
    );
  });

  describe("anthropic-auth:status argument completions", () => {
    async function completions(prefix: string) {
      const { default: registerExtension } = await import("#src/index");
      const { pi, commands } = createFakePi();
      await registerExtension(pi);
      const complete = commands.get(
        "anthropic-auth:status",
      )?.getArgumentCompletions;
      assert.ok(complete, "the command must offer argument completions");
      return complete(prefix);
    }

    test("offers --account for an empty prefix", async () => {
      const items = await completions("");
      assert.deepEqual(
        items?.map(({ value }) => value),
        ["--account"],
      );
    });

    test("offers --account for a matching prefix", async () => {
      const items = await completions("--acc");
      assert.deepEqual(
        items?.map(({ value }) => value),
        ["--account"],
      );
    });

    test("offers nothing for a prefix that does not match", async () => {
      assert.equal(await completions("--verbose"), null);
    });
  });
});
