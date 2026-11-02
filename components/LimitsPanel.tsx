"use client";

import { countdown, pct, usd } from "@/lib/format";
import type { StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Meter, Panel, PanelHeader, alpha } from "./ui/Panel";
import { Ring } from "./ui/Ring";

interface LimitsPanelProps {
  payload: StatePayload;
  onOpenSettings: () => void;
}

interface FlatWindow {
  id: string;
  label: string;
  usedPct: number;
  windowSeconds: number;
  resetsAt: number | null;
  provenance: string;
  note?: string;
  providerId: string;
  providerName: string;
  providerShort: string;
  color: string;
}

export function LimitsPanel({ payload, onOpenSettings }: LimitsPanelProps) {
  const windows: FlatWindow[] = payload.quotas.flatMap((quota) =>
    quota.windows.map((window) => ({
      ...window,
      providerId: quota.providerId,
      providerName: quota.providerName,
      providerShort: payload.providers.find((provider) => provider.id === quota.providerId)?.short ?? "—",
      color: quota.color,
    })),
  );

  const hero = windows.reduce<FlatWindow | null>(
    (current, window) => (!current || window.usedPct > current.usedPct ? window : current),
    null,
  );

  const provenance = windows.some((window) => window.provenance === "official")
    ? "official"
    : windows.some((window) => window.provenance === "local")
      ? "local"
      : windows.some((window) => window.provenance === "experimental")
        ? "experimental"
        : "demo";

  const budget = payload.settings.monthlyBudgetUsd;
  const used = payload.totals.monthToDateCost;
  const budgetPct = budget > 0 ? (used / budget) * 100 : 0;
  const budgetColor = budgetPct > 100 ? "#ff8f62" : budgetPct > 78 ? "#f0c45a" : "#d3fb52";
  const heroColor = hero && hero.usedPct >= 90 ? "#ff8f62" : hero && hero.usedPct >= 75 ? "#f0c45a" : "#d3fb52";

  return (
    <Panel className="rise flex h-full flex-col p-5 sm:p-6" style={{ animationDelay: "140ms" }}>
      <PanelHeader
        title="Limits & windows"
        subtitle="Subscription quota and monthly budget"
        right={
          <span
            className="chip uppercase"
            style={{
              color: provenance === "demo" ? "#f0c45a" : provenance === "experimental" ? "#7dd3fc" : "#d3fb52",
              borderColor: provenance === "demo" ? "rgba(240,196,90,.2)" : "rgba(211,251,82,.18)",
              background: provenance === "demo" ? "rgba(240,196,90,.06)" : "rgba(211,251,82,.05)",
            }}
            title="Where the quota numbers come from"
          >
            {provenance}
          </span>
        }
      />

      {hero ? (
        <div className="mt-5 flex items-center gap-4">
          <Ring value={hero.usedPct} size={124} stroke={7} color={heroColor}>
            <span className="num text-[25px] leading-none text-ivory">{Math.round(hero.usedPct)}%</span>
            <span className="mt-1.5 font-mono text-[7.5px] uppercase tracking-[0.14em] text-faint">used</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: hero.color }} />
              <span className="truncate text-[12.5px] text-ivory/90">{hero.providerName}</span>
            </div>
            <div className="mt-1 text-[10.5px] text-fog">
              {hero.label} window · most constrained
            </div>
            <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-faint">
              <Icon name="clock" size={11} />
              resets in <span className="num text-ivory/70">{countdown(hero.resetsAt, payload.now)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <span className="chip text-[8px]">{hero.provenance.toUpperCase()}</span>
              <span className="chip text-[8px]">
                {hero.windowSeconds >= 604_800 ? "WEEKLY" : "SESSION"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
          <Icon name="shield" size={18} className="text-faint" />
          <div>
            <div className="text-[11.5px] text-ivory/80">No subscription windows connected</div>
            <div className="mt-0.5 text-[10px] text-faint">Enable Claude Code or Codex in sources to read live limits.</div>
          </div>
        </div>
      )}

      {windows.length > 1 ? (
        <div className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
          {windows.slice(0, 4).map((window) => {
            const color = window.usedPct >= 90 ? "#ff8f62" : window.usedPct >= 75 ? "#f0c45a" : window.color;
            return (
              <div key={`${window.providerId}-${window.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-white/[0.06] bg-white/[0.025] font-mono text-[7px] text-fog">
                      {window.providerShort}
                    </span>
                    <span className="truncate text-[10.5px] text-fog/90">{window.providerName}</span>
                    <span className="text-[9px] text-faint">/</span>
                    <span className="text-[9.5px] text-faint">{window.label}</span>
                  </div>
                  <span className="num text-[11px] text-ivory/85">{pct(window.usedPct, 0)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <Meter value={window.usedPct} color={color} height={3} />
                  <span className="w-[54px] shrink-0 text-right font-mono text-[8.5px] text-faint">
                    {countdown(window.resetsAt, payload.now)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-auto border-t border-white/[0.06] pt-4">
        <div className="flex items-center justify-between">
          <span className="label text-[8.5px]">Monthly budget</span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="text-[9.5px] text-faint transition hover:text-ivory"
          >
            Adjust
          </button>
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="num text-[18px] text-ivory/95">{usd(used, { cents: false })}</span>
          <span className="font-mono text-[9.5px] text-faint">of {usd(budget, { cents: false })}</span>
        </div>
        <div className="mt-2.5">
          <Meter value={budgetPct} color={budgetColor} height={4} />
          <div className="mt-2 flex items-center justify-between text-[9px] text-faint">
            <span style={{ color: alpha(budgetColor, "cc") }}>{pct(budgetPct, 1)} used</span>
            <span>projected {usd(used + payload.totals.projectedDayCost * daysLeft(payload.now), { cents: false })}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function daysLeft(now: number): number {
  const date = new Date(now);
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Math.max(0, total - date.getDate());
}
