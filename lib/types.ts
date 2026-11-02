/**
 * Shared domain types for the collector, API and dashboard.
 * The whole product is built around one normalized usage event shape,
 * so any provider (official API, local log, custom gateway) speaks the
 * same language once it reaches the engine.
 */

export type ProviderKind = "api" | "subscription" | "gateway";

export type Provenance = "official" | "local" | "experimental" | "demo" | "unknown";

export type ProviderStatus = "live" | "syncing" | "idle" | "degraded" | "offline" | "demo";

export type RangeKey = "1h" | "24h" | "7d" | "30d";

export type Capability =
  | "usage_api"
  | "cost_api"
  | "quota_api"
  | "balance_api"
  | "local_logs"
  | "ingest";

export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  label: string;
  vendor: string;
}

export interface ModelMix {
  id: string;
  weight: number;
  /** share of input tokens served from prompt cache */
  cacheShare?: number;
}

export interface SimulationProfile {
  /** total tokens per full day, across every model */
  tokensPerDay: number;
  models: ModelMix[];
  /** 0 = flat all day, 1 = strongly diurnal */
  peakiness: number;
  /** occasional agent bursts, 0..1 */
  burstiness: number;
}

export interface CatalogProvider {
  id: string;
  name: string;
  short: string;
  vendor: string;
  kind: ProviderKind;
  color: string;
  planLabel: string;
  description: string;
  capabilities: Capability[];
  authEnv: string[];
  docsUrl: string;
  /** subscription sources expose quota windows instead of billable spend */
  subscription?: boolean;
  simulation: SimulationProfile;
}

export interface CustomProvider {
  id: string;
  name: string;
  short: string;
  color: string;
  baseUrl?: string;
  keyEnv?: string;
  createdAt: number;
}

export interface Settings {
  monthlyBudgetUsd: number;
  claudePlan: "pro" | "max5" | "max20" | "custom";
  claudeWeeklyTokens: number;
  codexPlan: "plus" | "pro" | "business";
  currency: "USD";
}

export interface UsageEvent {
  /** stable id used for dedupe across polls and rescans */
  id?: string;
  at: number;
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  requests?: number;
  /** when omitted the engine prices the event locally */
  costUsd?: number;
  source?: Provenance;
}

export interface QuotaWindow {
  id: string;
  label: string;
  usedPct: number;
  windowSeconds: number;
  resetsAt: number | null;
  provenance: Provenance;
  note?: string;
}

export interface BucketModel {
  tokens: number;
  cost: number;
  requests: number;
}

export interface Bucket {
  t: number;
  tokens: number;
  cost: number;
  requests: number;
  providers: Record<string, { tokens: number; cost: number; requests: number }>;
  models: Record<string, BucketModel>;
}

export interface SeriesPoint {
  t: number;
  total: number;
  cost: number;
  providers: Record<string, number>;
  costs: Record<string, number>;
}

export interface ProviderView {
  id: string;
  name: string;
  short: string;
  vendor: string;
  kind: ProviderKind;
  color: string;
  planLabel: string;
  status: ProviderStatus;
  provenance: Provenance;
  simulated: boolean;
  tokensToday: number;
  costToday: number;
  requestsToday: number;
  tokensWindow: number;
  share: number;
  deltaPct: number;
  spark: number[];
  quota: QuotaWindow[];
  lastSyncAt: number | null;
  note?: string;
  enabled: boolean;
  custom: boolean;
  capabilities: Capability[];
}

export interface ModelRow {
  id: string;
  name: string;
  vendor: string;
  providerId: string;
  providerName: string;
  color: string;
  tokens: number;
  cost: number;
  requests: number;
  share: number;
  deltaPct: number;
  trend: number[];
}

export interface FeedEvent {
  id: string;
  at: number;
  providerId: string;
  providerName: string;
  color: string;
  model: string;
  tokens: number;
  cost: number;
  kind: "request" | "sync" | "quota" | "alert";
  text?: string;
}

export interface Totals {
  tokensToday: number;
  costToday: number;
  requestsToday: number;
  tokensWindow: number;
  costWindow: number;
  burnPerMin: number;
  projectedDayCost: number;
  monthToDateCost: number;
  monthBudget: number;
  monthProgress: number;
  deltaTokensPct: number;
  deltaCostPct: number;
  activeProviders: number;
  subscriptionTokens: number;
  subscriptionValue: number;
  apiCost: number;
}

export interface EngineMeta {
  demo: boolean;
  demoProviders: number;
  liveProviders: number;
  pollMs: number;
  startedAt: number;
  version: string;
  claudeLogs: number;
  codexLogs: number;
  collectors: { id: string; label: string; state: string; at: number | null }[];
}

export interface StatePayload {
  now: number;
  range: RangeKey;
  bucketMs: number;
  series: SeriesPoint[];
  providers: ProviderView[];
  models: ModelRow[];
  events: FeedEvent[];
  totals: Totals;
  quotas: { providerId: string; providerName: string; color: string; windows: QuotaWindow[] }[];
  meta: EngineMeta;
  settings: Settings;
}

export interface StreamFrame {
  type: "snapshot";
  payload: StatePayload;
}
