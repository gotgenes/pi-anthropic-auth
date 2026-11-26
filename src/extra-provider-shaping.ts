import type { ConfigLayer, LoadedExtensionConfig } from "./extension-config";
import type { AnthropicStreamSimple } from "./oauth-transport";

export interface ShapedProvider {
  name: string;
  layer: ConfigLayer;
}

/**
 * The one `ExtensionAPI` method this collaborator needs, narrowed so the
 * module stays free of the Pi SDK.
 */
export interface ProviderRegistrar {
  registerProvider(
    name: string,
    config: { api: "anthropic-messages"; streamSimple: AnthropicStreamSimple },
  ): void;
}

/**
 * Registers the OAuth shaping wrapper on the extra providers the config files
 * name, and remembers what it did for `/anthropic-auth:status` (Issue #70).
 *
 * Each named provider belongs to another extension (pi-multi-pass registers
 * `anthropic-2`, ...), so it is only ever *registered*, never unregistered:
 * `unregisterProvider` would drop the owner's `models` and `oauth`.  Pi's
 * `registerProvider` merges defined keys over the previous registration, so
 * `{ api, streamSimple }` overlays exactly those two keys in either load
 * order.
 *
 * The same merge means a registered `streamSimple` cannot be cleared again, so
 * layers only ever add providers: a name is registered once, under the first
 * layer that named it.
 */
export class ExtraProviderShaping {
  private readonly shaped = new Map<string, ConfigLayer>();
  private readonly warningsByLayer = new Map<ConfigLayer, readonly string[]>();

  constructor(
    private readonly registrar: ProviderRegistrar,
    private readonly streamSimple: AnthropicStreamSimple,
  ) {}

  /** Registers each not-yet-shaped provider; replaces this layer's warnings. */
  apply(config: LoadedExtensionConfig, layer: ConfigLayer): void {
    this.warningsByLayer.set(layer, config.warnings);
    for (const name of config.providers) {
      if (this.shaped.has(name)) continue;
      this.registrar.registerProvider(name, {
        api: "anthropic-messages",
        streamSimple: this.streamSimple,
      });
      this.shaped.set(name, layer);
    }
  }

  shapedProviders(): readonly ShapedProvider[] {
    return Array.from(this.shaped, ([name, layer]) => ({ name, layer }));
  }

  /**
   * Every warning the config files produced, global first, then project.
   *
   * That includes warnings about keys other than `providers` (the
   * `entrypoint` label, Issue #91): this class receives each layer's whole
   * parse result, so it reports them all, and no other consumer keeps them.
   */
  warnings(): readonly string[] {
    return [
      ...(this.warningsByLayer.get("global") ?? []),
      ...(this.warningsByLayer.get("project") ?? []),
    ];
  }
}
