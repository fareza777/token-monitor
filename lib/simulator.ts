import { History, HOUR, MINUTE } from "./history";
import { estimateCost } from "./pricing";
import { diurnal, hashString, jitter, mulberry32, pickWeighted } from "./random";
import type { CatalogProvider, SimulationProfile, UsageEvent } from "./types";

/**
 * The simulator exists so a fresh clone has a living dashboard before any
 * credentials are connected. It is deterministic per provider per day and is
 * always labeled as demo data in the UI.
 */

const SPLIT_INPUT = 0.72;
const SPLIT_OUTPUT = 0.28;

function profileFor(provider: CatalogProvider): SimulationProfile {
  return provider.simulation;
}

export function demoEvent(
  provider: CatalogProvider,
  tokens: number,
  at: number,
  random: () => number,
): { event: UsageEvent; model: string; cost: number } {
  const profile = profileFor(provider);
  const mix = pickWeighted(profile.models, random);
  const inputTokens = tokens * SPLIT_INPUT;
  const cacheReadTokens = inputTokens * (mix.cacheShare ?? 0.25);
  const event: UsageEvent = {
    at,
    providerId: provider.id,
    model: mix.id,
    inputTokens,
    outputTokens: tokens * SPLIT_OUTPUT,
    cacheReadTokens,
    requests: Math.max(1, Math.round(tokens / 3200)),
    source: "demo",
  };
  return { event, model: mix.id, cost: estimateCost(mix.id, event) };
}

function weekdayFactor(day: number): number {
  // weekends are quieter, Wednesday/Thursday peak
  const base = [0.72, 1.04, 1.08, 1.06, 0.98, 0.6, 0.55];
  return base[day] ?? 1;
}

/** Seed 26h of minute history, 8 days of hours, and 45 days of daily totals. */
export function seedProvider(history: History, provider: CatalogProvider, now: number): void {
  const random = mulberry32(hashString(provider.id) ^ Math.floor(now / 86_400_000));
  const profile = profileFor(provider);
  const perMinute = profile.tokensPerDay / 1440;
  const start = now - 26 * HOUR;

  for (let t = Math.floor(start / MINUTE) * MINUTE; t <= now; t += MINUTE) {
    const date = new Date(t);
    const curve = diurnal(date.getHours(), profile.peakiness);
    let tokens = perMinute * curve * weekdayFactor(date.getDay()) * jitter(random, 0.42);
    if (random() < profile.burstiness * 0.018) tokens *= 2.5 + random() * 4;
    if (random() < 0.012) tokens = 0;
    if (tokens <= 1) continue;
    history.add(demoEvent(provider, tokens, t, random).event);
  }

  // Hour-level history for the 7-day chart (days 2..8).
  for (let d = 2; d <= 8; d++) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - d);
    const factor = weekdayFactor(dayStart.getDay()) * (0.92 + random() * 0.18);
    for (let h = 0; h < 24; h++) {
      const at = dayStart.getTime() + h * HOUR;
      const tokens = perMinute * 60 * diurnal(h, profile.peakiness) * factor * jitter(random, 0.3);
      addSplit(history, provider, tokens, at, random);
    }
  }

  // One aggregate per day for the monthly chart (days 9..45).
  for (let d = 9; d <= 45; d++) {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - d);
    const factor = weekdayFactor(dayStart.getDay()) * (0.86 + random() * 0.22);
    const tokens = profile.tokensPerDay * factor;
    addSplit(history, provider, tokens, dayStart.getTime() + 12 * HOUR, random);
  }
}

function addSplit(
  history: History,
  provider: CatalogProvider,
  tokens: number,
  at: number,
  random: () => number,
): void {
  const profile = profileFor(provider);
  const rows = profile.models.map((mix) => {
    const share = tokens * mix.weight;
    const usage = {
      inputTokens: share * SPLIT_INPUT,
      outputTokens: share * SPLIT_OUTPUT,
      cacheReadTokens: share * SPLIT_INPUT * (mix.cacheShare ?? 0.25),
    };
    return { model: mix.id, tokens: share, cost: estimateCost(mix.id, usage) };
  });
  history.addAggregate(at, provider.id, rows, Math.max(1, Math.round(tokens / 3200)));
}

/** One live tick for a simulated provider. */
export function tickProvider(
  history: History,
  provider: CatalogProvider,
  now: number,
  elapsedMs: number,
  random: () => number,
): { tokens: number; cost: number; model: string } {
  const profile = profileFor(provider);
  const perMinute = profile.tokensPerDay / 1440;
  const curve = diurnal(new Date(now).getHours(), profile.peakiness);
  const burst = random() < 0.07 ? 2.4 + random() * 3.4 : 1;
  const tokens = perMinute * (elapsedMs / MINUTE) * curve * jitter(random, 0.55) * burst;
  const { event, model, cost } = demoEvent(provider, tokens, now, random);
  history.add(event);
  return { tokens, cost, model };
}
