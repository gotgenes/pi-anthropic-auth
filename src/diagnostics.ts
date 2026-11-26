import {
  type AccountLookup,
  type AccountProfile,
  lookupProviderAccount,
  type ProviderCredentials,
} from "./account-profile";
import type { ActiveEntrypoint } from "./entrypoint-setting";
import type { ShapedProvider } from "./extra-provider-shaping";

/**
 * Diagnostic information surfaced via the `/anthropic-auth:status` command.
 */
export interface ExtensionDiagnostics {
  /** Published version read from `package.json` at load time. */
  version: string;
  /** Absolute filesystem path of the loaded `src/index.ts` entry module. */
  modulePath: string;
  /**
   * Whether the built-in Anthropic `streamSimple` transport resolved
   * successfully.  Always `true` when the command is reachable: a resolution
   * failure aborts extension load before `registerCommand` runs.
   */
  transportResolved: boolean;
  /** The billing header's `cc_entrypoint` label, and which layer set it. */
  entrypoint: ActiveEntrypoint;
  /**
   * Extra providers the config files named, each registered with the shaping
   * wrapper.  `anthropic` is always shaped and is not listed here.
   */
  shapedProviders: readonly ShapedProvider[];
  /** Problems found reading the config files, one line each. */
  configWarnings: readonly string[];
}

/**
 * Narrow subset of `ExtensionCommandContext` the status handler actually uses.
 *
 * Accepting this interface instead of the full `ExtensionCommandContext` keeps
 * `createStatusCommandHandler` free of the Pi SDK so it is trivially testable
 * with a plain fake.  The real `ExtensionCommandContext` is structurally
 * assignable here, so no cast is needed at the registration call site.
 */
export interface StatusCommandContext {
  /** Whether dialog-capable UI is available (true in TUI and RPC modes). */
  hasUI: boolean;
  ui: {
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
  /** Resolves each provider's stored credential for the account lookup. */
  modelRegistry: ProviderCredentials;
}

/** One provider's account lookup, as the report lists it. */
export interface ProviderAccount {
  provider: string;
  lookup: AccountLookup;
}

/** The accounts block of the report, fetched per invocation. */
export interface AccountsReport {
  accounts: readonly ProviderAccount[];
  /**
   * Whether to show the email and organization name.  Off by default so a
   * pasted report does not identify the user.
   */
  includeIdentity: boolean;
}

/** The argument that opts the report in to identifying fields. */
const ACCOUNT_ARGUMENT = "--account";

/** An argument completion, structurally Pi's `AutocompleteItem`. */
interface ArgumentCompletion {
  value: string;
  label: string;
  description: string;
}

/**
 * Argument completions for the status command: `--account` while the typed
 * prefix still matches it, otherwise none.
 */
export function statusArgumentCompletions(
  argumentPrefix: string,
): ArgumentCompletion[] | null {
  if (!ACCOUNT_ARGUMENT.startsWith(argumentPrefix.trim())) return null;
  return [
    {
      value: ACCOUNT_ARGUMENT,
      label: ACCOUNT_ARGUMENT,
      description: "Also show each account's email and organization name",
    },
  ];
}

/**
 * Returns a compact multi-line diagnostics report suitable for display in a
 * Pi TUI notification or printed to stdout.
 */
export function formatDiagnosticsReport(
  d: ExtensionDiagnostics,
  accounts?: AccountsReport,
): string {
  const transport = d.transportResolved ? "resolved" : "not resolved";
  return [
    "pi-anthropic-auth diagnostics",
    `  version: ${d.version}`,
    `  module:  ${d.modulePath}`,
    `  built-in Anthropic transport: ${transport}`,
    `  entrypoint: ${d.entrypoint.label} (${d.entrypoint.source})`,
    formatShapedProviders(d.shapedProviders),
    ...formatAccounts(accounts),
    ...formatConfigWarnings(d.configWarnings),
  ].join("\n");
}

function formatShapedProviders(providers: readonly ShapedProvider[]): string {
  const shaped = [
    "anthropic",
    ...providers.map(({ name, layer }) => `${name} (${layer})`),
  ];
  return `  shaped providers: ${shaped.join(", ")}`;
}

function formatAccounts(report: AccountsReport | undefined): string[] {
  if (report === undefined) return [];
  return [
    "  accounts:",
    ...report.accounts.map(
      ({ provider, lookup }) =>
        `    ${provider}: ${describeLookup(lookup, report.includeIdentity)}`,
    ),
  ];
}

function describeLookup(
  lookup: AccountLookup,
  includeIdentity: boolean,
): string {
  switch (lookup.kind) {
    case "not-oauth":
      return "no OAuth login";
    case "unavailable":
      return `unavailable (${lookup.reason})`;
    case "profile":
      return describeProfile(lookup.profile, includeIdentity);
  }
}

function describeProfile(
  profile: AccountProfile,
  includeIdentity: boolean,
): string {
  const parts = [
    ...(includeIdentity ? [describeIdentity(profile)] : []),
    profile.organizationType,
    profile.seatTier && `seat ${profile.seatTier}`,
    profile.rateLimitTier && `rate limit ${profile.rateLimitTier}`,
    profile.subscriptionStatus && `subscription ${profile.subscriptionStatus}`,
    profile.hasExtraUsageEnabled === null
      ? null
      : `extra usage ${profile.hasExtraUsageEnabled ? "on" : "off"}`,
  ].filter((part): part is string => Boolean(part));
  return parts.length === 0 ? "no plan details" : parts.join(", ");
}

function describeIdentity({ email, organizationName }: AccountProfile): string {
  return [email, organizationName && `(${organizationName})`]
    .filter(Boolean)
    .join(" ");
}

function formatConfigWarnings(warnings: readonly string[]): string[] {
  if (warnings.length === 0) return [];
  return ["  config warnings:", ...warnings.map((warning) => `    ${warning}`)];
}

/**
 * Returns a command handler that routes the diagnostics report to the Pi UI
 * notification system when a UI is available, or falls back to `console.log`
 * for headless (`-p`) and RPC invocations.
 *
 * @param readDiagnostics Called on every invocation, because some of what the
 *   report shows (project-layer providers) only becomes known after the
 *   command is registered.
 */
export function createStatusCommandHandler(
  readDiagnostics: () => ExtensionDiagnostics,
): (args: string, ctx: StatusCommandContext) => Promise<void> {
  return async (args, ctx) => {
    const diagnostics = readDiagnostics();
    const providers = [
      "anthropic",
      ...diagnostics.shapedProviders.map(({ name }) => name),
    ];
    // Lookups run in parallel, so the report waits for one round trip.
    const accounts = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        lookup: await lookupProviderAccount(provider, ctx.modelRegistry),
      })),
    );
    const includeIdentity = args.trim().split(/\s+/).includes(ACCOUNT_ARGUMENT);
    emitReport(
      formatDiagnosticsReport(diagnostics, { accounts, includeIdentity }),
      ctx,
    );
  };
}

function emitReport(report: string, ctx: StatusCommandContext): void {
  if (ctx.hasUI) {
    ctx.ui.notify(report, "info");
  } else {
    console.log(report);
  }
}
