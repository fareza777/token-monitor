import { estimateCost } from "./pricing";
import type { Bucket, RangeKey, SeriesPoint, UsageEvent } from "./types";

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function startOfLocalDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfLocalMonth(at: number): number {
  const d = new Date(at);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function emptyBucket(t: number): Bucket {
  return { t, tokens: 0, cost: 0, requests: 0, providers: {}, models: {} };
}

function credit(
  bucket: Bucket,
  providerId: string,
  model: string,
  tokens: number,
  cost: number,
  requests: number,
) {
  bucket.tokens += tokens;
  bucket.cost += cost;
  bucket.requests += requests;
  const provider = (bucket.providers[providerId] ??= { tokens: 0, cost: 0, requests: 0 });
  provider.tokens += tokens;
  provider.cost += cost;
  provider.requests += requests;
  const key = `${providerId}|${model}`;
  const modelEntry = (bucket.models[key] ??= { tokens: 0, cost: 0, requests: 0 });
  modelEntry.tokens += tokens;
  modelEntry.cost += cost;
  modelEntry.requests += requests;
}

export interface ProviderTotals {
  tokens: number;
  cost: number;
  requests: number;
}

export class History {
  minutes = new Map<number, Bucket>();
  hours = new Map<number, Bucket>();
  days = new Map<number, Bucket>();

  add(event: UsageEvent): number {
    const tokens = Math.max(0, event.inputTokens + event.outputTokens);
    if (tokens <= 0) return 0;
    const cost = event.costUsd ?? estimateCost(event.model, event);
    const requests = event.requests ?? 1;
    const minuteKey = Math.floor(event.at / MINUTE) * MINUTE;
    const hourKey = Math.floor(event.at / HOUR) * HOUR;
    const dayKey = startOfLocalDay(event.at);

    credit(this.minutes.get(minuteKey) ?? this.put(this.minutes, minuteKey), event.providerId, event.model, tokens, cost, requests);
    credit(this.hours.get(hourKey) ?? this.put(this.hours, hourKey), event.providerId, event.model, tokens, cost, requests);
    credit(this.days.get(dayKey) ?? this.put(this.days, dayKey), event.providerId, event.model, tokens, cost, requests);
    return cost;
  }

  /** Aggregate remote buckets without inventing per-request detail. */
  addAggregate(
    at: number,
    providerId: string,
    modelTokens: { model: string; tokens: number; cost: number }[],
    requests: number,
  ): void {
    const minuteKey = Math.floor(at / MINUTE) * MINUTE;
    const hourKey = Math.floor(at / HOUR) * HOUR;
    const dayKey = startOfLocalDay(at);
    for (const [map, key] of [
      [this.minutes, minuteKey],
      [this.hours, hourKey],
      [this.days, dayKey],
    ] as const) {
      const bucket = (map as Map<number, Bucket>).get(key) ?? this.put(map as Map<number, Bucket>, key);
      for (const row of modelTokens) {
        credit(bucket, providerId, row.model, row.tokens, row.cost, requests);
      }
    }
  }

  private put(map: Map<number, Bucket>, key: number): Bucket {
    const bucket = emptyBucket(key);
    map.set(key, bucket);
    return bucket;
  }

  providerTotalsSince(providerId: string, since: number): ProviderTotals {
    const totals: ProviderTotals = { tokens: 0, cost: 0, requests: 0 };
    for (const [key, bucket] of this.minutes) {
      if (key < since) continue;
      const row = bucket.providers[providerId];
      if (!row) continue;
      totals.tokens += row.tokens;
      totals.cost += row.cost;
      totals.requests += row.requests;
    }
    return totals;
  }

  totalsSince(since: number): ProviderTotals {
    const totals: ProviderTotals = { tokens: 0, cost: 0, requests: 0 };
    for (const [key, bucket] of this.minutes) {
      if (key < since) continue;
      totals.tokens += bucket.tokens;
      totals.cost += bucket.cost;
      totals.requests += bucket.requests;
    }
    return totals;
  }

  totalsForProvidersSince(since: number, providerIds: Set<string>): ProviderTotals {
    const totals: ProviderTotals = { tokens: 0, cost: 0, requests: 0 };
    for (const [key, bucket] of this.minutes) {
      if (key < since) continue;
      for (const [providerId, row] of Object.entries(bucket.providers)) {
        if (!providerIds.has(providerId)) continue;
        totals.tokens += row.tokens;
        totals.cost += row.cost;
        totals.requests += row.requests;
      }
    }
    return totals;
  }

  modelTotalsSince(since: number): Map<string, { tokens: number; cost: number; requests: number }> {
    const models = new Map<string, { tokens: number; cost: number; requests: number }>();
    for (const [key, bucket] of this.minutes) {
      if (key < since) continue;
      for (const [composite, row] of Object.entries(bucket.models)) {
        const current = models.get(composite) ?? { tokens: 0, cost: 0, requests: 0 };
        current.tokens += row.tokens;
        current.cost += row.cost;
        current.requests += row.requests;
        models.set(composite, current);
      }
    }
    return models;
  }

  dayTotalsSince(since: number): ProviderTotals {
    const totals: ProviderTotals = { tokens: 0, cost: 0, requests: 0 };
    for (const [key, bucket] of this.days) {
      if (key < since) continue;
      totals.tokens += bucket.tokens;
      totals.cost += bucket.cost;
      totals.requests += bucket.requests;
    }
    return totals;
  }

  providerDays(providerId: string, days: number, now = Date.now()): number[] {
    const today = startOfLocalDay(now);
    const values: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      values.push(this.days.get(today - i * DAY)?.providers[providerId]?.tokens ?? 0);
    }
    return values;
  }

  modelDaySeries(composite: string, days: number, now = Date.now()): number[] {
    const today = startOfLocalDay(now);
    const values: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      values.push(this.days.get(today - i * DAY)?.models[composite]?.tokens ?? 0);
    }
    return values;
  }

  spark(providerId: string, points: number, now = Date.now()): number[] {
    const current = Math.floor(now / MINUTE) * MINUTE;
    const values: number[] = [];
    for (let i = points - 1; i >= 0; i--) {
      const bucket = this.minutes.get(current - i * MINUTE);
      values.push(bucket?.providers[providerId]?.tokens ?? 0);
    }
    return values;
  }

  series(range: RangeKey, providerIds: string[], now = Date.now()): { points: SeriesPoint[]; bucketMs: number } {
    const config: Record<RangeKey, { bucketMs: number; count: number; source: "minutes" | "hours" | "days" }> = {
      "1h": { bucketMs: MINUTE, count: 60, source: "minutes" },
      "24h": { bucketMs: 20 * MINUTE, count: 72, source: "minutes" },
      "7d": { bucketMs: 3 * HOUR, count: 56, source: "hours" },
      "30d": { bucketMs: DAY, count: 30, source: "days" },
    };
    const { bucketMs, count, source } = config[range];
    const end = range === "30d" ? startOfLocalDay(now) + DAY : Math.floor(now / bucketMs) * bucketMs + bucketMs;
    const start = end - count * bucketMs;
    const points: SeriesPoint[] = Array.from({ length: count }, (_, i) => ({
      t: start + i * bucketMs,
      total: 0,
      cost: 0,
      providers: Object.fromEntries(providerIds.map((id) => [id, 0])),
      costs: Object.fromEntries(providerIds.map((id) => [id, 0])),
    }));

    const map = source === "minutes" ? this.minutes : source === "hours" ? this.hours : this.days;
    for (const [key, bucket] of map) {
      if (key < start || key >= end) continue;
      const index = Math.min(count - 1, Math.floor((key - start) / bucketMs));
      const point = points[index];
      point.total += bucket.tokens;
      point.cost += bucket.cost;
      for (const providerId of providerIds) {
        point.providers[providerId] += bucket.providers[providerId]?.tokens ?? 0;
        point.costs[providerId] += bucket.providers[providerId]?.cost ?? 0;
      }
    }
    return { points, bucketMs };
  }

  /** Drop demo data when a real source comes online for the same provider. */
  clearProvider(providerId: string): void {
    for (const map of [this.minutes, this.hours, this.days]) {
      for (const bucket of map.values()) {
        const row = bucket.providers[providerId];
        if (row) {
          bucket.tokens -= row.tokens;
          bucket.cost -= row.cost;
          bucket.requests -= row.requests;
          delete bucket.providers[providerId];
        }
        for (const key of Object.keys(bucket.models)) {
          if (!key.startsWith(`${providerId}|`)) continue;
          const model = bucket.models[key];
          bucket.tokens -= model.tokens;
          bucket.cost -= model.cost;
          bucket.requests -= model.requests;
          delete bucket.models[key];
        }
      }
    }
  }

  prune(now = Date.now()): void {
    for (const key of this.minutes.keys()) {
      if (key < now - 27 * HOUR) this.minutes.delete(key);
    }
    for (const key of this.hours.keys()) {
      if (key < now - 10 * DAY) this.hours.delete(key);
    }
    for (const key of this.days.keys()) {
      if (key < now - 60 * DAY) this.days.delete(key);
    }
  }
}
