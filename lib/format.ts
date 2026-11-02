import type { RangeKey } from "./types";

export const RANGE_CONFIG: Record<
  RangeKey,
  { label: string; short: string; ms: number; points: number; axis: "time" | "day" | "date" }
> = {
  "1h": { label: "Last hour", short: "1H", ms: 60 * 60 * 1000, points: 60, axis: "time" },
  "24h": { label: "Last 24 hours", short: "24H", ms: 24 * 60 * 60 * 1000, points: 72, axis: "time" },
  "7d": { label: "Last 7 days", short: "7D", ms: 7 * 24 * 60 * 60 * 1000, points: 56, axis: "day" },
  "30d": { label: "Last 30 days", short: "30D", ms: 30 * 24 * 60 * 60 * 1000, points: 30, axis: "date" },
};

export function compact(value: number, digits = 1): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(value)) return "—";
  if (abs >= 1e12) return `${(value / 1e12).toFixed(digits)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(abs >= 1e5 ? 0 : digits)}K`;
  return String(Math.round(value));
}

export function tokens(value: number): string {
  return compact(value, value >= 1e8 ? 1 : 2);
}

export function usd(value: number, opts: { cents?: boolean } = {}): string {
  if (!Number.isFinite(value)) return "—";
  const digits = value >= 1000 ? 0 : opts.cents === false ? 0 : 2;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function signedPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function relativeTime(at: number, now = Date.now()): string {
  const diff = Math.max(0, now - at);
  if (diff < 5_000) return "now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function countdown(at: number | null, now = Date.now()): string {
  if (!at) return "—";
  const diff = at - now;
  if (diff <= 0) return "reset";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function axisLabel(at: number, axis: "time" | "day" | "date"): string {
  const d = new Date(at);
  if (axis === "time") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (axis === "day") {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fullDate(at: number): string {
  return new Date(at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function initials(name: string): string {
  const parts = name.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
