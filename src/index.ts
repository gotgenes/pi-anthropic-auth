import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { anthropicOAuthOverride } from "./anthropic-oauth";
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
  // registry.  Starting with pi-ai 0.79.8 the registry holds a lazy stub that,
  // on first call, runs `anthropic.ts`'s `register()` and overwrites this
  // wrapper via `registerApiProvider`'s `Map.set`.  Resolving the real
  // transport directly means our wrapper never delegates to that stub, so the
  // lazy re-register never fires and our shaping stays in place for the
  // lifetime of the session (see Issue #28).
  //
  // The factory is `async` because resolving the host transport performs a
  // dynamic import; Pi's `ExtensionFactory` permits a `Promise<void>` return,
  // and registration is deferred until the delegate is in hand so no Anthropic
  // call can resolve before our wrapper is registered.
  const streamSimpleAnthropic = await resolveBuiltinAnthropicStreamSimple();

  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
    api: "anthropic-messages",
    streamSimple: createAnthropicOAuthStreamSimple(streamSimpleAnthropic),
  });
}
