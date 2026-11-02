import { estimateCost } from "../pricing";
import { startOfLocalDay } from "../history";
import type { UsageEvent } from "../types";
import type { CollectorResult } from "./types";

const TIMEOUT_MS = 9_000;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function eventId(providerId: string, at: number, model: string): string {
  return `${providerId}:${Math.floor(at / 60_000)}:${model}`;
}

/* ------------------------------------------------------------------ */
/* Anthropic Admin API                                                 */
/* ------------------------------------------------------------------ */

export async function collectAnthropic(now = Date.now()): Promise<CollectorResult | null> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return null;

  const result: CollectorResult = { providerId: "anthropic", ok: true, at: now, events: [] };
  const headers = {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  };
  const startingAt = new Date(now - 3 * 3_600_000).toISOString();

  try {
    let page: string | null = null;
    for (let i = 0; i < 3; i++) {
      const params = new URLSearchParams({
        starting_at: startingAt,
        bucket_width: "1m",
        limit: "180",
      });
      params.append("group_by[]", "model");
      if (page) params.set("page", page);
      const data = (await getJson(
        `https://api.anthropic.com/v1/organizations/usage_report/messages?${params.toString()}`,
        headers,
      )) as {
        data?: {
          starting_at?: string;
          results?: {
            model?: string;
            uncached_input_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
            output_tokens?: number;
          }[];
        }[];
        has_more?: boolean;
        next_page?: string | null;
      };

      for (const bucket of data.data ?? []) {
        const at = bucket.starting_at ? Date.parse(bucket.starting_at) : now;
        const byModel = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>();
        for (const row of bucket.results ?? []) {
          const cacheWrite =
            (row.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
            (row.cache_creation?.ephemeral_1h_input_tokens ?? 0);
          const cacheRead = row.cache_read_input_tokens ?? 0;
          const inputTokens = (row.uncached_input_tokens ?? 0) + cacheRead + cacheWrite;
          const outputTokens = row.output_tokens ?? 0;
          if (inputTokens + outputTokens <= 0) continue;
          const model = row.model ?? "custom-model";
          const entry = byModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
          entry.input += inputTokens;
          entry.output += outputTokens;
          entry.cacheRead += cacheRead;
          entry.cacheWrite += cacheWrite;
          byModel.set(model, entry);
        }
        for (const [model, usage] of byModel) {
          const event: UsageEvent = {
            id: eventId("anthropic", at, model),
            at,
            providerId: "anthropic",
            model,
            inputTokens: usage.input,
            outputTokens: usage.output,
            cacheReadTokens: usage.cacheRead,
            cacheWriteTokens: usage.cacheWrite,
            requests: Math.max(1, Math.round((usage.input + usage.output) / 2500)),
            source: "official",
          };
          event.costUsd = estimateCost(model, event);
          result.events.push(event);
        }
      }

      if (!data.has_more || !data.next_page) break;
      page = data.next_page;
    }

    result.note = `${result.events.length} usage buckets`;
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : "usage report failed";
  }

  try {
    const params = new URLSearchParams({
      starting_at: new Date(startOfLocalDay(now)).toISOString(),
      bucket_width: "1d",
      limit: "1",
    });
    const data = (await getJson(
      `https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`,
      headers,
    )) as { data?: { results?: { amount?: string | number; currency?: string }[] }[] };
    let cents = 0;
    for (const bucket of data.data ?? []) {
      for (const row of bucket.results ?? []) cents += numberValue(row.amount);
    }
    if (cents > 0) result.costToday = cents / 100;
  } catch {
    // Cost reporting is optional; usage still renders without it.
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* OpenAI Admin API                                                    */
/* ------------------------------------------------------------------ */

export async function collectOpenAI(now = Date.now()): Promise<CollectorResult | null> {
  const key = process.env.OPENAI_ADMIN_KEY;
  if (!key) return null;

  const result: CollectorResult = { providerId: "openai", ok: true, at: now, events: [] };
  const headers = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const startTime = Math.floor((now - 3 * 3_600_000) / 60_000) * 60;

  try {
    let page: string | null = null;
    for (let i = 0; i < 3; i++) {
      const params = new URLSearchParams({
        start_time: String(startTime),
        bucket_width: "1m",
        limit: "180",
        group_by: "model",
      });
      if (page) params.set("page", page);
      const data = (await getJson(
        `https://api.openai.com/v1/organization/usage/completions?${params.toString()}`,
        headers,
      )) as {
        data?: {
          start_time?: number;
          results?: {
            model?: string | null;
            input_tokens?: number;
            input_cached_tokens?: number;
            output_tokens?: number;
            num_model_requests?: number;
          }[];
        }[];
        has_more?: boolean;
        next_page?: string | null;
      };

      for (const bucket of data.data ?? []) {
        const at = (bucket.start_time ?? now / 1000) * 1000;
        const byModel = new Map<string, { input: number; output: number; cached: number; requests: number }>();
        for (const row of bucket.results ?? []) {
          const inputTokens = row.input_tokens ?? 0;
          const outputTokens = row.output_tokens ?? 0;
          if (inputTokens + outputTokens <= 0) continue;
          const model = row.model ?? "custom-model";
          const entry = byModel.get(model) ?? { input: 0, output: 0, cached: 0, requests: 0 };
          entry.input += inputTokens;
          entry.output += outputTokens;
          entry.cached += row.input_cached_tokens ?? 0;
          entry.requests += row.num_model_requests ?? 0;
          byModel.set(model, entry);
        }
        for (const [model, usage] of byModel) {
          const event: UsageEvent = {
            id: eventId("openai", at, model),
            at,
            providerId: "openai",
            model,
            inputTokens: usage.input,
            outputTokens: usage.output,
            cacheReadTokens: usage.cached,
            requests: usage.requests || Math.max(1, Math.round((usage.input + usage.output) / 2500)),
            source: "official",
          };
          event.costUsd = estimateCost(model, event);
          result.events.push(event);
        }
      }

      if (!data.has_more || !data.next_page) break;
      page = data.next_page;
    }

    result.note = `${result.events.length} usage buckets`;
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : "usage report failed";
  }

  try {
    const params = new URLSearchParams({
      start_time: String(Math.floor(startOfLocalDay(now) / 1000)),
      bucket_width: "1d",
      limit: "1",
      group_by: "line_item",
    });
    const data = (await getJson(
      `https://api.openai.com/v1/organization/costs?${params.toString()}`,
      headers,
    )) as { data?: { results?: { amount?: { value?: number; currency?: string } }[] }[] };
    let total = 0;
    for (const bucket of data.data ?? []) {
      for (const row of bucket.results ?? []) total += numberValue(row.amount?.value);
    }
    if (total > 0) result.costToday = total;
  } catch {
    // Optional: keep usage without official cost.
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* OpenRouter                                                          */
/* ------------------------------------------------------------------ */

export async function collectOpenRouter(now = Date.now()): Promise<CollectorResult | null> {
  const key = process.env.OPENROUTER_API_KEY;
  const managementKey = process.env.OPENROUTER_MANAGEMENT_KEY;
  if (!key && !managementKey) return null;

  const result: CollectorResult = { providerId: "openrouter", ok: false, at: now, events: [] };

  try {
    const data = (await getJson("https://openrouter.ai/api/v1/key", {
      Authorization: `Bearer ${key ?? managementKey}`,
    })) as {
      data?: {
        usage?: number;
        usage_daily?: number;
        usage_weekly?: number;
        usage_monthly?: number;
        limit?: number | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
      };
      usage_daily?: number;
      usage?: number;
    };
    const info: {
      usage?: number;
      usage_daily?: number;
      usage_weekly?: number;
      usage_monthly?: number;
      limit?: number | null;
      limit_remaining?: number | null;
      is_free_tier?: boolean;
    } = data.data ?? { usage_daily: data.usage_daily, usage: data.usage };
    result.ok = true;
    result.costToday = numberValue(info.usage_daily ?? info.usage ?? 0);
    result.note = "Spend-only source — OpenRouter exposes credits, not tokens";
    if (info.limit && info.limit > 0) {
      const used = numberValue(info.usage);
      result.quota = [
        {
          id: "credit",
          label: "Key limit",
          usedPct: Math.min(100, (used / info.limit) * 100),
          windowSeconds: 30 * 24 * 3600,
          resetsAt: null,
          provenance: "official",
          note: `${numberValue(info.limit_remaining)} credits remaining`,
        },
      ];
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "OpenRouter key lookup failed";
  }

  if (managementKey) {
    try {
      const credits = (await getJson("https://openrouter.ai/api/v1/credits", {
        Authorization: `Bearer ${managementKey}`,
      })) as { data?: { total_credits?: number; total_usage?: number } };
      if (credits.data) {
        const remaining = numberValue(credits.data.total_credits) - numberValue(credits.data.total_usage);
        result.balance = { amount: remaining, currency: "USD", label: "Credits" };
        result.ok = true;
      }
    } catch {
      // Balance stays unavailable without a management key.
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* DeepSeek                                                            */
/* ------------------------------------------------------------------ */

export async function collectDeepSeek(now = Date.now()): Promise<CollectorResult | null> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  const result: CollectorResult = { providerId: "deepseek", ok: false, at: now, events: [] };
  try {
    const data = (await getJson("https://api.deepseek.com/user/balance", {
      Authorization: `Bearer ${key}`,
    })) as {
      is_available?: boolean;
      balance_infos?: { currency?: string; total_balance?: string; granted_balance?: string; topped_up_balance?: string }[];
    };
    result.ok = true;
    const info = data.balance_infos?.[0];
    if (info) {
      result.balance = {
        amount: numberValue(info.total_balance),
        currency: info.currency ?? "USD",
        label: "Balance",
      };
    }
    result.note = "Balance-only source — token usage is metered from local calls";
  } catch (error) {
    result.error = error instanceof Error ? error.message : "DeepSeek balance lookup failed";
  }
  return result;
}

export const REMOTE_COLLECTORS = {
  anthropic: collectAnthropic,
  openai: collectOpenAI,
  openrouter: collectOpenRouter,
  deepseek: collectDeepSeek,
};
