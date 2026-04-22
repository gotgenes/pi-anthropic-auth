import type {
  OAuthCredentials,
  OAuthLoginCallbacks,
} from "@mariozechner/pi-ai";
import {
  loginAnthropic,
  refreshAnthropicToken,
} from "@mariozechner/pi-ai/oauth";

export function mergeRefreshedCredentials(
  credentials: OAuthCredentials,
  refreshed: Partial<OAuthCredentials>,
): OAuthCredentials {
  return {
    ...credentials,
    ...refreshed,
    refresh:
      typeof refreshed.refresh === "string" &&
      refreshed.refresh.trim().length > 0
        ? refreshed.refresh
        : credentials.refresh,
  };
}

export const anthropicOAuthOverride = {
  name: "Anthropic (Claude Pro/Max)",
  login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
    return loginAnthropic(callbacks);
  },
  async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const refreshed = await refreshAnthropicToken(credentials.refresh);

    return mergeRefreshedCredentials(credentials, refreshed);
  },
  getApiKey(credentials: OAuthCredentials): string {
    return credentials.access;
  },
} as const;
