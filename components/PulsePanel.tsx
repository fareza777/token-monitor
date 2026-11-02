"use client";

import { pct, relativeTime, signedPct, tokens as fmtTokens, usd } from "@/lib/format";
import type { StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Meter, Panel, PanelHeader } from "./ui/Panel";

export function PulsePanel({ payload }: { payload: StatePayload }) {
  const topProvider = [...payload.providers].sort((a, b) => b.tokensToday - a.tokensToday)[0];
  const subscriptionShare =
    payload.totals.tokensToday > 0 ? (payload.totals.subscriptionTokens / payload.totals.tokensToday) * 100 : 0;
  const dailyBudget = payload.settings.monthlyBudgetUsd / 30;
  const pace = dailyBudget > 0 ? (payload.totals.projectedDayCost / dailyBudget) * 100 : 0;

  return (
    <Panel className="rise flex h-full flex-col p-5 sm:p-6" style={{ animationDelay: "380ms" }}>
      <PanelHeader
        title="Pulse & health"
        subtitle="Operating signals from the collector"
        right={<span className="chip text-[8px]">v{payload.meta.version}</span>}
      />

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Signal
          icon="zap"
          label="Projected today"
          value={usd(payload.totals.projectedDayCost, { cents: false })}
          sub={`${signedPct(payload.totals.deltaCostPct, 0)} vs 7d pace`}
          tone={pace > 110 ? "#ff8f62" : "#d3fb52"}
        />
        <Signal
          icon="layers"
          label="Plan leverage"
          value={usd(payload.totals.subscriptionValue, { cents: false })}
          sub={`${pct(subscriptionShare, 0)} of tokens included`}
          tone="#e8956f"
        />
        <Signal
          icon="sparkles"
          label="Concentration"
          value={topProvider ? pct(topProvider.share, 0) : "—"}
          sub={topProvider ? topProvider.name : "no traffic yet"}
          tone={topProvider?.color ?? "#8d939d"}
        />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[9px] text-faint">
          <span className="label text-[8px]">Daily budget pace</span>
          <span className={pace > 110 ? "text-ember/90" : "text-fog/70"}>
            {usd(payload.totals.projectedDayCost, { cents: false })} of {usd(dailyBudget, { cents: false })}
          </span>
        </div>
        <div className="mt-1.5">
          <Meter value={Math.min(100, pace)} color={pace > 110 ? "#ff8f62" : "#d3fb52"} height={3} />
        </div>
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <div className="flex items-center justify-between">
          <span className="label text-[8px]">Collector health</span>
          <span className="flex items-center gap-1.5 font-mono text-[8px] text-faint">
            <span className="h-1 w-1 rounded-full bg-signal" />
            {payload.meta.demo ? "sim + live" : "all sources"}
          </span>
        </div>
        <div className="mt-2.5 space-y-0">
          {payload.meta.collectors.map((collector) => (
            <div
              key={collector.id}
              className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-[7px] last:border-0"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${collector.state === "live" ? "live-dot" : ""}`}
                  style={{
                    background:
                      collector.state === "live"
                        ? "#d3fb52"
                        : collector.state === "error"
                          ? "#ff8f62"
                          : collector.state === "running"
                            ? "#f0c45a"
                            : collector.state === "idle"
                              ? "#7d848e"
                              : "#3f454e",
                    boxShadow: collector.state === "live" ? "0 0 7px rgba(211,251,82,.6)" : undefined,
                  }}
                />
                <span className="truncate text-[10px] text-fog/85">{collector.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-faint">
                  {collector.state}
                </span>
                <span className="w-[38px] text-right font-mono text-[8px] text-faint/60">
                  {collector.at ? relativeTime(collector.at, payload.now) : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3">
        <span className="text-[9px] text-faint">
          {fmtTokens(payload.totals.tokensToday)} tokens · {payload.totals.activeProviders} active sources
        </span>
        <span className="flex items-center gap-1 font-mono text-[8px] text-faint">
          <Icon name="shield" size={10} />
          local-first
        </span>
      </div>
    </Panel>
  );
}

function Signal({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: "zap" | "layers" | "sparkles";
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.018] p-3">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} size={10} style={{ color: tone }} />
        <span className="label text-[7.5px]">{label}</span>
      </div>
      <div className="num mt-2 text-[18px] leading-none text-ivory/95">{value}</div>
      <div className="mt-1.5 truncate text-[9px] text-faint">{sub}</div>
    </div>
  );
}
