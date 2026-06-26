/**
 * Diagnostic information captured at extension load time and surfaced via the
 * `/anthropic-auth:status` command.
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
}

/**
 * Returns a compact multi-line diagnostics report suitable for display in a
 * Pi TUI notification or printed to stdout.
 */
export function formatDiagnosticsReport(d: ExtensionDiagnostics): string {
  const transport = d.transportResolved ? "resolved" : "not resolved";
  return [
    "pi-anthropic-auth diagnostics",
    `  version: ${d.version}`,
    `  module:  ${d.modulePath}`,
    `  built-in Anthropic transport: ${transport}`,
  ].join("\n");
}

/**
 * Returns a command handler that routes the diagnostics report to the Pi UI
 * notification system when a UI is available, or falls back to `console.log`
 * for headless (`-p`) and RPC invocations.
 */
export function createStatusCommandHandler(
  diagnostics: ExtensionDiagnostics,
): (args: string, ctx: StatusCommandContext) => Promise<void> {
  return (_args, ctx) => {
    const report = formatDiagnosticsReport(diagnostics);
    if (ctx.hasUI) {
      ctx.ui.notify(report, "info");
    } else {
      console.log(report);
    }
    return Promise.resolve();
  };
}
