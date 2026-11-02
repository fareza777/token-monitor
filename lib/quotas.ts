import { clamp } from "./format";
import { DAY, HOUR } from "./history";
import type { QuotaWindow } from "./types";

export interface QuotaSeed {
  id: string;
  label: string;
  windowSeconds: number;
  usedPct: number;
  resetInMs: number;
}

export function quotaWindows(seeds: QuotaSeed[], now: number): QuotaWindow[] {
  return seeds.map((seed) => ({
    id: seed.id,
    label: seed.label,
    usedPct: clamp(seed.usedPct, 0, 100),
    windowSeconds: seed.windowSeconds,
    resetsAt: now + seed.resetInMs,
    provenance: "demo",
    note: "Simulated window",
  }));
}

export function demoQuotas(providerId: string, now: number): QuotaWindow[] {
  if (providerId === "claude-max") {
    return quotaWindows(
      [
        { id: "five_hour", label: "Session", windowSeconds: 5 * 3600, usedPct: 58, resetInMs: 2 * HOUR + 41 * 60_000 },
        { id: "seven_day", label: "Weekly", windowSeconds: 7 * 24 * 3600, usedPct: 43, resetInMs: 3 * DAY + 7 * HOUR },
      ],
      now,
    );
  }
  if (providerId === "codex") {
    return quotaWindows(
      [
        { id: "primary", label: "Session", windowSeconds: 5 * 3600, usedPct: 47, resetInMs: 3 * HOUR + 12 * 60_000 },
        { id: "secondary", label: "Weekly", windowSeconds: 7 * 24 * 3600, usedPct: 71, resetInMs: 2 * DAY + 15 * HOUR },
      ],
      now,
    );
  }
  if (providerId === "openrouter") {
    return quotaWindows(
      [{ id: "credit", label: "Credit", windowSeconds: 30 * 24 * 3600, usedPct: 32, resetInMs: 18 * DAY }],
      now,
    );
  }
  if (providerId === "deepseek") {
    return quotaWindows(
      [{ id: "balance", label: "Balance", windowSeconds: 30 * 24 * 3600, usedPct: 24, resetInMs: 26 * DAY }],
      now,
    );
  }
  return [];
}

/** Slowly move simulated windows and roll them over when their reset lands. */
export function driftQuotas(windows: QuotaWindow[], now: number, random: () => number): QuotaWindow[] {
  return windows.map((window) => {
    if (window.resetsAt && now >= window.resetsAt) {
      return {
        ...window,
        usedPct: 2 + random() * 6,
        resetsAt: now + window.windowSeconds * 1000,
        note: "Simulated window",
      };
    }
    const drift = random() * 0.09 - 0.035;
    return { ...window, usedPct: clamp(window.usedPct + drift, 3, 97) };
  });
}
