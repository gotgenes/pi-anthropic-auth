import {
  normalizeProfileResponse,
  normalizeUsageResponse,
  type UsageSnapshot,
} from "./usage-types";

export const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
export const PROFILE_ENDPOINT = "https://api.anthropic.com/api/oauth/profile";
export const OAUTH_BETA_HEADER = "oauth-2025-04-20";

export type UsageClientErrorCode =
  | "missing_token"
  | "network_error"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "server_error"
  | "http_error"
  | "invalid_json";

export class UsageClientError extends Error {
  readonly code: UsageClientErrorCode;
  readonly status: number | undefined;

  constructor(code: UsageClientErrorCode, message: string, status?: number) {
    super(message);
    this.name = "UsageClientError";
    this.code = code;
    this.status = status;
  }
}

export interface UsageClientOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
}

export async function fetchAnthropicUsage(
  accessToken: string,
  options: UsageClientOptions = {},
): Promise<UsageSnapshot> {
  const token = accessToken.trim();
  if (token === "") {
    throw new UsageClientError(
      "missing_token",
      "Anthropic OAuth credentials are not configured.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = createOAuthHeaders(token);
  const usageResponse = await fetchJson(
    fetchImpl,
    USAGE_ENDPOINT,
    headers,
    options.signal,
  );
  const usage = normalizeUsageResponse(usageResponse);
  const warnings: string[] = [];
  let account = {};

  try {
    const profileResponse = await fetchJson(
      fetchImpl,
      PROFILE_ENDPOINT,
      headers,
      options.signal,
    );
    account = normalizeProfileResponse(profileResponse);
  } catch (error) {
    warnings.push(formatProfileWarning(error));
  }

  return {
    ...usage,
    account,
    fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
    warnings,
  };
}

function createOAuthHeaders(accessToken: string): Headers {
  return new Headers({
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "anthropic-beta": OAUTH_BETA_HEADER,
  });
}

async function fetchJson(
  fetchImpl: typeof fetch,
  endpoint: string,
  headers: Headers,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, { headers, signal });
  } catch {
    throw new UsageClientError(
      "network_error",
      `Anthropic OAuth request failed for ${endpoint}.`,
    );
  }

  if (!response.ok) {
    throw createHttpError(response.status);
  }

  let body: string;
  try {
    body = await response.text();
  } catch {
    throw new UsageClientError(
      "invalid_json",
      `Anthropic OAuth response could not be read for ${endpoint}.`,
    );
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new UsageClientError(
      "invalid_json",
      `Anthropic OAuth response was not valid JSON for ${endpoint}.`,
    );
  }
}

function createHttpError(status: number): UsageClientError {
  if (status === 401) {
    return new UsageClientError(
      "unauthorized",
      "Anthropic OAuth credentials were rejected.",
      status,
    );
  }
  if (status === 403) {
    return new UsageClientError(
      "forbidden",
      "Anthropic OAuth credentials lack permission for this request.",
      status,
    );
  }
  if (status === 429) {
    return new UsageClientError(
      "rate_limited",
      "Anthropic OAuth usage requests are rate limited.",
      status,
    );
  }
  if (status >= 500) {
    return new UsageClientError(
      "server_error",
      "Anthropic OAuth service returned a server error.",
      status,
    );
  }
  return new UsageClientError(
    "http_error",
    `Anthropic OAuth request failed with status ${status}.`,
    status,
  );
}

function formatProfileWarning(error: unknown): string {
  if (error instanceof UsageClientError && error.status !== undefined) {
    return `profile request failed with status ${error.status}`;
  }
  return "profile request failed";
}
