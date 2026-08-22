import { fetchAnthropicUsage } from "./usage-client";
import { UsageSnapshotCache } from "./usage-cache";
import { isAnthropicOAuthToken } from "./oauth-transport";
import type {
  AccountInfo,
  ExtraUsage,
  SpendInfo,
  UsageSnapshot,
  UsageWindow,
} from "./usage-types";

const ANTHROPIC_PROVIDER = "anthropic";
const BAR_WIDTH = 24;
const USAGE_REQUEST_TIMEOUT_MS = 15_000;
const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_RESET = `${ANSI_ESCAPE}[0m`;
const ANSI_BLUE = `${ANSI_ESCAPE}[94m`;
const ANSI_CYAN = "\u001b[36m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RED = "\u001b[31m";

type UsageNoticeType = "info" | "warning" | "error";

interface ProviderAuthResult {
  auth: { apiKey?: string };
}

interface UsageTui {
  requestRender(): void;
}

export interface UsageUiComponent {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
}

export interface UsageCommandContext {
  mode: "tui" | "rpc" | "json" | "print";
  hasUI: boolean;
  modelRegistry: {
    getProviderAuth(provider: string): Promise<ProviderAuthResult | undefined>;
  };
  ui: {
    notify(message: string, type?: UsageNoticeType): void;
    custom(
      factory: (
        tui: UsageTui,
        theme: unknown,
        keybindings: unknown,
        done: (result: undefined) => void,
      ) => UsageUiComponent,
    ): Promise<undefined>;
  };
}

export interface UsageCommandOptions {
  cache?: UsageSnapshotCache;
  fetchUsage?: typeof fetchAnthropicUsage;
}

export function createUsageCommandHandler(
  options: UsageCommandOptions = {},
): (args: string, ctx: UsageCommandContext) => Promise<void> {
  const cache = options.cache ?? new UsageSnapshotCache();
  const fetchUsage = options.fetchUsage ?? fetchAnthropicUsage;

  return async (_args, ctx) => {
    try {
      const auth = await ctx.modelRegistry.getProviderAuth(ANTHROPIC_PROVIDER);
      const accessToken = auth?.auth.apiKey;
      if (!isAnthropicOAuthToken(accessToken)) {
        throw new Error("Anthropic OAuth login is required for usage data.");
      }

      const cached = await cache.get(
        () =>
          fetchUsage(accessToken, {
            signal: AbortSignal.timeout(USAGE_REQUEST_TIMEOUT_MS),
          }),
        accessToken,
      );
      if (ctx.mode === "tui") {
        await showUsageDashboard(
          ctx,
          cached.snapshot,
          cached.stale,
          cached.error,
        );
        return;
      }

      const report = formatUsageReport(
        cached.snapshot,
        cached.stale,
        cached.error,
      );
      notifyOrPrint(ctx, report, cached.stale ? "warning" : "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifyOrPrint(ctx, `Anthropic usage unavailable: ${message}`, "error");
    }
  };
}

export function formatUsageReport(
  snapshot: UsageSnapshot,
  stale = false,
  error?: string,
): string {
  const lines = [
    "Anthropic usage",
    `  updated: ${snapshot.fetchedAt}${stale ? " (stale)" : ""}`,
    ...snapshot.windows.map(formatWindow),
  ];
  if (hasAdditionalQuota(snapshot.windows)) {
    lines.push(
      "  note: Additional quota names are Anthropic-defined; 0% means no reported usage.",
    );
  }
  if (snapshot.extraUsage) lines.push(...formatExtraUsage(snapshot.extraUsage));
  if (snapshot.spend) lines.push(...formatSpend(snapshot.spend));
  if (snapshot.account.email) {
    lines.push(`  email: ${sanitizeText(snapshot.account.email)}`);
  }
  if (snapshot.account.organizationName) {
    lines.push(
      `  organization: ${sanitizeText(snapshot.account.organizationName)}`,
    );
  }
  const billingType = formatBillingType(snapshot.account.billingType);
  if (billingType) lines.push(`  billing: ${billingType}`);
  if (snapshot.memberDashboardAvailable !== undefined) {
    lines.push(
      `  member dashboard: ${String(snapshot.memberDashboardAvailable)}`,
    );
  }
  const subscriptionNote = formatSubscriptionNote(snapshot.account);
  if (subscriptionNote) lines.push(subscriptionNote);
  if (snapshot.warnings.length > 0) {
    lines.push(
      ...snapshot.warnings.map(
        (warning) => `  warning: ${sanitizeText(warning)}`,
      ),
    );
  }
  if (error) lines.push(`  warning: ${sanitizeText(error)}`);
  return lines.join("\n");
}

export function createUsageDashboardComponent(
  snapshot: UsageSnapshot,
  stale: boolean,
  error: string | undefined,
  tui: UsageTui,
  done: () => void,
): UsageUiComponent {
  return new UsageDashboard(snapshot, stale, error, tui, done);
}

async function showUsageDashboard(
  ctx: UsageCommandContext,
  snapshot: UsageSnapshot,
  stale: boolean,
  error: string | undefined,
): Promise<void> {
  await ctx.ui.custom((tui, _theme, _keybindings, done) =>
    createUsageDashboardComponent(snapshot, stale, error, tui, () =>
      done(undefined),
    ),
  );
}

function notifyOrPrint(
  ctx: UsageCommandContext,
  message: string,
  type: UsageNoticeType,
): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, type);
  } else {
    console.log(message);
  }
}

