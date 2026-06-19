import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  SimpleStreamOptions,
  StreamFunction,
} from "@earendil-works/pi-ai";

/**
 * The concrete file the `@earendil-works/pi-ai` `./anthropic` subpath maps to
 * across every supported version (verified 0.79.1 through 0.79.8).
 *
 * Both the exports-map target and the on-disk layout are stable, so deriving
 * the package root from the resolved root entry and joining this relative path
 * lands on the real provider module regardless of which pi-ai install is
 * active.
 */
const ANTHROPIC_PROVIDER_RELATIVE_PATH = "dist/providers/anthropic.js";

/**
 * Resolves Pi's built-in Anthropic `streamSimple` transport at runtime.
 *
 * A static `import { streamSimpleAnthropic } from "@earendil-works/pi-ai/anthropic"`
 * does **not** work under Pi's extension loader: pi loads extensions with
 * `jiti`, whose alias map covers `@earendil-works/pi-ai` (→ the host's
 * `dist/index.js`) and `@earendil-works/pi-ai/oauth` but **not** the
 * `./anthropic` subpath.  jiti's prefix-based alias matching turns the
 * subpath import into `dist/index.js/anthropic` — a nonexistent path — and
 * `import.meta.resolve("@earendil-works/pi-ai/anthropic")` fails the same way.
 *
 * `import.meta.resolve("@earendil-works/pi-ai")` *does* resolve (jiti's alias
 * handles the bare specifier), so this helper resolves the root entry, derives
 * the package directory, and dynamically imports the concrete provider file —
 * the same file the `exports` `./anthropic` subpath points at.  That yields
 * the real `streamSimpleAnthropic`, not pi-ai 0.79.8's lazy registry stub
 * (see Issue #28).
 *
 * Resolving the delegate this way (rather than capturing it from the API
 * registry) is what keeps our `streamSimple` wrapper from being clobbered by
 * the lazy stub's first-call `register()`.
 *
 * @returns the built-in `streamSimpleAnthropic` transport.
 * @throws when the root package cannot be resolved or the provider module
 *   does not export `streamSimpleAnthropic` (e.g. a future pi-ai layout
 *   change).
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<
  StreamFunction<"anthropic-messages", SimpleStreamOptions>
> {
  const rootUrl = import.meta.resolve("@earendil-works/pi-ai");
  const rootFile = fileURLToPath(rootUrl);
  // `<pkg>/dist/index.js` → `<pkg>/dist` → `<pkg>`.
  const packageDir = dirname(dirname(rootFile));
  // `pathToFileURL` (not `new URL(path, "file:///")`) percent-encodes path
  // components, so an install path containing `#` or `?` resolves correctly.
  const providerModuleUrl = pathToFileURL(
    join(packageDir, ANTHROPIC_PROVIDER_RELATIVE_PATH),
  ).href;

  const module = (await import(providerModuleUrl)) as {
    streamSimpleAnthropic?: unknown;
  };
  const transport = module.streamSimpleAnthropic;
  if (typeof transport !== "function") {
    throw new Error(
      `Resolved Anthropic provider module ${providerModuleUrl} does not export streamSimpleAnthropic.`,
    );
  }
  return transport as StreamFunction<"anthropic-messages", SimpleStreamOptions>;
}
