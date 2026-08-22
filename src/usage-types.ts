export interface UsageWindow {
  id: string;
  label: string;
  utilizationPercent: number;
  resetAt: string | null;
  source: string;
  model?: string;
  scope?: string;
  severity?: string;
  isActive?: boolean;
}

export interface ExtraUsage {
  enabled: boolean;
  monthlyLimit: number | null;
  usedCredits: number | null;
  utilizationPercent: number | null;
  currency: string | null;
  decimalPlaces: number | null;
  disabledReason: string | null;
  userDisabled: boolean | null;
  spendLimitReached: boolean | null;
  creditsEverEnabled: boolean | null;
}

export interface SpendInfo {
  usedMinor: number | null;
  limitMinor: number | null;
  currency: string | null;
  exponent: number | null;
  utilizationPercent: number | null;
  enabled: boolean | null;
  disabledReason: string | null;
  canPurchaseCredits: boolean | null;
  canToggle: boolean | null;
  disclaimer: string | null;
}

export interface NormalizedUsageData {
  windows: UsageWindow[];
  extraUsage?: ExtraUsage;
  spend?: SpendInfo;
  memberDashboardAvailable?: boolean;
}

export interface UsageSnapshot extends NormalizedUsageData {
  fetchedAt: string;
  account: AccountInfo;
  warnings: string[];
}

export interface AccountInfo {
  accountUuid?: string;
  fullName?: string;
  displayName?: string;
  email?: string;
  hasClaudeMax?: boolean;
  hasClaudePro?: boolean;
  createdAt?: string;
  organizationUuid?: string;
  organizationName?: string;
  organizationType?: string;
  billingType?: string;
  rateLimitTier?: string;
  seatTier?: string | null;
  hasExtraUsageEnabled?: boolean;
  subscriptionStatus?: string;
}

const LEGACY_WINDOW_LABELS: Record<string, { label: string; model?: string }> =
  {
    five_hour: { label: "5-hour session" },
    seven_day: { label: "7-day all models" },
    seven_day_cowork: { label: "Cowork weekly", model: "cowork" },
    seven_day_oauth_apps: { label: "OAuth apps weekly", model: "oauth-apps" },
    seven_day_omelette: { label: "Omelette weekly", model: "omelette" },
    seven_day_opus: { label: "Opus weekly", model: "opus" },
    seven_day_routines: { label: "Routines weekly", model: "routines" },
    seven_day_sonnet: { label: "Sonnet weekly", model: "sonnet" },
  };

const USAGE_METADATA_KEYS = new Set([
  "extra_usage",
  "limits",
  "member_dashboard_available",
  "spend",
]);

export function normalizeUsageResponse(input: unknown): NormalizedUsageData {
  const response = asRecord(input);
  if (!response) return { windows: [] };

  const windows: UsageWindow[] = [];
  const knownKeys = new Set<string>();

  for (const [key, metadata] of Object.entries(LEGACY_WINDOW_LABELS)) {
    const window = parseQuotaWindow(
      response[key],
      key,
      metadata.label,
      metadata.model,
    );
    if (!window) continue;
    windows.push(window);
    knownKeys.add(key);
  }

  for (const [key, value] of Object.entries(response)) {
    if (knownKeys.has(key) || USAGE_METADATA_KEYS.has(key)) continue;
    const window = parseQuotaWindow(
      value,
      key,
      `Additional quota (${humanizeIdentifier(key)})`,
    );
    if (window) windows.push(window);
  }

  const limits = Array.isArray(response.limits) ? response.limits : [];
  for (const [index, value] of limits.entries()) {
    const limit = asRecord(value);
    const percent = asNumber(limit?.percent);
    if (!limit || percent === undefined) continue;
    const group = asString(limit.group);
    const kind = asString(limit.kind);
    const scope = asString(limit.scope);
    const resetAt = asNullableString(limit.resets_at);
    const severity = asString(limit.severity);
    const isActive = asBoolean(limit.is_active);
    const label = group ?? kind ?? `Additional quota (Limit ${index + 1})`;
    windows.push({
      id: `limits:${index}`,
      label,
      utilizationPercent: percent,
      resetAt,
      source: "limits",
      ...(scope === undefined ? {} : { scope }),
      ...(severity === undefined ? {} : { severity }),
      ...(isActive === undefined ? {} : { isActive }),
    });
  }

  const result: NormalizedUsageData = { windows };
  const extraUsage = parseExtraUsage(response.extra_usage);
  if (extraUsage) result.extraUsage = extraUsage;
  const spend = parseSpend(response.spend);
  if (spend) result.spend = spend;
  const memberDashboardAvailable = asBoolean(
    response.member_dashboard_available,
  );
  if (memberDashboardAvailable !== undefined) {
    result.memberDashboardAvailable = memberDashboardAvailable;
  }
  return result;
}