class UsageDashboard implements UsageUiComponent {
  private tab = 0;

  constructor(
    private readonly snapshot: UsageSnapshot,
    private readonly stale: boolean,
    private readonly error: string | undefined,
    private readonly tui: UsageTui,
    private readonly done: () => void,
  ) {}

  render(width: number): string[] {
    const title = `${colorize("Anthropic usage", ANSI_CYAN)}  ${colorize(
      `[${this.stale ? "stale" : "live"}]`,
      this.stale ? ANSI_YELLOW : ANSI_GREEN,
    )}`;
    const tabs = ["Usage", "Account", "Extra Usage"]
      .map((label, index) => {
        const tab = index === this.tab ? `[${label}]` : ` ${label} `;
        return index === this.tab ? colorize(tab, ANSI_CYAN) : tab;
      })
      .join("  ");
    const lines = [blueRule(width), "", title, tabs, ""];
    if (this.tab === 0) lines.push(...this.renderUsageTab());
    if (this.tab === 1) lines.push(...this.renderAccountTab());
    if (this.tab === 2) lines.push(...this.renderExtraUsageTab());
    if (this.error) lines.push("", `Warning: ${sanitizeText(this.error)}`);
    lines.push(
      "",
      "1 Usage  2 Account  3 Extra Usage  Tab switch  Esc/q close",
      blueRule(width),
    );
    return lines.map((line) => truncateLine(line, width));
  }

  handleInput(data: string): void {
    if (data === "\u001b" || data === "q" || data === "Q") {
      this.done();
      return;
    }
    if (data === "1" || data === "2" || data === "3") {
      this.tab = Number(data) - 1;
      this.tui.requestRender();
      return;
    }
    if (data === "\t" || data === "\u001b[C") {
      this.tab = (this.tab + 1) % 3;
      this.tui.requestRender();
      return;
    }
    if (data === "\u001b[D") {
      this.tab = (this.tab + 2) % 3;
      this.tui.requestRender();
    }
  }

  invalidate(): void {}

  private renderUsageTab(): string[] {
    if (this.snapshot.windows.length === 0)
      return ["No usage windows returned."];
    const lines = this.snapshot.windows.flatMap((window) => {
      const color = isAdditionalQuota(window)
        ? ANSI_RED
        : quotaColor(window.utilizationPercent, window.severity);
      return [
        colorize(
          `${sanitizeText(window.label)}: ${formatPercent(window.utilizationPercent)}`,
          color,
        ),
        `  ${usageBar(window.utilizationPercent, color)}${formatReset(window.resetAt)}`,
      ];
    });
    if (hasAdditionalQuota(this.snapshot.windows)) {
      lines.unshift(
        "Note: Additional quota names are Anthropic-defined; 0% means no reported usage.",
        "",
      );
    }
    return lines;
  }

