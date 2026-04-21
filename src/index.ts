import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { anthropicOAuthOverride } from "./anthropic-oauth.js"
import { shapeAnthropicOAuthPayload } from "./request-shaping.js"

export default function (pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
  })

  pi.on("before_provider_request", (event) => {
    return shapeAnthropicOAuthPayload(event.payload)
  })
}
