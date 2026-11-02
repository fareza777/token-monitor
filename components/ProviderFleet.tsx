"use client";

import { useMemo } from "react";
import { signedPct, tokens as fmtTokens, usd } from "@/lib/format";
import type { StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Monogram, Panel, PanelHeader, StatusChip } from "./ui/Panel";
import { Sparkline } from "./ui/Sparkline";

export function ProviderFleet({ payload, onManage }: { payload: StatePayload; onManage: () => void }) {
  const providers = useMemo(
    () => [...payload.providers].sort((a, b) => b.tokensToday - a.tokensToday),
    [payload.providers],
  );

  return (
    <Panel id="providers" className="rise flex h-full flex-col p-5 sm:p-6" style={{ animationDelay: "260ms" }}>
      <PanelHeader
        title="Provider fleet"
        subtitle={`${payload.providers.length} sources · ${payload.meta.liveProviders} connected · ${payload.meta.demoProviders} demo`}
        right={
          <button type="button" className="btn btn-ghost !px-2.5 !py-1.5 text-[10.5px]" onClick={onManage}>
            Manage
            <Icon name="arrow-right" size={11} />
          </button>
        }
      />

      <div className="mt-4 hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_82px_78px_56px] gap-3 border-b border-white/[0.06] pb-2 lg:grid">
        <span className="label text-[8px]">Source</span>
        <span className="label text-[8px]">Tokens today</span>
        <span className="label text-[8px] text-right">Cost</span>
        <span className="label text-[8px] text-right">40 min</span>
        <span className="label text-[8px] text-right">Share</span>
      </div>

      <div className="mt-1 flex-1">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="group grid grid-cols-[minmax(0,1.6fr)_auto] items-center gap-3 border-b border-white/[0.045] py-3 last:border-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_82px_78px_56px]"
            title={provider.note}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Monogram short={provider.short} color={provider.color} size={32} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium text-ivory/90">{provider.name}</span>
                  <StatusChip status={provider.status} />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-faint">
                  <span className="truncate">{provider.planLabel}</span>
                  <span className="text-white/15">·</span>
                  <span className="shrink-0">
                    {provider.kind === "subscription" ? "subscription" : provider.custom ? "gateway" : "api"}
                  </span>
                  {provider.simulated ? (
                    <>
                      <span className="text-white/15">·</span>
                      <span className="text-[#f0c45a]/80">demo</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 lg:block">
              <div className="flex items-baseline gap-2">
                <span className="num text-[13px] text-ivory/90">{fmtTokens(provider.tokensToday)}</span>
                <span
                  className={`font-mono text-[8.5px] ${
                    provider.deltaPct > 0 ? "text-signal/70" : provider.deltaPct < 0 ? "text-ember/70" : "text-faint"
                  }`}
                >
                  {provider.deltaPct !== 0 ? signedPct(provider.deltaPct, 0) : "—"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-[3px] w-full max-w-[110px] overflow-hidden rounded-full bg-white/[0.055]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${Math.min(100, provider.share)}%`, background: provider.color, opacity: 0.85 }}
                  />
                </span>
                <span className="font-mono text-[8px] text-faint">{provider.share.toFixed(1)}%</span>
              </div>
            </div>

            <div className="hidden text-right lg:block">
              <div className="num text-[11.5px] text-ivory/80">{usd(provider.costToday)}</div>
              <div className="mt-0.5 font-mono text-[8px] text-faint">
                {provider.kind === "subscription" ? "api eq." : "billable"}
              </div>
            </div>

            <div className="hidden justify-end lg:flex">
              <Sparkline
                values={provider.spark}
                color={provider.color}
                className="h-[22px] w-[68px] opacity-80"
                height={22}
                strokeWidth={1.2}
              />
            </div>

            <div className="hidden justify-end lg:flex">
              <div className="flex items-center gap-1.5">
                {provider.quota[0] ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: provider.color }} />
                    <span className="num text-[9.5px] text-fog/80">{Math.round(provider.quota[0].usedPct)}%</span>
                  </>
                ) : (
                  <span className="font-mono text-[8.5px] text-faint">—</span>
                )}
              </div>
            </div>

            <div className="text-right lg:hidden">
              <div className="num text-[12px] text-ivory/85">{fmtTokens(provider.tokensToday)}</div>
              <div className="num mt-0.5 text-[9px] text-faint">{usd(provider.costToday)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="text-[9px] text-faint">
          {payload.totals.activeProviders} active · {payload.providers.length} configured · refresh 1.5s
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[8.5px] text-faint">
          <span className="h-1 w-1 rounded-full bg-signal/80" />
          {payload.meta.liveProviders} live
        </span>
      </div>
    </Panel>
  );
}
