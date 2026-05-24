import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { anthropicOAuthOverride } from "./anthropic-oauth";
import { shapeAnthropicOAuthPayload } from "./request-shaping";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
  });

  pi.on("before_provider_request", (event) => {
    return shapeAnthropicOAuthPayload(event.payload);
  });
}