  private renderAccountTab(): string[] {
    const lines = [
      `  last updated: ${sanitizeText(this.snapshot.fetchedAt)}`,
      ...formatAccount(this.snapshot.account),
    ];
    if (this.snapshot.memberDashboardAvailable !== undefined) {
      lines.push(
        `  member dashboard: ${String(this.snapshot.memberDashboardAvailable)}`,
      );
    }
    const subscriptionNote = formatSubscriptionNote(this.snapshot.account);
    if (subscriptionNote) lines.push(subscriptionNote);
    return lines;
  }

  private renderExtraUsageTab(): string[] {
    const lines = this.snapshot.extraUsage
      ? formatExtraUsage(this.snapshot.extraUsage).map((line) => line.trim())
      : ["No extra usage data returned."];
    if (this.snapshot.spend) {
      lines.push(
        "",
        ...formatSpend(this.snapshot.spend).map((line) => line.trim()),
      );
    }
    return lines;
  }
}

function isAdditionalQuota(window: UsageWindow): boolean {
  return window.label.startsWith("Additional quota (");
}

function hasAdditionalQuota(windows: UsageWindow[]): boolean {
  return windows.some(isAdditionalQuota);
}

function formatWindow(window: UsageWindow): string {
  return `  ${sanitizeText(window.label)}: ${formatPercent(window.utilizationPercent)}${formatReset(window.resetAt)}`;
}

function formatAccount(account: AccountInfo): string[] {
  const fields: Array<[string, string | boolean | undefined]> = [
    ["email", account.email],
    ["account", account.accountUuid],
    ["organization", account.organizationName],
    ["organization id", account.organizationUuid],
    ["rate-limit tier", account.rateLimitTier],
    ["subscription", account.subscriptionStatus],
    ["billing", formatBillingType(account.billingType)],
    ["Claude Max", account.hasClaudeMax],
    ["Claude Pro", account.hasClaudePro],
  ];
  const lines = fields
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => `  ${label}: ${sanitizeText(String(value))}`);
  return lines.length > 0 ? lines : ["  No account data returned."];
}

function formatBillingType(
  billingType: string | undefined,
): string | undefined {
  if (billingType === undefined) return undefined;
  if (billingType === "apple_subscription") return "Apple App Store";
  if (billingType === "google_subscription") return "Google Play Store";
  return sanitizeText(billingType.replaceAll("_", " "));
}

function formatSubscriptionNote(account: AccountInfo): string | undefined {
  if (account.subscriptionStatus !== "canceled") return undefined;
  const billingSource = formatBillingType(account.billingType);
  if (
    billingSource !== "Apple App Store" &&
    billingSource !== "Google Play Store"
  ) {
    return "  note: Subscription is marked canceled; check the billing provider for renewal status.";
  }
  return `  note: Subscription billing is managed through ${billingSource}; check that store for renewal status.`;
}

function formatExtraUsage(extraUsage: ExtraUsage): string[] {
  const remainingCredits =
    extraUsage.monthlyLimit !== null && extraUsage.usedCredits !== null
      ? Math.max(0, extraUsage.monthlyLimit - extraUsage.usedCredits)
      : null;
  return [
    `  enabled: ${String(extraUsage.enabled)}`,
    `  credits used: ${formatCreditAmount(
      extraUsage.usedCredits,
      extraUsage.currency,
      extraUsage.decimalPlaces,
    )}`,
    `  monthly limit: ${formatCreditAmount(
      extraUsage.monthlyLimit,
      extraUsage.currency,
      extraUsage.decimalPlaces,
    )}`,
    `  remaining credits: ${formatCreditAmount(
      remainingCredits,
      extraUsage.currency,
      extraUsage.decimalPlaces,
    )}`,
    `  utilization: ${formatNullablePercent(extraUsage.utilizationPercent)}`,
    `  currency: ${sanitizeText(extraUsage.currency ?? "unknown")}`,
    `  disabled reason: ${sanitizeText(extraUsage.disabledReason ?? "n/a")}`,
  ];
}

