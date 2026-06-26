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
 * The bare-root import yields the host's pi-ai entrypoint namespace, which
 * differs by host version (`dist/index.js` on pi 0.79.x, `dist/compat.js` on
 * pi 0.80.x); this type captures only the index-signature access the resolver
 * needs, so `pickAnthropicStreamSimple` is unit-testable with a plain object.
 */
export type PiAiNamespace = Record<string, unknown>;

/**
 * Reads the built-in Anthropic `streamSimple` transport off a pi-ai namespace.
 *
 * Both host generations expose `streamSimpleAnthropic`: pi 0.79.x's root
 * `dist/index.js` exports it directly, and pi 0.80.x's `dist/compat.js`
 * re-exports it as a deprecated alias of `anthropicMessagesApi().streamSimple`.
 * We read this Anthropic-specific transport rather than the generic
 * `streamSimple` dispatcher, which would route through the API registry and
 * re-arm the lazy-registration clobber (Issue #28).
 *
 * @param namespace - the imported pi-ai module namespace.
 * @returns the built-in Anthropic streaming transport.
 * @throws when `streamSimpleAnthropic` is absent or not a function (the
 *   `compat`-removal cliff tracked in Issue #35), surfaced loudly rather than
 *   silently mis-resolving.
 */
export function pickAnthropicStreamSimple(
  namespace: PiAiNamespace,
): AnthropicStreamSimpleDelegate {
  const transport = namespace.streamSimpleAnthropic;
  if (typeof transport !== "function") {
    throw new Error(
      "Could not resolve the built-in Anthropic streamSimple transport: " +
        "@earendil-works/pi-ai did not export a `streamSimpleAnthropic` function.",
    );
  }
  return transport as AnthropicStreamSimpleDelegate;
}

/**
 * Resolves Pi's built-in Anthropic `streamSimple` transport at runtime.
 *
 * A bare-root `import("@earendil-works/pi-ai")` goes through Pi's extension
 * loader, which aliases (Node) / virtualizes (Bun) the bare specifier to its
 * own bundled pi-ai entrypoint (`dist/index.js` on pi 0.79.x, `dist/compat.js`
 * on pi 0.80.x).  Both expose `streamSimpleAnthropic`, so this resolves across
 * host versions and loader modes without a peer-floor bump.
 *
 * The previous approach — `import.meta.resolve("@earendil-works/pi-ai")` plus a
 * dynamic import of a derived `dist/...` file path — bypassed that host
 * indirection: jiti consults its `alias`/`virtualModules` maps on the import
 * path but not on the `resolve` path, so `import.meta.resolve` fell through to
 * filesystem resolution from the extension's own directory and failed when
 * pi-ai was absent from it (the `pi install` and Bun-binary cases, Issue #31).
 *
 * Reading the delegate directly off the namespace (rather than from the API
 * registry) also avoids pi-ai's lazy-registration clobber: the registry's
 * `anthropic-messages` entry is a stub whose first call re-registers the bare
 * built-in via `registerApiProvider`, overwriting our wrapper (Issue #28).
 *
 * @returns a Promise for the built-in Anthropic streaming transport.
 * @throws when the namespace does not export a `streamSimpleAnthropic` function.
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const namespace = (await import("@earendil-works/pi-ai")) as PiAiNamespace;
  return pickAnthropicStreamSimple(namespace);
}
