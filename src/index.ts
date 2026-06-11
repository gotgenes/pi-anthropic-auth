import { getApiProvider } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { anthropicOAuthOverride } from "./anthropic-oauth";
import { createAnthropicOAuthStreamSimple } from "./oauth-transport";

export default function (pi: ExtensionAPI) {
  // Capture Pi's built-in anthropic-messages transport BEFORE we override it,
  // so our wrapper can delegate to it (delegating to the registered wrapper
  // instead would recurse).  pi-ai registers its built-ins on import, so this
  // is resolved by the time extensions load.
  const builtinTransport = getApiProvider("anthropic-messages");

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
  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
    ...(builtinTransport
      ? {
          api: "anthropic-messages",
          streamSimple: createAnthropicOAuthStreamSimple(
            builtinTransport.streamSimple,
          ),
        }
      : {}),
  });
}