export function normalizeProfileResponse(input: unknown): AccountInfo {
  const response = asRecord(input);
  if (!response) return {};
  const account = asRecord(response.account);
  const organization = asRecord(response.organization);
  const result: AccountInfo = {};

  setString(result, "accountUuid", account?.uuid);
  setString(result, "fullName", account?.full_name);
  setString(result, "displayName", account?.display_name);
  setString(result, "email", account?.email);
  setBoolean(result, "hasClaudeMax", account?.has_claude_max);
  setBoolean(result, "hasClaudePro", account?.has_claude_pro);
  setString(result, "createdAt", account?.created_at);
  setString(result, "organizationUuid", organization?.uuid);
  setString(result, "organizationName", organization?.name);
  setString(result, "organizationType", organization?.organization_type);
  setString(result, "billingType", organization?.billing_type);
  setString(result, "rateLimitTier", organization?.rate_limit_tier);
  setNullableString(result, "seatTier", organization?.seat_tier);
  setBoolean(
    result,
    "hasExtraUsageEnabled",
    organization?.has_extra_usage_enabled,
  );
  setString(result, "subscriptionStatus", organization?.subscription_status);
  return result;
}

function parseQuotaWindow(
  input: unknown,
  id: string,
  label: string,
  model?: string,
): UsageWindow | undefined {
  const value = asRecord(input);
  const utilizationPercent = asNumber(value?.utilization);
  if (!value || utilizationPercent === undefined) return undefined;
  const resetAt = asNullableString(value.resets_at);
  return {
    id,
    label,
    utilizationPercent,
    resetAt,
    source: id,
    ...(model === undefined ? {} : { model }),
  };
}

function parseExtraUsage(input: unknown): ExtraUsage | undefined {
  const value = asRecord(input);
  const enabled = asBoolean(value?.is_enabled);
  if (!value || enabled === undefined) return undefined;
  return {
    enabled,
    monthlyLimit: asNullableNumber(value.monthly_limit),
    usedCredits: asNullableNumber(value.used_credits),
    utilizationPercent: asNullableNumber(value.utilization),
    currency: asNullableString(value.currency),
    decimalPlaces: asNullableNumber(value.decimal_places),
    disabledReason: asNullableString(value.disabled_reason),
    userDisabled: asNullableBoolean(value.user_disabled),
    spendLimitReached: asNullableBoolean(value.spend_limit_reached),
    creditsEverEnabled: asNullableBoolean(value.credits_ever_enabled),
  };
}

function parseSpend(input: unknown): SpendInfo | undefined {
  const value = asRecord(input);
  if (!value) return undefined;
  const used = asRecord(value.used);
  const limit = asRecord(value.limit);
  return {
    usedMinor: asNullableNumber(used?.amount_minor),
    limitMinor: asNullableNumber(limit?.amount_minor),
    currency: asNullableString(used?.currency ?? limit?.currency),
    exponent: asNullableNumber(used?.exponent ?? limit?.exponent),
    utilizationPercent: asNullableNumber(value.percent),
    enabled: asNullableBoolean(value.enabled),
    disabledReason: asNullableString(value.disabled_reason),
    canPurchaseCredits: asNullableBoolean(value.can_purchase_credits),
    canToggle: asNullableBoolean(value.can_toggle),
    disclaimer: asNullableString(value.disclaimer),
  };
}

function humanizeIdentifier(value: string): string {
  return value
    .replaceAll(/[-_]+/g, " ")
    .replace(/\boauth\b/gi, "OAuth")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : (asString(value) ?? null);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asNullableNumber(value: unknown): number | null {
  return value === null ? null : (asNumber(value) ?? null);
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNullableBoolean(value: unknown): boolean | null {
  return value === null ? null : (asBoolean(value) ?? null);
}

function setString<T extends keyof AccountInfo>(
  target: AccountInfo,
  key: T,
  value: unknown,
): void {
  const stringValue = asString(value);
  if (stringValue !== undefined) target[key] = stringValue as AccountInfo[T];
}

function setNullableString<T extends keyof AccountInfo>(
  target: AccountInfo,
  key: T,
  value: unknown,
): void {
  if (value === null) {
    target[key] = null as AccountInfo[T];
    return;
  }
  setString(target, key, value);
}

function setBoolean<T extends keyof AccountInfo>(
  target: AccountInfo,
  key: T,
  value: unknown,
): void {
  const booleanValue = asBoolean(value);
  if (booleanValue !== undefined) target[key] = booleanValue as AccountInfo[T];
}
