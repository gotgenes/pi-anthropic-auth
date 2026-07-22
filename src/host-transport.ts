import type {
  SimpleStreamOptions,
  StreamFunction,
} from "@earendil-works/pi-ai";

/**
 * Pi's built-in Anthropic `streamSimple` transport, typed for the
 * `anthropic-messages` API it serves.
 *
 * This is the delegate our `streamSimple` wrapper shapes around — declared
 * here because `resolveBuiltinAnthropicStreamSimple` is what produces it.
 */
export type AnthropicStreamSimpleDelegate = StreamFunction<
  "anthropic-messages",
  SimpleStreamOptions
>;

/**
 * A pi-ai module namespace, treated as a plain record for property lookup.
 *
 * The `@earendil-works/pi-ai/compat` import yields the host's pi-ai compat
 * entrypoint (`dist/compat.js` on pi >=0.80.x), which the host loader aliases
 * (Node) / virtualizes (Bun) that subpath to.
 * This type captures only the index-signature access the resolver needs, so
 * `pickAnthropicStreamSimple` is unit-testable with a plain object.
 */
export type PiAiNamespace = Record<string, unknown>;

/** Minimal shape of the `ProviderStreams` that `anthropicMessagesApi()` returns. */
type AnthropicMessagesApi = () => { streamSimple?: unknown };

/**
 * Reads the built-in Anthropic `streamSimple` transport off a pi-ai namespace.
 *
 * Prefers the forward primitive `anthropicMessagesApi().streamSimple` — the
 * non-deprecated public factory pi's own `custom-provider-gitlab-duo` example
 * delegates through — and falls back to the deprecated `streamSimpleAnthropic`
 * legacy alias for older hosts that predate the factory on the compat
 * entrypoint.
 * We read the delegate directly off the namespace rather than from the API
 * registry to avoid infinite recursion: the registry entry for
 * `anthropic-messages` is our own wrapper, so reading from it would loop.
 *
 * @param namespace - the imported pi-ai module namespace.
 * @returns the built-in Anthropic streaming transport.
 * @throws when neither `anthropicMessagesApi` nor `streamSimpleAnthropic`
 *   resolves to a usable transport (the `compat`-removal cliff tracked in
 *   Issue #35), surfaced loudly rather than silently mis-resolving.
 */
export function pickAnthropicStreamSimple(
  namespace: PiAiNamespace,
): AnthropicStreamSimpleDelegate {
  const factory = namespace.anthropicMessagesApi;
  if (typeof factory === "function") {
    const transport = (factory as AnthropicMessagesApi)().streamSimple;
    if (typeof transport === "function") {
      return transport as AnthropicStreamSimpleDelegate;
    }
  }

  const legacy = namespace.streamSimpleAnthropic;
  if (typeof legacy === "function") {
    return legacy as AnthropicStreamSimpleDelegate;
  }

  throw new Error(
    "Could not resolve the built-in Anthropic streamSimple transport: " +
      "@earendil-works/pi-ai/compat exported neither a callable " +
      "`anthropicMessagesApi` factory nor a `streamSimpleAnthropic` function.",
  );
}

/**
 * Resolves Pi's built-in Anthropic `streamSimple` transport at runtime.
 *
 * An `import("@earendil-works/pi-ai/compat")` goes through Pi's extension
 * loader, which aliases (Node) / virtualizes (Bun) that subpath to its bundled
 * pi-ai compat entrypoint (`dist/compat.js` on pi >=0.80.x).
 * We import the `/compat` subpath explicitly — the path pi's own
 * `custom-provider-gitlab-duo` example uses — rather than the bare root: the
 * loader aliases both to the same entrypoint, but `/compat` names the surface
 * we actually depend on.  The compat entrypoint re-exports the forward
 * `anthropicMessagesApi` factory and the deprecated `streamSimpleAnthropic`
 * alias.
 *
 * The original approach — `import.meta.resolve("@earendil-works/pi-ai")` plus a
 * dynamic import of a derived `dist/...` file path — bypassed that host
 * indirection: jiti consults its `alias`/`virtualModules` maps on the import
 * path but not on the `resolve` path, so `import.meta.resolve` fell through to
 * filesystem resolution from the extension's own directory and failed when
 * pi-ai was absent from it (the `pi install` and Bun-binary cases, Issue #31).
 *
 * @returns a Promise for the built-in Anthropic streaming transport.
 * @throws when the namespace exposes no usable Anthropic transport.
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const namespace = (await import(
    "@earendil-works/pi-ai/compat"
  )) as PiAiNamespace;
  return pickAnthropicStreamSimple(namespace);
}
