import assert from "node:assert/strict";
import test from "node:test";
import { loginAnthropic } from "@mariozechner/pi-ai/oauth";

import { mergeRefreshedCredentials } from "../src/anthropic-oauth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function getUrl(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (input instanceof Request) {
    return input.url;
  }

  throw new Error(`Unsupported fetch input: ${String(input)}`);
}

function getJsonBody(init?: RequestInit): Record<string, string> {
  if (typeof init?.body !== "string") {
    throw new Error(`Expected string request body, got ${typeof init?.body}`);
  }

  return JSON.parse(init.body) as Record<string, string>;
}

test("mergeRefreshedCredentials keeps the previous refresh token when the refresh response omits it", () => {
  const refreshed = mergeRefreshedCredentials(
    {
      access: "old-access-token",
      refresh: "existing-refresh-token",
      expires: Date.now(),
    },
    {
      access: "new-access-token",
      expires: Date.now() + 60_000,
    },
  );

  assert.equal(refreshed.access, "new-access-token");
  assert.equal(refreshed.refresh, "existing-refresh-token");
});

test("mergeRefreshedCredentials uses a rotated refresh token when one is returned", () => {
  const refreshed = mergeRefreshedCredentials(
    {
      access: "old-access-token",
      refresh: "existing-refresh-token",
      expires: Date.now(),
    },
    {
      access: "new-access-token",
      refresh: "rotated-refresh-token",
      expires: Date.now() + 60_000,
    },
  );

  assert.equal(refreshed.refresh, "rotated-refresh-token");
});

test("mergeRefreshedCredentials ignores blank rotated refresh tokens", () => {
  const refreshed = mergeRefreshedCredentials(
    {
      access: "old-access-token",
      refresh: "existing-refresh-token",
      expires: Date.now(),
    },
    {
      access: "new-access-token",
      refresh: "   ",
      expires: Date.now() + 60_000,
    },
  );

  assert.equal(refreshed.refresh, "existing-refresh-token");
});

test("loginAnthropic accepts a pasted localhost callback URL and preserves that redirect_uri", async (t) => {
  let authUrl = "";
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(getUrl(input), "https://platform.claude.com/v1/oauth/token");
    assert.equal(init?.method, "POST");

    const body = getJsonBody(init);
    assert.equal(body.grant_type, "authorization_code");
    assert.equal(body.code, "manual-code");
    assert.equal(body.redirect_uri, "http://localhost:53692/callback");

    return jsonResponse({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const credentials = await loginAnthropic({
    onAuth: (info) => {
      authUrl = info.url;
    },
    onPrompt: async () => "",
    onManualCodeInput: async () => {
      const url = new URL(authUrl);
      const state = url.searchParams.get("state");
      const redirectUri = url.searchParams.get("redirect_uri");

      if (!state || !redirectUri) {
        throw new Error("Missing OAuth state or redirect_uri in auth URL");
      }

      return `${redirectUri}?code=manual-code&state=${state}`;
    },
  });

  assert.equal(credentials.access, "access-token");
  assert.equal(credentials.refresh, "refresh-token");
});

test("loginAnthropic rejects a pasted callback URL with a mismatched state", async () => {
  let authUrl = "";

  await assert.rejects(
    () =>
      loginAnthropic({
        onAuth: (info) => {
          authUrl = info.url;
        },
        onPrompt: async () => "",
        onManualCodeInput: async () => {
          const url = new URL(authUrl);
          const redirectUri = url.searchParams.get("redirect_uri");

          if (!redirectUri) {
            throw new Error("Missing OAuth redirect_uri in auth URL");
          }

          return `${redirectUri}?code=manual-code&state=wrong-state`;
        },
      }),
    /OAuth state mismatch/,
  );
});

// --- Callback parsing edge cases ---

/**
 * Helper: extracts the expected OAuth state from the auth URL emitted by
 * loginAnthropic, then calls loginAnthropic with the given manualInput and
 * promptFallback strings.  Returns the promise so callers can assert on
 * resolution or rejection.
 */
function loginWithManualInput(
  t: { after: (fn: () => void) => void },
  manualInput: string | ((state: string, redirectUri: string) => string),
  options: {
    promptFallback?: string;
    stubFetch?: boolean;
  } = {},
): Promise<{ access: string; refresh: string; expires: number }> {
  const { promptFallback = "", stubFetch = false } = options;
  let authUrl = "";
  const originalFetch = globalThis.fetch;

  if (stubFetch) {
    globalThis.fetch = (async () =>
      jsonResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
      })) as typeof fetch;
  }

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return loginAnthropic({
    onAuth: (info) => {
      authUrl = info.url;
    },
    onPrompt: async () => promptFallback,
    onManualCodeInput: async () => {
      const url = new URL(authUrl);
      const state = url.searchParams.get("state") ?? "";
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";

      return typeof manualInput === "function"
        ? manualInput(state, redirectUri)
        : manualInput;
    },
  }) as Promise<{ access: string; refresh: string; expires: number }>;
}

test("loginAnthropic throws when callback URL has no code parameter", async (t) => {
  await assert.rejects(
    () =>
      loginWithManualInput(
        t,
        (_state, redirectUri) => `${redirectUri}?foo=bar`,
      ),
    /Missing authorization code/,
  );
});

test("loginAnthropic throws on empty string manual input", async (t) => {
  await assert.rejects(
    () => loginWithManualInput(t, ""),
    /Missing authorization code/,
  );
});

test("loginAnthropic throws on whitespace-only manual input", async (t) => {
  await assert.rejects(
    () => loginWithManualInput(t, "   "),
    /Missing authorization code/,
  );
});

test("loginAnthropic accepts a callback URL with extra query parameters", async (t) => {
  const credentials = await loginWithManualInput(
    t,
    (state, redirectUri) =>
      `${redirectUri}?code=extra-params-code&state=${state}&extra=ignored&another=param`,
    { stubFetch: true },
  );

  assert.equal(credentials.access, "access-token");
});

test("loginAnthropic accepts URL-encoded values in callback parameters", async (t) => {
  const credentials = await loginWithManualInput(
    t,
    (state, redirectUri) =>
      `${redirectUri}?code=${encodeURIComponent("code/with+special=chars")}&state=${state}`,
    { stubFetch: true },
  );

  assert.equal(credentials.access, "access-token");
});

test("loginAnthropic accepts a bare authorization code as manual input", async (t) => {
  const credentials = await loginWithManualInput(t, "bare-auth-code", {
    stubFetch: true,
  });

  assert.equal(credentials.access, "access-token");
});

test("loginAnthropic rejects a non-URL string with a mismatched state fragment", async (t) => {
  await assert.rejects(
    () => loginWithManualInput(t, "some-code#wrong-state"),
    /OAuth state mismatch/,
  );
});
