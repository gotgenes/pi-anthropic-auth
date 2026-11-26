import { DEFAULT_CLAUDE_CODE_ENTRYPOINT } from "./billing-header";
import type { ConfigLayer, LoadedExtensionConfig } from "./extension-config";

/** Where the active entrypoint label came from. */
export type EntrypointSource = "default" | ConfigLayer;

/** The billing header's `cc_entrypoint` label, and which layer set it. */
export interface ActiveEntrypoint {
  label: string;
  source: EntrypointSource;
}

/**
 * Resolves the billing header's `cc_entrypoint` label across the config
 * layers (Issue #91): a trusted project's label, else the global one, else
 * {@link DEFAULT_CLAUDE_CODE_ENTRYPOINT}.
 *
 * Unlike the extra providers, which only ever accumulate, the label is a
 * single last-wins value, so each layer's entry is replaced on every apply.
 * Config warnings are not kept here: `ExtraProviderShaping` already reports
 * every warning a file produced.
 */
export class EntrypointSetting {
  private readonly byLayer = new Map<ConfigLayer, string>();

  /** Replaces this layer's label: sets it, or clears it when the file sets none. */
  apply(
    config: Pick<LoadedExtensionConfig, "entrypoint">,
    layer: ConfigLayer,
  ): void {
    if (config.entrypoint === undefined) {
      this.byLayer.delete(layer);
      return;
    }
    this.byLayer.set(layer, config.entrypoint);
  }

  current(): ActiveEntrypoint {
    for (const layer of LAYER_PRECEDENCE) {
      const label = this.byLayer.get(layer);
      if (label !== undefined) return { label, source: layer };
    }
    return { label: DEFAULT_CLAUDE_CODE_ENTRYPOINT, source: "default" };
  }
}

/** Highest precedence first. */
const LAYER_PRECEDENCE: readonly ConfigLayer[] = ["project", "global"];
