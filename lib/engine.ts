import { randomUUID } from "node:crypto";
import { CATALOG, EXTRA_OPTIONS } from "./providers/catalog";
import { DAY, History, MINUTE, startOfLocalDay, startOfLocalMonth } from "./history";
import { clamp } from "./format";
import { estimateCost, priceFor } from "./pricing";
import { mulberry32 } from "./random";
import { demoQuotas, driftQuotas } from "./quotas";
import { seedProvider, tickProvider } from "./simulator";
import { scanClaudeLogs, scanCodexLogs } from "./collectors/local";
import { collectAnthropic, collectDeepSeek, collectOpenAI, collectOpenRouter } from "./collectors/remote";
import {
  DEFAULT_SETTINGS,
  loadProviderConfig,
  loadSettings,
  saveProviderConfig,
  saveSettings,
  type ProviderConfig,
} from "./store";
import type {
  CatalogProvider,
  CustomProvider,
  FeedEvent,
  ModelRow,
  ProviderStatus,
  ProviderView,
  RangeKey,
  Settings,
  StatePayload,
  UsageEvent,
} from "./types";

export const ENGINE_VERSION = "0.1.0";
const TICK_MS = 1_500;

type RuntimeProvider = CatalogProvider & {
  custom?: boolean;
  baseUrl?: string;
  keyEnv?: string;
  disabled?: boolean;
};

type CollectorState = { state: string; at: number | null; note?: string };

interface IngestInput {
  providerId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  requests?: number;
  at?: number;
}

function planLabelForClaude(plan: Settings["claudePlan"]): string {
  return plan === "pro" ? "Claude Pro" : plan === "max5" ? "Claude Max 5×" : plan === "max20" ? "Claude Max 20×" : "Claude custom plan";
}

function planLabelForCodex(plan: Settings["codexPlan"]): string {
  return plan === "plus" ? "ChatGPT Plus" : plan === "pro" ? "ChatGPT Pro" : "ChatGPT Business";
}

function isLocalSource(id: string): boolean {
  return id === "claude-max" || id === "codex";
}

function collectorHasCredentials(id: string): boolean {
  if (id === "anthropic") return Boolean(process.env.ANTHROPIC_ADMIN_KEY);
  if (id === "openai") return Boolean(process.env.OPENAI_ADMIN_KEY);
  if (id === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_MANAGEMENT_KEY);
  if (id === "deepseek") return Boolean(process.env.DEEPSEEK_API_KEY);
  return false;
}

export class TokenMonitorEngine {
  history = new History();
  settings: Settings = DEFAULT_SETTINGS;
  providers: RuntimeProvider[] = [];
  events: FeedEvent[] = [];
  simulated = new Set<string>();
  officialCost = new Map<string, number>();
  balances = new Map<string, { amount: number; currency: string; label?: string }>();
  realQuotas = new Map<string, ProviderView["quota"]>();
  demoQuotaState = new Map<string, ProviderView["quota"]>();
  lastSync = new Map<string, number>();
  lastError = new Map<string, string>();
  collectorState = new Map<string, CollectorState>();
  localFiles = new Map<string, number>();
  seen = new Map<string, number>();
  startedAt = Date.now();
  ready: Promise<void>;
  started = false;

