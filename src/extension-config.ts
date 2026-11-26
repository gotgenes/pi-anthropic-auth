import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The extension's JSON config file, read from a global and a project layer.
 *
 * Both keys are optional:
 *
 * ```json
 * { "providers": ["anthropic-2", "anthropic-3"], "entrypoint": "pi-agent" }
 * ```
 *
 * `providers` names extra providers to shape alongside `anthropic`.  Pi
 * applies an extension's `streamSimple` per provider *name*, so an Anthropic
 * OAuth subscription another extension registers under its own name
 * (pi-multi-pass's `anthropic-2`) is shaped only when the user names it here
 * (Issue #70).
 *
 * `entrypoint` replaces the billing header's default `cc_entrypoint` label
 * (Issue #91).
 *
 * Nothing in this module throws: a malformed file or entry becomes a warning,
 * so a typo can never take down `anthropic` shaping with it.
 */
export interface LoadedExtensionConfig {
  /** Provider names to shape, de-duplicated, never including `anthropic`. */
  providers: readonly string[];
  /**
   * The billing header's `cc_entrypoint` label this file sets; the key is
   * absent when the file sets none or sets an invalid one.
   */
  entrypoint?: string;
  /** One line per problem, each prefixed with the file path. */
  warnings: readonly string[];
}

/** Which config file a value came from. */
export type ConfigLayer = "global" | "project";

const EXTENSION_ID = "pi-anthropic-auth";
const CONFIG_FILENAME = "config.json";

/** `<agentDir>/extensions/pi-anthropic-auth/config.json` */
export function globalConfigPath(agentDir: string): string {
  return join(agentDir, "extensions", EXTENSION_ID, CONFIG_FILENAME);
}

/** `<cwd>/.pi/extensions/pi-anthropic-auth/config.json` */
export function projectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "extensions", EXTENSION_ID, CONFIG_FILENAME);
}

/**
 * Reads and parses the config file at `path`.
 *
 * A missing file is the normal case (most users never create one), so it
 * names no providers and warns about nothing.  Any other read error is a
 * warning.
 */
export function loadExtensionConfig(
  path: string,
  readFile: (path: string) => string = (p) => readFileSync(p, "utf8"),
): LoadedExtensionConfig {
  let text: string;
  try {
    text = readFile(path);
  } catch (error) {
    if (isMissingFileError(error)) return EMPTY_CONFIG;
    return withWarning(`${path}: could not be read (${errorMessage(error)})`);
  }
  return parseExtensionConfig(text, path);
}

/** Parses config text; `path` only labels the warnings. */
export function parseExtensionConfig(
  text: string,
  path: string,
): LoadedExtensionConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return withWarning(`${path}: is not valid JSON (${errorMessage(error)})`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return withWarning(`${path}: must contain a JSON object`);
  }

  const providers = parseProviders(parsed, path);
  const entrypoint = parseEntrypoint(parsed, path);
  return {
    providers: providers.providers,
    ...(entrypoint.entrypoint !== undefined && {
      entrypoint: entrypoint.entrypoint,
    }),
    warnings: [...providers.warnings, ...entrypoint.warnings],
  };
}

/** A parsed config file, before any of its keys are checked. */
type ConfigObject = { providers?: unknown; entrypoint?: unknown };

interface ParsedProviders {
  providers: readonly string[];
  warnings: readonly string[];
}

function parseProviders(config: ConfigObject, path: string): ParsedProviders {
  const configured = config.providers;
  if (configured === undefined) return { providers: [], warnings: [] };
  if (!Array.isArray(configured)) {
    return {
      providers: [],
      warnings: [`${path}: "providers" must be an array of provider names`],
    };
  }

  return parseProviderEntries(configured, path);
}

interface ParsedEntrypoint {
  entrypoint: string | undefined;
  warnings: readonly string[];
}

/**
 * Labels the billing header can carry verbatim.  `;` and whitespace would end
 * the `cc_entrypoint` field; `"`, `\`, and control characters would be escaped
 * in the JSON request body, where the billing-version sync's exact-string
 * rebuild could no longer find the header (Issue #91).
 */
const ENTRYPOINT_LABEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

function parseEntrypoint(config: ConfigObject, path: string): ParsedEntrypoint {
  const configured = config.entrypoint;
  if (configured === undefined) return { entrypoint: undefined, warnings: [] };
  if (
    typeof configured !== "string" ||
    !ENTRYPOINT_LABEL_PATTERN.test(configured)
  ) {
    return {
      entrypoint: undefined,
      warnings: [
        `${path}: "entrypoint" must be a label of letters, digits, ".", "_", and "-" that starts with a letter or digit, received ${JSON.stringify(configured)}`,
      ],
    };
  }
  return { entrypoint: configured, warnings: [] };
}

/**
 * Provider ids as Pi's own providers and the `provider/model` selector spell
 * them.  A name outside this shape could never be selected, so it is almost
 * certainly a typo.
 */
const PROVIDER_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Always shaped by this extension, so naming it is redundant. */
const ALWAYS_SHAPED_PROVIDER = "anthropic";

function parseProviderEntries(
  entries: readonly unknown[],
  path: string,
): ParsedProviders {
  const providers: string[] = [];
  const warnings: string[] = [];
  entries.forEach((entry, index) => {
    if (typeof entry !== "string" || !PROVIDER_NAME_PATTERN.test(entry)) {
      warnings.push(
        `${path}: providers[${index}] must be a provider name, received ${JSON.stringify(entry)}`,
      );
      return;
    }
    if (entry === ALWAYS_SHAPED_PROVIDER || providers.includes(entry)) return;
    providers.push(entry);
  });
  return { providers, warnings };
}

const EMPTY_CONFIG: LoadedExtensionConfig = { providers: [], warnings: [] };

function withWarning(warning: string): LoadedExtensionConfig {
  return { providers: [], warnings: [warning] };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
