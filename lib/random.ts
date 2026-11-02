/**
 * Deterministic pseudo-random helpers.
 * Seeded so the demo history looks identical across reloads and restarts.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Log-normal-ish multiplier centered on 1. */
export function jitter(random: () => number, spread = 0.35): number {
  return Math.max(0.05, 1 + (random() * 2 - 1) * spread);
}

/** Usage curve for an hour of the day: low overnight, broad daytime peak. */
export function diurnal(hour: number, peakiness: number): number {
  const morning = Math.exp(-Math.pow(hour - 10, 2) / 18);
  const afternoon = Math.exp(-Math.pow(hour - 16, 2) / 26);
  const evening = Math.exp(-Math.pow(hour - 21, 2) / 14);
  const wave = 0.5 + morning * 0.55 + afternoon * 0.5 + evening * 0.35;
  return 1 + (wave - 1) * peakiness;
}

export function pickWeighted<T extends { weight: number }>(items: T[], random: () => number): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * total;
  for (const item of items) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}
