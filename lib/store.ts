import { promises as fs } from "node:fs";
import path from "node:path";
import type { CustomProvider, Settings } from "./types";

/**
 * Tiny JSON store for runtime configuration and snapshot history.
 * Deliberately dependency-free and local-first: the dashboard is a personal
 * command deck, not a multi-tenant SaaS. Data lives in .data/ and is ignored
 * by git.
 */

const DATA_DIR = path.join(process.cwd(), ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PROVIDERS_FILE = path.join(DATA_DIR, "providers.json");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");

export const DEFAULT_SETTINGS: Settings = {
  monthlyBudgetUsd: 6000,
  claudePlan: "max20",
  claudeWeeklyTokens: 220_000,
  codexPlan: "plus",
  currency: "USD",
};

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value), "utf8");
  await fs.rename(tmp, file);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(SETTINGS_FILE, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeJson(SETTINGS_FILE, settings);
}

export interface ProviderConfig {
  disabledCatalogIds: string[];
  disabledCustomIds?: string[];
  custom: CustomProvider[];
}

export async function loadProviderConfig(): Promise<ProviderConfig> {
  const stored = await readJson<Partial<ProviderConfig>>(PROVIDERS_FILE, {});
  return {
    disabledCatalogIds: stored.disabledCatalogIds ?? [],
    disabledCustomIds: stored.disabledCustomIds ?? [],
    custom: stored.custom ?? [],
  };
}

export async function saveProviderConfig(config: ProviderConfig): Promise<void> {
  await writeJson(PROVIDERS_FILE, config);
}

export interface PersistedRuntime {
  version: 1;
  savedAt: number;
  minutes: Record<string, unknown>;
  hours: Record<string, unknown>;
  days: Record<string, unknown>;
  quotas?: Record<string, { usedPct: number; resetsAt: number | null }[]>;
}

export async function loadRuntime(): Promise<PersistedRuntime | null> {
  return readJson<PersistedRuntime | null>(RUNTIME_FILE, null);
}

export async function saveRuntime(data: PersistedRuntime): Promise<void> {
  await writeJson(RUNTIME_FILE, data);
}

export function dataDir(): string {
  return DATA_DIR;
}