  private config: ProviderConfig = { disabledCatalogIds: [], custom: [] };
  private lastTick = Date.now();
  private lastRemotePoll = 0;
  private lastLocalScan = 0;
  private lastPrune = Date.now();
  private busyRemote = false;
  private busyLocal = false;
  private tickCount = 0;
  private random = mulberry32((Date.now() / 1000) | 0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private digestAt = 0;

  constructor() {
    this.ready = this.init().catch((error) => {
      console.error("[token-monitor] engine init failed", error);
    });
  }

  private async init(): Promise<void> {
    this.settings = await loadSettings();
    this.config = await loadProviderConfig();
    this.buildProviders();
    await this.scanLocal(true);
    this.decideSources();
    this.seedFeed();
    this.start();
    void this.pollRemote();
    void this.scanLocal(false);
  }

  private buildProviders(): void {
    const list: RuntimeProvider[] = CATALOG.filter((provider) => !this.config.disabledCatalogIds.includes(provider.id)).map(
      (provider) => ({ ...provider }),
    );
    for (const custom of this.config.custom) {
      if (list.some((provider) => provider.id === custom.id)) continue;
      list.push({
        id: custom.id,
        name: custom.name,
        short: custom.short,
        vendor: "Custom",
        kind: "gateway",
        color: custom.color,
        planLabel: "Gateway",
        description: custom.baseUrl ? `Custom source · ${custom.baseUrl}` : "Custom usage source",
        capabilities: ["ingest"],
        authEnv: custom.keyEnv ? [custom.keyEnv] : [],
        docsUrl: "",
        simulation: {
          tokensPerDay: 2_400_000,
          peakiness: 0.4,
          burstiness: 0.3,
          models: [{ id: "custom-model", weight: 1, cacheShare: 0.2 }],
        },
        custom: true,
        baseUrl: custom.baseUrl,
        keyEnv: custom.keyEnv,
      });
    }
    this.providers = list;
  }

  private decideSources(): void {
    const now = Date.now();
    for (const provider of this.providers) {
      const localAvailable = isLocalSource(provider.id) && (this.localFiles.get(provider.id) ?? 0) > 0;
      const remoteAvailable = collectorHasCredentials(provider.id);
      if (localAvailable || remoteAvailable) {
        this.collectorState.set(provider.id, { state: "idle", at: null, note: "Awaiting first sync" });
        continue;
      }
      this.simulated.add(provider.id);
      seedProvider(this.history, provider, now);
      const quota = demoQuotas(provider.id, now);
      if (quota.length) this.demoQuotaState.set(provider.id, quota);
    }
  }

  private seedFeed(): void {
    const now = Date.now();
    const providers = this.providers.filter((provider) => this.simulated.has(provider.id));
    if (!providers.length) return;
    for (let i = 0; i < 9; i++) {
      const provider = providers[Math.floor(this.random() * providers.length)];
      const mix = provider.simulation.models[Math.floor(this.random() * provider.simulation.models.length)];
      const tokens = Math.round((provider.simulation.tokensPerDay / 1440) * (2 + this.random() * 9));
      const cost = estimateCost(mix.id, { inputTokens: tokens * 0.72, outputTokens: tokens * 0.28 });
      this.events.push({
        id: randomUUID(),
        at: now - i * 5_300 - Math.floor(this.random() * 2_000),
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        model: mix.id,
        tokens,
        cost,
        kind: "request",
      });
    }
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof this.timer === "object" && "unref" in this.timer) this.timer.unref();
  }

  private tick(): void {
    const now = Date.now();
    const elapsed = clamp(now - this.lastTick, 200, 5_000);
    this.lastTick = now;
    this.tickCount++;

    const demoProviders = this.providers.filter((provider) => this.simulated.has(provider.id));
    const ticks: { provider: RuntimeProvider; tokens: number; cost: number; model: string }[] = [];
    for (const provider of demoProviders) {
      const result = tickProvider(this.history, provider, now, elapsed, this.random);
      if (result.tokens > 0) ticks.push({ provider, ...result });
    }

    // One or two readable events per frame; the full tick still feeds the chart.
    const feedCount = Math.min(ticks.length, this.random() < 0.22 ? 2 : 1);
    for (let i = 0; i < feedCount; i++) {
      const tick = ticks[Math.floor(this.random() * ticks.length)];
      if (!tick) break;
      const multiplier = 3 + this.random() * 4;
      this.events.unshift({
        id: randomUUID(),
        at: now,
        providerId: tick.provider.id,
        providerName: tick.provider.name,
        color: tick.provider.color,
        model: tick.model,
        tokens: Math.round(tick.tokens * multiplier),
        cost: tick.cost * multiplier,
        kind: "request",
      });
    }

    if (this.tickCount % 20 === 0) {
      for (const [id, windows] of this.demoQuotaState) {
        this.demoQuotaState.set(id, driftQuotas(windows, now, this.random));
      }
    }

    this.events = this.events.slice(0, 40);

    if (now - this.lastRemotePoll > 60_000) void this.pollRemote();
    if (now - this.lastLocalScan > 8_000) void this.scanLocal(false);
    if (now - this.lastPrune > 300_000) this.prune();
  }

  private prune(): void {
    this.lastPrune = Date.now();
    this.history.prune();
    for (const [key, at] of this.seen) {
      if (at < Date.now() - 6 * 3_600_000) this.seen.delete(key);
    }
  }

