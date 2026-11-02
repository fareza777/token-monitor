"use client";

import { signedPct, tokens as fmtTokens, usd } from "@/lib/format";
import type { StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Panel, PanelHeader } from "./ui/Panel";
import { Sparkline } from "./ui/Sparkline";

export function ModelBoard({ payload }: { payload: StatePayload }) {
  const models = payload.models.slice(0, 7);
  const total = payload.totals.tokensToday || 1;

  return (
    <Panel id="models" className="rise flex h-full flex-col p-5 sm:p-6" style={{ animationDelay: "320ms" }}>
      <PanelHeader
        title="Model leaderboard"
        subtitle="Today by tokens, across every source"
        right={<span className="chip text-[8px]">TOP {Math.max(models.length, 1)}</span>}
      />

      <div className="mt-4 hidden grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_86px_72px_66px] gap-3 border-b border-white/[0.06] pb-2 md:grid">
        <span className="label text-[8px]">Model</span>
        <span className="label text-[8px]">Source</span>
        <span className="label text-[8px] text-right">Tokens</span>
        <span className="label text-[8px] text-right">Cost</span>
        <span className="label text-[8px] text-right">7d</span>
      </div>

      <div className="mt-1 flex-1">
        {models.length === 0 ? (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-2">
            <Icon name="cpu" size={20} className="text-faint" />
            <span className="text-[11px] text-faint">No model traffic recorded yet</span>
          </div>
        ) : (
          models.map((model, index) => (
            <div
              key={`${model.providerId}-${model.id}`}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.045] py-2.5 last:border-0 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)_86px_72px_66px]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="num w-4 shrink-0 text-[8.5px] text-faint/70">{String(index + 1).padStart(2, "0")}</span>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border font-mono text-[8px]"
                  style={{
                    color: model.color,
                    borderColor: `${model.color}26`,
                    background: `${model.color}0d`,
                  }}
                >
                  {model.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[11.5px] text-ivory/90">{model.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[8.5px] text-faint">
                    <span className="truncate">{model.vendor}</span>
                    <span className="text-white/15">·</span>
                    <span className="shrink-0">{model.share.toFixed(1)}% of today</span>
                  </div>
                </div>
              </div>

              <div className="hidden min-w-0 items-center gap-1.5 md:flex">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: model.color }} />
                <span className="truncate text-[10px] text-fog/85">{model.providerName}</span>
              </div>

              <div className="hidden text-right md:block">
                <div className="num text-[11px] text-ivory/85">{fmtTokens(model.tokens)}</div>
                <div className="mt-0.5 font-mono text-[8px] text-faint">
                  {signedPct(model.deltaPct, 0)}
                </div>
              </div>

              <div className="hidden text-right md:block">
                <div className="num text-[10.5px] text-fog/85">{usd(model.cost, { cents: model.cost < 100 })}</div>
                <div className="mt-0.5 font-mono text-[8px] text-faint">{fmtTokens(model.requests)} req</div>
              </div>

              <div className="hidden justify-end md:flex">
                <Sparkline
                  values={model.trend}
                  color={model.color}
                  className="h-[22px] w-[62px] opacity-75"
                  height={22}
                  strokeWidth={1.1}
                />
              </div>

              <div className="text-right md:hidden">
                <div className="num text-[11px] text-ivory/85">{fmtTokens(model.tokens)}</div>
                <div className="num mt-0.5 text-[8.5px] text-faint">{usd(model.cost)}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="text-[9px] text-faint">
          {fmtTokens(total)} tokens tracked today · {payload.models.length} model routes
        </span>
        <span className="font-mono text-[8.5px] text-faint">est. pricing</span>
      </div>
    </Panel>
  );
}
