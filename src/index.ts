import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createStatusCommandHandler,
  type ExtensionDiagnostics,
} from "./diagnostics";
import { resolveBuiltinAnthropicStreamSimple } from "./host-transport";
import { createAnthropicOAuthStreamSimple } from "./oauth-transport";

export default async function (pi: ExtensionAPI): Promise<void> {
  // Re-register the built-in `anthropic` provider with a thin transport
  // wrapper (`streamSimple`) that applies Claude Code OAuth request shaping
  // to every Anthropic request that reaches `provider-composer` (see the
  // coverage note below).
  //
  // Omitting `oauth` (and `models`) delegates login and refresh to Pi's
  // built-in `anthropicOAuth` and preserves Pi's built-in Anthropic model
  // list.  We previously supplied our own `oauth` override to harden refresh
  // rotation, but Pi 0.80.8 removed `loginAnthropic`/`refreshAnthropicToken`
  // from `@earendil-works/pi-ai/oauth`, so the override's deep import became
  // undefined and crashed `/login` (Issue #43); the built-in `anthropicOAuth`
  // now owns login/refresh instead.
  //
  // The transport wrapper replaces our previous `before_provider_request`
  // handler: that hook only fires for the interactive agent loop, so auxiliary
  // OAuth requests (built-in compaction, third-party background agents)
  // bypassed it and failed with Anthropic "extra usage" 400s.
  //
  // `registerProvider` stores this config in Pi's own `extensionProviders`
  // map, and `provider-composer`'s `streamWith` applies it to requests that
  // arrive through `modelRuntime`.  That covers the interactive loop and
  // compaction, which reuses `agent.streamFunction`.  It does NOT cover
  // callers that dispatch through pi-ai's own `compat.streamSimple` —
  // `agentLoop` background agents relying on `setDefaultStreamFn`, and
  // extensions calling `compat.streamSimple` directly.  Up to pi 0.80.7,
  // `ModelRegistry.applyProviderConfig` bridged us into pi-ai's api registry
  // and those calls were covered too; the 0.80.8 `ModelRuntime` rewrite
  // dropped the bridge (Issue #46).  We deliberately do not re-add it: the
  // registry is keyed by api, not provider, so an override would divert all
  // ten `anthropic-messages` providers off their built-in branch and break
  // `cloudflare-ai-gateway`.  See `docs/architecture.md` for the full record
  // and the workaround for background-agent authors.
  //
  // The delegate is the built-in Anthropic transport resolved at runtime (see
  // `resolveBuiltinAnthropicStreamSimple`) rather than read out of the api
  // registry: `anthropicMessagesApi()` is the direct, non-deprecated handle
  // pi's own `custom-provider-gitlab-duo` example uses, and reading from a
  // registry we do not participate in would bind the delegate to whatever
  // another extension registered there last.  On pi <=0.80.7 it would also
  // have recursed, since the bridge put this wrapper in that slot.  The
  // related 0.79.x lazy-registration clobber is precluded by the >=0.80.8
  // peer floor (Issue #28, Issue #40).
  //
  // The factory is `async` because resolving the host transport performs a
  // dynamic import; Pi's `ExtensionFactory` permits a `Promise<void>` return,
  // and registration is deferred until the delegate is in hand so no Anthropic
  // call can resolve before our wrapper is registered.
  const pkg = (await import("../package.json", { with: { type: "json" } })) as {
    default: { version: string };
  };
  const builtinAnthropicStreamSimple =
    await resolveBuiltinAnthropicStreamSimple();

  const diagnostics: ExtensionDiagnostics = {
    version: pkg.default.version,
    modulePath: fileURLToPath(import.meta.url),
    transportResolved: true,
  };

  // Defensively clear any prior `anthropic` registration before installing our
  // wrapper.  Pi's `registerProvider` MERGES each registration's defined values
  // over the previous one and preserves `undefined` keys (an intentional
  // upstream contract), so it cannot clear a field by omission.  A stale
  // co-loaded copy of this extension that registered an `oauth` override would
  // otherwise survive our omission of `oauth` and keep clobbering login/refresh
  // (Issue #43).  `unregisterProvider` restores the built-in `anthropic`
  // provider first, so our re-registration starts from a clean slate.
  //
  // Caveat: during the initial load phase the loader's `unregisterProvider`
  // only drops registrations that are already *pending*, so this hardens the
  // case where the stale copy loaded *before* us; it is not a full guarantee if
  // the stale copy loads afterward.  Running a single up-to-date copy remains
  // the actual fix (see the Issue #43 migration guidance).
  pi.unregisterProvider("anthropic");
  pi.registerProvider("anthropic", {
    api: "anthropic-messages",
    streamSimple: createAnthropicOAuthStreamSimple(
      builtinAnthropicStreamSimple,
    ),
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
