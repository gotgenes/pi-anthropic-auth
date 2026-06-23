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
 * A candidate location and export name to try when resolving Pi's built-in
 * Anthropic transport from the installed `@earendil-works/pi-ai` package.
 *
 * The resolver tries candidates in order and returns the first that yields
 * a function — allowing the extension to span both the legacy layout
 * (`dist/providers/anthropic.js` / `streamSimpleAnthropic`, pi-ai ≤ 0.79.x)
 * and the new API-split layout (`dist/api/anthropic-messages.js` /
 * `streamSimple`) without requiring a peer-dependency floor bump.
 */
export interface AnthropicTransportCandidate {
  readonly relativePath: string;
  readonly exportName: string;
}

/**
 * A function that dynamically imports a module by URL and returns its
 * namespace as a plain record.
 *
 * The injectable seam lets unit tests substitute a fake importer so the
 * new-layout and legacy fallback branches can be exercised without installing
 * the unreleased pi-ai version.
 */
export type ModuleImporter = (url: string) => Promise<Record<string, unknown>>;

/**
 * Ordered list of candidates to try when resolving Pi's built-in Anthropic
 * streaming transport.
 *
 * New layout first (pi-ai api/* split, `streamSimple`), legacy second
 * (pi-ai ≤ 0.79.x, `streamSimpleAnthropic`).  The first candidate whose
 * module loads **and** exports the named function wins.
 */
const ANTHROPIC_TRANSPORT_CANDIDATES: readonly AnthropicTransportCandidate[] = [
  // New layout (pi-ai api/* split): dist/api/anthropic-messages.js exports streamSimple.
  {
    relativePath: "dist/api/anthropic-messages.js",
    exportName: "streamSimple",
  },
  // Legacy layout (pi-ai <= 0.79.x): dist/providers/anthropic.js exports streamSimpleAnthropic.
  {
    relativePath: "dist/providers/anthropic.js",
    exportName: "streamSimpleAnthropic",
  },
];

/**
 * Resolves Pi's built-in Anthropic `streamSimple` transport at runtime.
 *
 * A static `import { streamSimple } from "@earendil-works/pi-ai/anthropic"`
 * does **not** work under Pi's extension loader: pi loads extensions with
 * `jiti`, whose alias map covers `@earendil-works/pi-ai` (→ the host's
 * `dist/index.js`) and `@earendil-works/pi-ai/oauth` but **not** the
 * `./anthropic` subpath.  jiti's prefix-based alias matching turns the
 * subpath import into `dist/index.js/anthropic` — a nonexistent path — and
 * `import.meta.resolve("@earendil-works/pi-ai/anthropic")` fails the same way.
 *
 * `import.meta.resolve("@earendil-works/pi-ai")` *does* resolve (jiti's alias
 * handles the bare specifier), so this function resolves the root entry,
 * derives the package directory, and delegates to `selectAnthropicStreamSimple`
 * with the real `import()` to try both the new-layout path (`dist/api/
 * anthropic-messages.js`, export `streamSimple`) and the legacy path
 * (`dist/providers/anthropic.js`, export `streamSimpleAnthropic`).
 *
 * Resolving the delegate directly (rather than capturing it from the API
 * registry) also prevents pi-ai 0.79.8's lazy-registration clobber: the
 * registry's `anthropic-messages` entry is a stub whose first call
 * re-registers the bare built-in via `registerApiProvider`, overwriting our
 * wrapper (Issue #28).
 *
 * @returns a Promise for the built-in Anthropic streaming transport.
 * @throws when no candidate path exports a function matching its `exportName`.
 */
export function resolveBuiltinAnthropicStreamSimple(): Promise<AnthropicStreamSimpleDelegate> {
  const rootUrl = import.meta.resolve("@earendil-works/pi-ai");
  // `<pkg>/dist/index.js` → `<pkg>/dist` → `<pkg>`.
  const packageDir = dirname(dirname(fileURLToPath(rootUrl)));
  return selectAnthropicStreamSimple(
    packageDir,
    ANTHROPIC_TRANSPORT_CANDIDATES,
    (url) => import(url) as Promise<Record<string, unknown>>,
  );
}

/**
 * Iterates `candidates` in order, importing each from `packageDir` via
 * `importModule`, and returns the first export that is a function.
 *
 * When a module import rejects (e.g. absent path on the current layout) or the
 * named export is not a function, that candidate is recorded in the error
 * accumulator and the next is tried.  Throws an aggregated `Error` naming
 * every attempted path and reason when no candidate succeeds.
 *
 * @param packageDir - absolute path to the root of the installed pi-ai package.
 * @param candidates - ordered list of `{ relativePath, exportName }` to try.
 * @param importModule - injectable module loader; production callers pass
 *   `(url) => import(url)`, tests pass a fake.
 */
export async function selectAnthropicStreamSimple(
  packageDir: string,
  candidates: readonly AnthropicTransportCandidate[],
  importModule: ModuleImporter,
): Promise<AnthropicStreamSimpleDelegate> {
  const attempts: string[] = [];
  for (const { relativePath, exportName } of candidates) {
    // `pathToFileURL` (not `new URL(path, "file:///")`) percent-encodes path
    // components so an install path containing `#` or `?` resolves correctly.
    const moduleUrl = pathToFileURL(join(packageDir, relativePath)).href;
    let mod: Record<string, unknown>;
    try {
      mod = await importModule(moduleUrl);
    } catch {
      attempts.push(`${relativePath} (import failed)`);
      continue;
    }
    const transport = mod[exportName];
    if (typeof transport === "function") {
      return transport as AnthropicStreamSimpleDelegate;
    }
    attempts.push(`${relativePath} (no ${exportName} export)`);
  }
  throw new Error(
    `Could not resolve the built-in Anthropic streamSimple transport from @earendil-works/pi-ai. Tried: ${attempts.join("; ")}.`,
  );
}
