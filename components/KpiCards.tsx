"use client";

import { pct, signedPct, tokens as fmtTokens, usd } from "@/lib/format";
import type { StatePayload } from "@/lib/types";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { Icon } from "./ui/Icon";
import { Meter, Panel, alpha } from "./ui/Panel";
import { Sparkline } from "./ui/Sparkline";

export function KpiCards({ payload }: { payload: StatePayload }) {
  const { totals, providers, series, settings, now } = payload;
  const apiProviders = providers.filter((provider) => provider.kind !== "subscription");
  const apiIds = new Set(apiProviders.map((provider) => provider.id));
  const tokenSpark = series.map((point) => point.total);
  const costSpark = series.map((point) =>
    Object.entries(point.costs).reduce((sum, [id, cost]) => (apiIds.has(id) ? sum + cost : sum), 0),
  );
  const subSpark = series.map((point) =>
    Object.entries(point.costs).reduce((sum, [id, cost]) => (apiIds.has(id) ? sum : sum + cost), 0),
  );
  const subscriptionShare = totals.tokensToday > 0 ? (totals.subscriptionTokens / totals.tokensToday) * 100 : 0;

  const date = new Date(now);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, daysInMonth - date.getDate());
  const monthEnd = totals.monthToDateCost + totals.projectedDayCost * daysLeft;
  const budgetPct = settings.monthlyBudgetUsd > 0 ? (totals.monthToDateCost / settings.monthlyBudgetUsd) * 100 : 0;
  const budgetColor = budgetPct > 100 ? "#ff8f62" : budgetPct > 78 ? "#f0c45a" : "#d3fb52";

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        icon="sparkles"
        label="Tokens today"
        accent="#d3fb52"
        value={<AnimatedNumber value={totals.tokensToday} format={(value) => fmtTokens(value)} className="num" />}
        delta={totals.deltaTokensPct}
        detail={`across ${totals.activeProviders} active sources`}
        footer={`${fmtTokens(totals.requestsToday)} requests · ${fmtTokens(totals.burnPerMin)}/min`}
        spark={tokenSpark}
        sparkColor="#d3fb52"
        delay={0}
      />

      <MetricCard
        icon="zap"
        label="API spend today"
        accent="#f4f2ea"
        value={<AnimatedNumber value={totals.apiCost} format={(value) => usd(value)} className="num" />}
        delta={totals.deltaCostPct}
        deltaTone="spend"
        detail="billable across API sources"
        footer={`${usd(totals.projectedDayCost)} projected today`}
        spark={costSpark}
        sparkColor="#f4f2ea"
        delay={60}
      />

      <MetricCard
        icon="layers"
        label="On subscriptions"
        accent="#e8956f"
        value={<AnimatedNumber value={totals.subscriptionTokens} format={(value) => fmtTokens(value)} className="num" />}
        badge="INCLUDED"
        badgeColor="#e8956f"
        detail="not billed per token"
        footer={`${usd(totals.subscriptionValue)} API-equivalent value`}
        spark={subSpark}
        sparkColor="#e8956f"
        delay={120}
        extra={
          <div className="mt-2.5">
            <div className="flex items-center justify-between font-mono text-[8.5px] tracking-[0.06em] text-faint">
              <span>{pct(subscriptionShare, 0)} OF TOKENS</span>
              <span>{pct(100 - subscriptionShare, 0)} API</span>
            </div>
            <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="h-full bg-[#e8956f]" style={{ width: `${subscriptionShare}%` }} />
              <span className="h-full bg-ivory/25" style={{ width: `${100 - subscriptionShare}%` }} />
            </div>
          </div>
        }
      />

      <MetricCard
        icon="shield"
        label="Month to date"
        accent={budgetColor}
        value={<AnimatedNumber value={totals.monthToDateCost} format={(value) => usd(value, { cents: false })} className="num" />}
        badge={`${pct(budgetPct, 0)} USED`}
        badgeColor={budgetColor}
        detail={`of ${usd(settings.monthlyBudgetUsd, { cents: false })} monthly budget`}
        footer={`${usd(monthEnd, { cents: false })} projected · ${daysLeft}d left`}
        delay={180}
        extra={
          <div className="mt-3">
            <Meter value={budgetPct} color={budgetColor} glow height={5} />
            <div className="mt-2 flex items-center justify-between text-[9.5px] text-faint">
              <span>{usd(settings.monthlyBudgetUsd - totals.monthToDateCost, { cents: false })} remaining</span>
              <span className={monthEnd > settings.monthlyBudgetUsd ? "text-ember/90" : "text-fog/70"}>
                {monthEnd > settings.monthlyBudgetUsd ? "over pace" : "on pace"}
              </span>
            </div>
          </div>
        }
      />
    </section>
  );
}

interface MetricCardProps {
  icon: "sparkles" | "zap" | "layers" | "shield";
  label: string;
  accent: string;
  value: React.ReactNode;
  delta?: number;
  deltaTone?: "spend" | "tokens";
  badge?: string;
  badgeColor?: string;
  detail: string;
  footer: string;
  spark?: number[];
  sparkColor?: string;
  extra?: React.ReactNode;
  delay: number;
}

function MetricCard({
  icon,
  label,
  accent,
  value,
  delta,
  deltaTone = "tokens",
  badge,
  badgeColor,
  detail,
  footer,
  spark,
  sparkColor = "#d3fb52",
  extra,
  delay,
}: MetricCardProps) {
  const positive = (delta ?? 0) > 0;
  const deltaColor =
    deltaTone === "spend"
      ? "text-fog/80 border-white/[0.08] bg-white/[0.03]"
      : positive
        ? "text-signal border-signal/20 bg-signal/[0.06]"
        : "text-ember border-ember/20 bg-ember/[0.06]";

  return (
    <Panel className="rise relative flex min-h-[186px] flex-col overflow-hidden p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        <span
          className="flex h-6 w-6 items-center justify-center rounded-md border"
          style={{ color: accent, borderColor: alpha(accent, "26"), background: alpha(accent, "0d") }}
        >
          <Icon name={icon} size={12} />
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2.5">
        <div className="text-[31px] font-normal leading-none text-ivory">{value}</div>
        {typeof delta === "number" && Number.isFinite(delta) && delta !== 0 ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 font-mono text-[9px] ${deltaColor}`}>
            <Icon name={positive ? "arrow-up-right" : "arrow-down-right"} size={9} />
            {signedPct(Math.abs(delta) > 999 ? 999 : delta, 1)}
          </span>
        ) : badge ? (
          <span
            className="rounded-full border px-1.5 py-1 font-mono text-[8px] tracking-[0.08em]"
            style={{ color: badgeColor, borderColor: alpha(badgeColor ?? "#fff", "2a"), background: alpha(badgeColor ?? "#fff", "0d") }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[10.5px] text-fog/80">{detail}</p>

      {extra}

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <span className="text-[9.5px] leading-relaxed text-faint">{footer}</span>
      </div>

      {spark ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[44px] opacity-[0.55]">
          <Sparkline values={spark} color={sparkColor} className="h-full w-full" height={44} />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/30 to-transparent" />
        </div>
      ) : null}
    </Panel>
  );
}