  private ingestEvent(event: UsageEvent): boolean {
    if (event.id) {
      if (this.seen.has(event.id)) return false;
      this.seen.set(event.id, Date.now());
    }
    this.history.add(event);
    return true;
  }

  private markReal(providerId: string): void {
    if (!this.simulated.has(providerId)) return;
    this.history.clearProvider(providerId);
    this.simulated.delete(providerId);
    this.demoQuotaState.delete(providerId);
  }

  private async pollRemote(): Promise<void> {
    if (this.busyRemote) return;
    this.busyRemote = true;
    this.lastRemotePoll = Date.now();
    try {
      const collectors = [
        { id: "anthropic", run: collectAnthropic },
        { id: "openai", run: collectOpenAI },
        { id: "openrouter", run: collectOpenRouter },
        { id: "deepseek", run: collectDeepSeek },
      ];
      const results = await Promise.allSettled(collectors.map((collector) => collector.run()));
      results.forEach((settled, index) => {
        if (settled.status !== "fulfilled" || !settled.value) return;
        this.applyRemote(settled.value, collectors[index].id);
      });
    } finally {
      this.busyRemote = false;
    }
  }

  private applyRemote(
    result: Awaited<ReturnType<typeof collectAnthropic>>,
    fallbackId: string,
  ): void {
    if (!result) return;
    const providerId = result.providerId || fallbackId;
    const now = Date.now();
    if (!result.ok) {
      this.lastError.set(providerId, result.error ?? "Collector error");
      this.collectorState.set(providerId, { state: "error", at: now, note: result.error });
      if (now - this.digestAt > 300_000) {
        this.digestAt = now;
        this.events.unshift({
          id: randomUUID(),
          at: now,
          providerId,
          providerName: this.providers.find((p) => p.id === providerId)?.name ?? providerId,
          color: "#ff8f62",
          model: "collector",
          tokens: 0,
          cost: 0,
          kind: "alert",
          text: result.error?.slice(0, 120) ?? "Collector error",
        });
      }
      return;
    }

    this.lastError.delete(providerId);
    this.collectorState.set(providerId, { state: "live", at: now, note: result.note });
    this.lastSync.set(providerId, now);
    this.markReal(providerId);

    let inserted = 0;
    for (const event of result.events) {
      if (this.ingestEvent(event)) inserted++;
    }
    if (typeof result.costToday === "number") this.officialCost.set(providerId, result.costToday);
    if (result.balance) this.balances.set(providerId, result.balance);
    if (result.quota?.length) this.realQuotas.set(providerId, result.quota);

    if (inserted > 0 || result.costToday) {
      const provider = this.providers.find((p) => p.id === providerId);
      this.events.unshift({
        id: randomUUID(),
        at: now,
        providerId,
        providerName: provider?.name ?? providerId,
        color: provider?.color ?? "#d3fb52",
        model: "sync",
        tokens: result.events.reduce((sum, event) => sum + event.inputTokens + event.outputTokens, 0),
        cost: result.costToday ?? 0,
        kind: "sync",
        text: result.note ?? "Synced",
      });
    }
  }

  private async scanLocal(initial: boolean): Promise<void> {
    if (this.busyLocal) return;
    this.busyLocal = true;
    this.lastLocalScan = Date.now();
    try {
      const [claude, codex] = await Promise.all([scanClaudeLogs(), scanCodexLogs()]);
      this.applyLocal(claude, "claude-code");
      this.applyLocal(codex, "codex");
      if (initial) this.lastLocalScan = Date.now();
    } finally {
      this.busyLocal = false;
    }
  }

