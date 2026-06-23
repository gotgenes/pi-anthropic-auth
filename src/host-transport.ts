import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
 * Walks up the directory tree from `startDir`, checking for
 * `node_modules/<packageName>` at each level.
 *
 * This mirrors Node.js's native CommonJS module resolution traversal and
 * works regardless of how the loader (jiti) handles `import.meta.resolve`.
 * In particular, when this extension is installed via `pi install`, the host
 * `@earendil-works/pi-ai` package lives in a parent `node_modules` directory
 * rather than the extension's own — a location that jiti's
 * `import.meta.resolve` fails to reach (Issue #31).
 */
async function findNearestPackageDir(
  packageName: string,
  startDir: string,
): Promise<string | null> {
  let current = startDir;
  while (true) {
    const candidate = join(current, "node_modules", packageName);
    try {
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) return null; // reached filesystem root
      current = parent;
    }
  }
}

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
 * Previously this helper used `import.meta.resolve("@earendil-works/pi-ai")`
 * to locate the package root.  That worked in local dev (where the package is
 * a dev dependency and present in the extension's own `node_modules`) but
 * failed when the extension was installed via `pi install npm:...`: Pi's
 * package installer runs `npm install --omit=dev`, so only `dependencies` are
 * installed.  `@earendil-works/pi-ai` is a peer/dev dependency, so it is
 * absent from the extension's own `node_modules` tree, and jiti's
 * `import.meta.resolve` cannot reach the copy that lives in Pi's shared
 * `node_modules` directory (Issue #31).
 *
 * The fix is a manual filesystem walk (`findNearestPackageDir`) that climbs
 * parent directories until it finds `node_modules/@earendil-works/pi-ai`,
 * mirroring what Node.js's own resolution algorithm does.  This is independent
 * of the loader, so it works in both local dev and `pi install` environments.
 *
 * Resolving the delegate this way (rather than capturing it from the API
 * registry) is what keeps our `streamSimple` wrapper from being clobbered by
 * the lazy stub's first-call `register()` (Issue #28).
 *
 * @returns the built-in `streamSimpleAnthropic` transport.
 * @throws when the package cannot be found or the provider module
 *   does not export `streamSimpleAnthropic` (e.g. a future pi-ai layout
 *   change).
 */
export async function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const startDir = dirname(fileURLToPath(import.meta.url));
  const packageDir = await findNearestPackageDir(
    "@earendil-works/pi-ai",
    startDir,
  );

  if (packageDir === null) {
    throw new Error(
      "Could not find @earendil-works/pi-ai in any parent node_modules directory. " +
        "Ensure @earendil-works/pi-ai is installed alongside this extension.",
    );
  }

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
  return transport as AnthropicStreamSimpleDelegate;
}
