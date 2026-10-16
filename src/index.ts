import { fileURLToPath } from "node:url";
import {
  type ExtensionAPI,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import {
  createStatusCommandHandler,
  type ExtensionDiagnostics,
  statusArgumentCompletions,
} from "./diagnostics";
import {
  globalConfigPath,
  loadExtensionConfig,
  projectConfigPath,
} from "./extension-config";
import { ExtraProviderShaping } from "./extra-provider-shaping";
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
  // arrive through `modelRuntime`.  That covers the interactive loop,
  // compaction (which reuses `agent.streamFunction`), and extension model
  // calls through `ctx.modelRegistry.streamSimple()` (pi >=0.86.0), the
  // supported path for background agents.  It does NOT cover callers that
  // dispatch through pi-ai's own `compat.streamSimple` — extensions passing
  // it explicitly, and untyped callers that omit `streamFn` and land on the
  // `setDefaultStreamFn` fallback.  Up to pi 0.80.7,
  // `ModelRegistry.applyProviderConfig` bridged us into pi-ai's api registry
  // and those calls were covered too; the 0.80.8 `ModelRuntime` rewrite
  // dropped the bridge (Issue #46).  We deliberately do not re-add it: the
  // registry is keyed by api, not provider, so an override would divert all
  // ten `anthropic-messages` providers off their built-in branch, and staying
  // exact for `cloudflare-ai-gateway` would mean re-implementing compat's own
  // dispatch (Issue #53).  See `docs/architecture.md` for the full record and
  // the supported path for extension authors.
  //
  // The delegate is the built-in Anthropic transport resolved at runtime (see
  // `resolveBuiltinAnthropicStreamSimple`) rather than read out of the api
  // registry: `anthropicMessagesApi()` is the direct, non-deprecated handle
  // pi's own `custom-provider-gitlab-duo` example uses, and reading from a
  // registry we do not participate in would bind the delegate to whatever
  // another extension registered there last.  On pi <=0.80.7 it would also
  // have recursed, since the bridge put this wrapper in that slot.  The
  // related 0.79.x lazy-registration clobber is precluded by the >=0.86.0
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

  // One wrapper instance owns the learned Claude Code floor (Issue #75), so
  // every provider it is registered on shares that floor.
  const streamSimple = createAnthropicOAuthStreamSimple(
    builtinAnthropicStreamSimple,
  );

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
    streamSimple,
  });

  // `provider-composer`'s `streamWith` looks the extension config up by the
  // request's provider *name*, so an Anthropic OAuth subscription another
  // extension registers under its own name (pi-multi-pass's `anthropic-2`)
  // falls through to the bare built-in transport: Claude Code headers but no
  // billing header, which Anthropic answers with a misleading "out of extra
  // usage" 400 (Issue #70).  The user names those providers in the config
  // file, and each is registered with the same wrapper.  The global layer is
  // applied here, so a named provider is shaped before any request reaches
  // it, like `anthropic`.
  const extraProviders = new ExtraProviderShaping(pi, streamSimple);
  extraProviders.apply(
    loadExtensionConfig(globalConfigPath(getAgentDir())),
    "global",
  );

  // The project layer needs the session's cwd and trust decision, which only
  // arrive with `session_start`.  An untrusted project's file is never read.
  // `session_start` is awaited before the first prompt, and pi looks the
  // provider up per request, so a project provider is shaped from the first
  // request too.  Warnings from both layers are reported here, where a UI is
  // in hand.
  pi.on("session_start", (_event, ctx) => {
    if (ctx.isProjectTrusted()) {
      extraProviders.apply(
        loadExtensionConfig(projectConfigPath(ctx.cwd)),
        "project",
      );
    }
    reportConfigWarnings(extraProviders.warnings(), ctx);
  });

  const loadDiagnostics = {
    version: pkg.default.version,
    modulePath: fileURLToPath(import.meta.url),
    transportResolved: true,
  };
  const readDiagnostics = (): ExtensionDiagnostics => ({
    ...loadDiagnostics,
    shapedProviders: extraProviders.shapedProviders(),
    configWarnings: extraProviders.warnings(),
  });

  // The /anthropic-auth:status command surfaces the loaded version, module
  // path, transport resolution result, and shaped providers so users can
  // confirm the extension is actually loaded, from which install location,
  // and which providers it covers.  It also looks up the Anthropic account
  // behind each shaped provider's OAuth login, so users with several logins
  // can tell them apart (Issue #80).  The email and organization name appear
  // only with `--account`, because users paste this report into issues.
  pi.registerCommand("anthropic-auth:status", {
    description:
      "Show pi-anthropic-auth diagnostics: version, loaded module path, transport status, shaped providers, and each provider's subscription (--account adds email and organization).",
    getArgumentCompletions: statusArgumentCompletions,
    handler: createStatusCommandHandler(readDiagnostics),
  });
}

/** The `session_start` context fields warning reporting reads. */
interface WarningReportContext {
  hasUI: boolean;
  ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}

function reportConfigWarnings(
  warnings: readonly string[],
  ctx: WarningReportContext,
): void {
  for (const warning of warnings) {
    const message = `[pi-anthropic-auth] ${warning}`;
    if (ctx.hasUI) {
      ctx.ui.notify(message, "warning");
    } else {
      console.warn(message);
    }
  }
}
