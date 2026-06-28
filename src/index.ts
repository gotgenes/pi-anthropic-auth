import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { anthropicOAuthOverride } from "./anthropic-oauth";
import {
  createStatusCommandHandler,
  type ExtensionDiagnostics,
} from "./diagnostics";
import { resolveBuiltinAnthropicStreamSimple } from "./host-transport";
import { createAnthropicOAuthStreamSimple } from "./oauth-transport";

export default async function (pi: ExtensionAPI): Promise<void> {
  // Re-register the built-in `anthropic` provider with:
  //   1. our OAuth login + refresh override (`oauth`), and
  //   2. a thin transport wrapper (`streamSimple`) that applies Claude Code
  //      OAuth request shaping on every Anthropic call path.
  //
  // Omitting `models` preserves Pi's built-in Anthropic model list.  The
  // transport wrapper replaces our previous `before_provider_request` handler:
  // that hook only fires for the interactive agent loop, so auxiliary OAuth
  // requests (built-in compaction, third-party background agents) bypassed it
  // and failed with Anthropic "extra usage" 400s.  Registering `streamSimple`
  // routes through Pi's singleton API registry, so the same shaping now covers
  // the main loop, `completeSimple` compaction, and `agentLoop` background work.
  //
  // The delegate is the built-in `streamSimpleAnthropic` resolved at runtime
  // (see `resolveBuiltinAnthropicStreamSimple`) rather than read out of the
  // registry, to avoid infinite recursion: the registry entry for
  // `anthropic-messages` is this wrapper, so delegating to the registry would
  // loop.  On pi >=0.80.0, the floor also precludes the older 0.79.x
  // lazy-registration clobber that would have displaced this wrapper on the
  // second turn (Issue #28, fixed by the >=0.80.0 peer floor in Issue #40).
  //
  // The factory is `async` because resolving the host transport performs a
  // dynamic import; Pi's `ExtensionFactory` permits a `Promise<void>` return,
  // and registration is deferred until the delegate is in hand so no Anthropic
  // call can resolve before our wrapper is registered.
  const pkg = (await import("../package.json", { with: { type: "json" } })) as {
    default: { version: string };
  };
  const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple();

  const diagnostics: ExtensionDiagnostics = {
    version: pkg.default.version,
    modulePath: fileURLToPath(import.meta.url),
    transportResolved: true,
  };

  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
    api: "anthropic-messages",
    streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic),
  });

  // The /anthropic-auth:status command surfaces the loaded version, module
  // path, and transport resolution result so users can confirm the extension
  // is actually loaded and from which install location.
  pi.registerCommand("anthropic-auth:status", {
    description:
      "Show pi-anthropic-auth diagnostics: version, loaded module path, and transport status.",
    handler: createStatusCommandHandler(diagnostics),
  });
}
