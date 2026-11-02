import type { QuotaWindow, UsageEvent } from "../types";

export interface CollectorResult {
  providerId: string;
  ok: boolean;
  at: number;
  events: UsageEvent[];
  /** Official spend for today, when the provider exposes a cost endpoint. */
  costToday?: number;
  balance?: { amount: number; currency: string; label?: string };
  quota?: QuotaWindow[];
  note?: string;
  error?: string;
}

export interface LocalScanResult {
  providerId: "claude-max" | "codex";
  files: number;
  events: UsageEvent[];
  quota?: QuotaWindow[];
  note?: string;
  scannedAt: number;
}
