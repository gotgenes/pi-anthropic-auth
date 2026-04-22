import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { anthropicOAuthOverride } from "./anthropic-oauth.js"
import { shapeAnthropicOAuthPayload } from "./request-shaping.js"
import { shapeAnthropicOAuthSystemPrompt } from "./system-prompt-shaping.js"

export default function (pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    oauth: anthropicOAuthOverride,
  })

  pi.on("before_agent_start", (event) => {
    return {
      systemPrompt: shapeAnthropicOAuthSystemPrompt(event.systemPrompt),
    }
  })

  pi.on("before_provider_request", (event) => {
    return shapeAnthropicOAuthPayload(event.payload)
  })
}