  private applyLocal(result: Awaited<ReturnType<typeof scanClaudeLogs>>, collectorId: string): void {
    const now = Date.now();
    this.localFiles.set(result.providerId, result.files);
    this.collectorState.set(collectorId, {
      state: result.files > 0 ? (result.events.length > 0 ? "live" : "idle") : "off",
      at: now,
      note: result.note,
    });
    if (result.events.length > 0) {
      this.markReal(result.providerId);
      for (const event of result.events) this.ingestEvent(event);
      this.lastSync.set(result.providerId, now);
    }
    if (result.quota?.length) this.realQuotas.set(result.providerId, result.quota);
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  snapshot(range: RangeKey): StatePayload {
    const now = Date.now();
    const dayStart = startOfLocalDay(now);
    const monthStart = startOfLocalMonth(now);
    const ids = this.providers.map((provider) => provider.id);
    const enabledIds = new Set(ids);
    const { points, bucketMs } = this.history.series(range, ids, now);
    const tokensToday = this.history.totalsForProvidersSince(dayStart, enabledIds);
    const elapsed = clamp((now - dayStart) / DAY, 0.06, 1);

    const subscriptionIds = new Set(this.providers.filter((provider) => provider.subscription).map((p) => p.id));
    const apiIds = new Set(ids.filter((id) => !subscriptionIds.has(id)));
    const apiTotals = this.history.totalsForProvidersSince(dayStart, apiIds);
    const subTotals = this.history.totalsForProvidersSince(dayStart, subscriptionIds);

    // Budgets track billable API spend only; subscription value is shown separately.
    const billableMtd = [...this.history.days.entries()]
      .filter(([key]) => key >= monthStart)
      .reduce(
        (sum, [, bucket]) =>
          sum +
          Object.entries(bucket.providers).reduce(
            (inner, [id, row]) => inner + (apiIds.has(id) ? row.cost : 0),
            0,
          ),
        0,
      );
    const previousBillable = [...this.history.days.entries()]
      .filter(([key]) => key < dayStart)
      .slice(-7)
      .map(([, bucket]) =>
        Object.entries(bucket.providers).reduce(
          (inner, [id, row]) => inner + (apiIds.has(id) ? row.cost : 0),
          0,
        ),
      );

    const costByProvider = new Map<string, number>();
    for (const provider of this.providers) {
      const totals = this.history.providerTotalsSince(provider.id, dayStart);
      costByProvider.set(provider.id, this.officialCost.get(provider.id) ?? totals.cost);
    }
    const costToday = [...costByProvider.values()].reduce((sum, value) => sum + value, 0);
    const apiCost = this.providers
      .filter((provider) => !provider.subscription)
      .reduce((sum, provider) => sum + (costByProvider.get(provider.id) ?? 0), 0);

    const previousDays = [...this.history.days.entries()]
      .filter(([key]) => key < dayStart)
      .slice(-7)
      .map(([, bucket]) => bucket);
    const avgTokens =
      previousDays.reduce((sum, bucket) => sum + bucket.tokens, 0) / Math.max(1, previousDays.length);
    const avgCost = previousBillable.reduce((sum, value) => sum + value, 0) / Math.max(1, previousBillable.length);
    const deltaTokensPct = avgTokens > 0 ? clamp((tokensToday.tokens / (avgTokens * elapsed) - 1) * 100, -99, 999) : 0;
    const deltaCostPct = avgCost > 0 ? clamp((apiCost / (avgCost * elapsed) - 1) * 100, -99, 999) : 0;

    const totalModelTokens = tokensToday.tokens || 1;
    const providerViews: ProviderView[] = this.providers.map((provider) => {
      const totals = this.history.providerTotalsSince(provider.id, dayStart);
      const simulated = this.simulated.has(provider.id);
      const lastSync = this.lastSync.get(provider.id) ?? null;
      const error = this.lastError.get(provider.id);
      let status: ProviderStatus = simulated ? "demo" : error ? "degraded" : lastSync && now - lastSync < 300_000 ? "live" : "idle";
      if (!simulated && !provider.capabilities.length) status = "idle";

      const days = this.history.providerDays(provider.id, 7, now).slice(0, 6);
      const avg = days.reduce((sum, value) => sum + value, 0) / Math.max(1, days.length);
      const deltaPct = avg > 0 ? clamp((totals.tokens / (avg * elapsed) - 1) * 100, -99, 999) : 0;
      const quota = this.realQuotas.get(provider.id) ?? this.demoQuotaState.get(provider.id) ?? [];
      const balance = this.balances.get(provider.id);
      const collector = this.collectorState.get(provider.id);
      let note = collector?.note;
      if (balance) {
        note = `${balance.label ?? "Balance"}: ${balance.currency === "USD" ? "$" : ""}${balance.amount.toFixed(2)} ${balance.currency !== "USD" ? balance.currency : ""}`.trim();
      }
      if (!simulated && !note && provider.capabilities.includes("ingest")) note = "Gateway ingest";
      if (simulated) note = "Simulated data — connect a source";

      return {
        id: provider.id,
        name: provider.name,
        short: provider.short,
        vendor: provider.vendor,
        kind: provider.kind,
        color: provider.color,
        planLabel:
          provider.id === "claude-max"
            ? planLabelForClaude(this.settings.claudePlan)
            : provider.id === "codex"
              ? planLabelForCodex(this.settings.codexPlan)
              : provider.planLabel,
        status,
        provenance: simulated ? "demo" : isLocalSource(provider.id) || provider.custom ? "local" : "official",
        simulated,
        tokensToday: totals.tokens,
        costToday: costByProvider.get(provider.id) ?? totals.cost,
        requestsToday: totals.requests,
        tokensWindow: points.reduce((sum, point) => sum + (point.providers[provider.id] ?? 0), 0),
        share: (totals.tokens / totalModelTokens) * 100,
        deltaPct,
        spark: this.history.spark(provider.id, 40, now),
        quota,
        lastSyncAt: lastSync,
        note,
        enabled: true,
        custom: Boolean(provider.custom),
        capabilities: provider.capabilities,
      };
    });

    const models: ModelRow[] = [];
    for (const [composite, totals] of this.history.modelTotalsSince(dayStart)) {
      const separator = composite.indexOf("|");
      if (separator < 0) continue;
      const providerId = composite.slice(0, separator);
      const modelId = composite.slice(separator + 1);
      const provider = this.providers.find((row) => row.id === providerId);
      if (!provider) continue;
      const price = priceFor(modelId);
      const trend = this.history.modelDaySeries(composite, 7, now);
      const prior = trend.slice(0, 6);
      const avg = prior.reduce((sum, value) => sum + value, 0) / Math.max(1, prior.length);
      models.push({
        id: modelId,
        name: price.label,
        vendor: price.vendor,
        providerId,
        providerName: provider.name,
        color: provider.color,
        tokens: totals.tokens,
        cost: totals.cost,
        requests: totals.requests,
        share: (totals.tokens / totalModelTokens) * 100,
        deltaPct: avg > 0 ? clamp((totals.tokens / (avg * elapsed) - 1) * 100, -99, 999) : 0,
        trend,
      });
    }
    models.sort((a, b) => b.tokens - a.tokens);

    const quotas = providerViews
      .filter((provider) => provider.quota.length > 0)
      .map((provider) => ({
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        windows: provider.quota,
      }));

    const collectors: StatePayload["meta"]["collectors"] = [
      {
        id: "simulator",
        label: "Simulator",
        state: this.simulated.size > 0 ? "running" : "off",
        at: now,
      },
      ...[
        ["anthropic", "Anthropic Admin API"],
        ["openai", "OpenAI Admin API"],
        ["openrouter", "OpenRouter"],
        ["deepseek", "DeepSeek"],
        ["claude-code", "Claude Code logs"],
        ["codex", "Codex rollouts"],
      ].map(([id, label]) => {
        const state = this.collectorState.get(id);
        return { id, label, state: state?.state ?? "off", at: state?.at ?? null };
      }),
      { id: "ingest", label: "Gateway ingest", state: "listening", at: now },
    ];

    return {
      now,
      range,
      bucketMs,
      series: points,
      providers: providerViews,
      models: models.slice(0, 12),
      events: this.events.filter((event) => enabledIds.has(event.providerId)).slice(0, 22),
      totals: {
        tokensToday: tokensToday.tokens,
        costToday,
        requestsToday: tokensToday.requests,
        tokensWindow: points.reduce((sum, point) => sum + point.total, 0),
        costWindow: points.reduce((sum, point) => sum + point.cost, 0),
        burnPerMin: this.history.totalsForProvidersSince(now - 10 * MINUTE, enabledIds).tokens / 10,
        projectedDayCost: apiCost / elapsed,
        monthToDateCost: billableMtd,
        monthBudget: this.settings.monthlyBudgetUsd,
        monthProgress: (billableMtd / Math.max(1, this.settings.monthlyBudgetUsd)) * 100,
        deltaTokensPct,
        deltaCostPct,
        activeProviders: providerViews.filter((provider) => provider.tokensToday > 0 || provider.costToday > 0).length,
        subscriptionTokens: subTotals.tokens,
        subscriptionValue: subTotals.cost,
        apiCost,
      },
      quotas,
      meta: {
        demo: this.providers.some((provider) => this.simulated.has(provider.id)),
        demoProviders: this.providers.filter((provider) => this.simulated.has(provider.id)).length,
        liveProviders: this.providers.filter((provider) => !this.simulated.has(provider.id)).length,
        pollMs: TICK_MS,
        startedAt: this.startedAt,
        version: ENGINE_VERSION,
        claudeLogs: this.localFiles.get("claude-max") ?? 0,
        codexLogs: this.localFiles.get("codex") ?? 0,
        collectors,
      },
      settings: this.settings,
    };
  }

  catalogState() {
    const custom = this.config.custom.map((provider) => ({
      id: provider.id,
      name: provider.name,
      short: provider.short,
      vendor: "Custom",
      color: provider.color,
      description: provider.baseUrl ?? "Custom gateway",
      kind: "gateway" as const,
      planLabel: "Gateway",
      authEnv: provider.keyEnv ? [provider.keyEnv] : [],
      docsUrl: "",
      enabled: !(this.config.disabledCustomIds ?? []).includes(provider.id),
      simulated: this.simulated.has(provider.id),
      custom: true,
    }));
    const catalog = CATALOG.map((provider) => ({
      id: provider.id,
      name: provider.name,
      short: provider.short,
      vendor: provider.vendor,
      color: provider.color,
      description: provider.description,
      kind: provider.kind,
      planLabel: provider.planLabel,
      authEnv: provider.authEnv,
      docsUrl: provider.docsUrl,
      enabled: !this.config.disabledCatalogIds.includes(provider.id),
      simulated: this.simulated.has(provider.id),
      custom: false,
    }));
    return {
      providers: [...catalog, ...custom],
      presets: EXTRA_OPTIONS,
      ingestUrl: "/api/ingest",
      ingestTokenRequired: Boolean(process.env.GATEWAY_INGEST_TOKEN),
    };
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const isCatalog = CATALOG.some((provider) => provider.id === id);
    const isCustom = this.config.custom.some((provider) => provider.id === id);
    if (!isCatalog && !isCustom) return;

    if (isCatalog) {
      if (enabled) {
        this.config.disabledCatalogIds = this.config.disabledCatalogIds.filter((entry) => entry !== id);
      } else if (!this.config.disabledCatalogIds.includes(id)) {
        this.config.disabledCatalogIds.push(id);
      }
    } else {
      const disabled = this.config.disabledCustomIds ?? [];
      this.config.disabledCustomIds = enabled ? disabled.filter((entry) => entry !== id) : [...new Set([...disabled, id])];
    }

    await saveProviderConfig(this.config);
    this.buildProviders();
    if (!enabled) return;

    const provider = this.providers.find((row) => row.id === id);
    const hasData = this.history.providerTotalsSince(id, startOfLocalDay(Date.now())).tokens > 0;
    if (provider && !hasData && !collectorHasCredentials(id) && !isLocalSource(id) && !this.simulated.has(id)) {
      this.simulated.add(id);
      seedProvider(this.history, provider, Date.now());
      const quota = demoQuotas(id, Date.now());
      if (quota.length) this.demoQuotaState.set(id, quota);
    }
  }

  async addCustomProvider(input: {
    name?: string;
    baseUrl?: string;
    keyEnv?: string;
    color?: string;
    presetId?: string;
  }): Promise<{ ok: boolean; id?: string; error?: string }> {
    let name = input.name?.trim();
    let baseUrl = input.baseUrl?.trim();
    let keyEnv = input.keyEnv?.trim();
    let color = input.color;

    if (input.presetId) {
      const preset = EXTRA_OPTIONS.find((option) => option.id === input.presetId);
      if (!preset) return { ok: false, error: "Unknown preset" };
      const existing = this.config.custom.find((provider) => provider.id === preset.id);
      if (existing) {
        await this.setEnabled(preset.id, true);
        return { ok: true, id: preset.id };
      }
      name = preset.name;
      keyEnv = preset.authEnv;
      color = preset.color;
      const custom: CustomProvider = {
        id: preset.id,
        name: preset.name,
        short: preset.short,
        color: preset.color,
        keyEnv: preset.authEnv,
        createdAt: Date.now(),
      };
      this.config.custom.push(custom);
      await saveProviderConfig(this.config);
      this.buildProviders();
      const provider = this.providers.find((row) => row.id === preset.id);
      if (provider) {
        this.simulated.add(provider.id);
        seedProvider(this.history, provider, Date.now());
      }
      return { ok: true, id: preset.id };
    }

    if (!name) return { ok: false, error: "Name is required" };
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const id = `custom-${slug || "source"}-${Math.random().toString(36).slice(2, 6)}`;
    const palette = ["#d3fb52", "#f0abfc", "#7dd3fc", "#fbbf24", "#f87171", "#34d399", "#c4b5fd", "#fdba74"];
    const custom: CustomProvider = {
      id,
      name,
      short: name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "CX",
      color: color ?? palette[this.config.custom.length % palette.length],
      baseUrl: baseUrl || undefined,
      keyEnv: keyEnv || undefined,
      createdAt: Date.now(),
    };
    this.config.custom.push(custom);
    await saveProviderConfig(this.config);
    this.buildProviders();
    const provider = this.providers.find((row) => row.id === id);
    if (provider) {
      this.simulated.add(id);
      seedProvider(this.history, provider, Date.now());
    }
    return { ok: true, id };
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next: Settings = {
      ...this.settings,
      ...patch,
      monthlyBudgetUsd:
        typeof patch.monthlyBudgetUsd === "number" && patch.monthlyBudgetUsd > 0
          ? patch.monthlyBudgetUsd
          : this.settings.monthlyBudgetUsd,
    };
    this.settings = next;
    await saveSettings(next);
    return next;
  }

  async ingest(inputs: IngestInput[]): Promise<{ accepted: number; rejected: number }> {
    let accepted = 0;
    let rejected = 0;
    const now = Date.now();
    for (const raw of inputs.slice(0, 500)) {
      const provider = this.providers.find((row) => row.id === raw.providerId);
      const inputTokens = Math.max(0, Number(raw.inputTokens ?? 0));
      const outputTokens = Math.max(0, Number(raw.outputTokens ?? 0));
      if (!provider || !raw.model || inputTokens + outputTokens <= 0) {
        rejected++;
        continue;
      }
      this.markReal(provider.id);
      const event: UsageEvent = {
        id: `ingest:${randomUUID()}`,
        at: typeof raw.at === "number" && Number.isFinite(raw.at) ? raw.at : now,
        providerId: provider.id,
        model: String(raw.model).slice(0, 120),
        inputTokens,
        outputTokens,
        cacheReadTokens: Math.max(0, Number(raw.cacheReadTokens ?? 0)),
        cacheWriteTokens: Math.max(0, Number(raw.cacheWriteTokens ?? 0)),
        requests:
          typeof raw.requests === "number" && Number.isFinite(raw.requests)
            ? Math.max(1, Math.round(raw.requests))
            : 1,
        costUsd:
          typeof raw.costUsd === "number" && Number.isFinite(raw.costUsd)
            ? Math.max(0, raw.costUsd)
            : undefined,
        source: "local",
      };
      this.ingestEvent(event);
      accepted++;
      this.events.unshift({
        id: randomUUID(),
        at: event.at,
        providerId: provider.id,
        providerName: provider.name,
        color: provider.color,
        model: event.model,
        tokens: inputTokens + outputTokens,
        cost: event.costUsd ?? estimateCost(event.model, event),
        kind: "request",
        text: "Ingested",
      });
    }
    if (accepted > 0) {
      this.collectorState.set("ingest", { state: "live", at: now, note: `${accepted} events received` });
      const customProviders = this.providers.filter((provider) => provider.custom);
      for (const provider of customProviders) {
        if (!this.simulated.has(provider.id)) this.lastSync.set(provider.id, now);
      }
    }
    this.events = this.events.slice(0, 40);
    return { accepted, rejected };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __tokenMonitorEngine: TokenMonitorEngine | undefined;
}

export async function getEngine(): Promise<TokenMonitorEngine> {
  if (!globalThis.__tokenMonitorEngine) {
    globalThis.__tokenMonitorEngine = new TokenMonitorEngine();
  }
  await globalThis.__tokenMonitorEngine.ready;
  return globalThis.__tokenMonitorEngine;
}