function formatSpend(spend: SpendInfo): string[] {
  return [
    `  spend enabled: ${formatNullableBoolean(spend.enabled)}`,
    `  spent: ${formatMinorAmount(spend.usedMinor, spend.currency, spend.exponent)}`,
    `  spend limit: ${formatMinorAmount(spend.limitMinor, spend.currency, spend.exponent)}`,
    `  spend utilization: ${formatNullablePercent(spend.utilizationPercent)}`,
    `  can purchase credits: ${formatNullableBoolean(spend.canPurchaseCredits)}`,
    `  spend disabled reason: ${sanitizeText(spend.disabledReason ?? "n/a")}`,
  ];
}

function usageBar(percent: number, color = quotaColor(percent)): string {
  const ratio = Math.max(0, Math.min(100, percent)) / 100;
  const filled = Math.round(ratio * BAR_WIDTH);
  const bar = `[${"█".repeat(filled)}${"░".repeat(BAR_WIDTH - filled)}] `;
  return colorize(bar, color);
}

function quotaColor(percent: number, severity?: string): string {
  const normalizedSeverity = severity?.toLowerCase();
  if (normalizedSeverity === "critical" || normalizedSeverity === "error") {
    return ANSI_RED;
  }
  if (normalizedSeverity === "warning") return ANSI_YELLOW;
  if (percent >= 80) return ANSI_RED;
  if (percent >= 50) return ANSI_YELLOW;
  return ANSI_GREEN;
}

function colorize(value: string, color: string): string {
  return `${color}${value}${ANSI_RESET}`;
}

function blueRule(width: number): string {
  return width > 0 ? colorize("─".repeat(width), ANSI_BLUE) : "";
}

function formatPercent(percent: number): string {
  return `${trimNumber(percent)}%`;
}

function formatNullablePercent(percent: number | null): string {
  return percent === null ? "unknown" : formatPercent(percent);
}

function formatNullableBoolean(value: boolean | null): string {
  return value === null ? "unknown" : String(value);
}

function formatReset(resetAt: string | null): string {
  if (resetAt === null) return "";
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return `, resets ${sanitizeText(resetAt)}`;

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `, resets ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

function formatAmount(
  amount: number | null,
  currency: string | null,
  fractionDigits = 1,
): string {
  return amount === null
    ? "unknown"
    : `${trimNumber(amount, fractionDigits)} ${sanitizeText(currency ?? "credits")}`;
}

function formatCreditAmount(
  amount: number | null,
  currency: string | null,
  decimalPlaces: number | null,
): string {
  if (amount === null) return "unknown";
  const scale = decimalPlaces ?? 0;
  return formatAmount(amount / 10 ** scale, currency, scale);
}

function formatMinorAmount(
  amountMinor: number | null,
  currency: string | null,
  exponent: number | null,
): string {
  if (amountMinor === null) return "unknown";
  if (exponent === null) {
    return `${trimNumber(amountMinor)} minor ${sanitizeText(currency ?? "units")}`;
  }
  return formatAmount(amountMinor / 10 ** exponent, currency, exponent);
}

function trimNumber(value: number, fractionDigits = 1): string {
  if (Number.isInteger(value)) return String(value);
  const digits = Math.max(0, Math.min(6, fractionDigits));
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

function sanitizeText(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 31 && code !== 127) sanitized += character;
  }
  return sanitized;
}

function truncateLine(value: string, width: number): string {
  if (width <= 0) return "";
  const ansiPattern = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g");
  const ansiPrefixPattern = new RegExp(`^${ANSI_ESCAPE}\\[[0-9;]*m`);
  if (value.replace(ansiPattern, "").length <= width) return value;

  let output = "";
  let visibleLength = 0;
  let index = 0;
  while (index < value.length && visibleLength < width - 1) {
    const sgrMatch = ansiPrefixPattern.exec(value.slice(index));
    if (sgrMatch) {
      output += sgrMatch[0];
      index += sgrMatch[0].length;
      continue;
    }
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    const character = String.fromCodePoint(codePoint);
    output += character;
    index += character.length;
    visibleLength += 1;
  }

  return `${output}…${value.includes(ANSI_ESCAPE) ? ANSI_RESET : ""}`;
}
