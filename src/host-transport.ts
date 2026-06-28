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
 * The bare-root import yields the host's pi-ai compat entrypoint
 * (`dist/compat.js` on pi >=0.80.x), which the host loader aliases (Node) /
 * virtualizes (Bun) the bare specifier to.
 * This type captures only the index-signature access the resolver needs, so
 * `pickAnthropicStreamSimple` is unit-testable with a plain object.
 */
export type PiAiNamespace = Record<string, unknown>;

/**
 * Reads the built-in Anthropic `streamSimple` transport off a pi-ai namespace.
 *
 * On pi >=0.80.x the compat entrypoint re-exports `streamSimpleAnthropic` as a
 * deprecated alias of `anthropicMessagesApi().streamSimple`.
 * We read the delegate directly off the namespace rather than from the API
 * registry to avoid infinite recursion: the registry entry for
 * `anthropic-messages` is our own wrapper, so reading from it would loop.
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
 * bundled pi-ai compat entrypoint (`dist/compat.js` on pi >=0.80.x).
 * The compat entrypoint exposes `streamSimpleAnthropic` as a deprecated alias
 * of `anthropicMessagesApi().streamSimple`.
 *
 * The previous approach — `import.meta.resolve("@earendil-works/pi-ai")` plus a
 * dynamic import of a derived `dist/...` file path — bypassed that host
 * indirection: jiti consults its `alias`/`virtualModules` maps on the import
 * path but not on the `resolve` path, so `import.meta.resolve` fell through to
 * filesystem resolution from the extension's own directory and failed when
 * pi-ai was absent from it (the `pi install` and Bun-binary cases, Issue #31).
 *
 * @returns a Promise for the built-in Anthropic streaming transport.
 * @throws when the namespace does not export a `streamSimpleAnthropic` function.
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const namespace = (await import("@earendil-works/pi-ai")) as PiAiNamespace;
  return pickAnthropicStreamSimple(namespace);
}
