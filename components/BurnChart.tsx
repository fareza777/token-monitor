"use client";

import { useMemo, useState } from "react";
import { compact, RANGE_CONFIG, axisLabel, clockTime, tokens, usd } from "@/lib/format";
import type { RangeKey, StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { PanelHeader, Panel } from "./ui/Panel";

type Metric = "tokens" | "spend";

export function BurnChart({ payload }: { payload: StatePayload }) {
  const [metric, setMetric] = useState<Metric>("tokens");
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const series = payload.series;
  const range = payload.range;
  const providers = useMemo(
    () => [...payload.providers].sort((a, b) => b.tokensWindow - a.tokensWindow),
    [payload.providers],
  );
  const chartProviders = useMemo(
    () => (metric === "tokens" ? providers : providers.filter((provider) => provider.kind !== "subscription")),
    [providers, metric],
  );

  const valueAt = (providerId: string, index: number) =>
    metric === "tokens" ? (series[index]?.providers[providerId] ?? 0) : (series[index]?.costs[providerId] ?? 0);

  const totals = series.map((point) =>
    metric === "tokens"
      ? point.total
      : chartProviders.reduce((sum, provider) => sum + (point.costs[provider.id] ?? 0), 0),
  );
  const rawMax = Math.max(...totals, 0);
  const max = niceChartMax(rawMax);
  const geometry = useMemo(() => {
    let lower = series.map(() => 0);
    const layers = chartProviders.map((provider) => {
      const values = series.map((_, index) => (hidden.has(provider.id) ? 0 : valueAt(provider.id, index)));
      const top = values.map((value, index) => lower[index] + value);
      const upperLine = top
        .map((value, index) => `${index === 0 ? "M" : "L"}${xPos(index, series.length)} ${yPos(value, max)}`)
        .join(" ");
      const lowerLine = lower
        .slice()
        .reverse()
        .map((value, index) => `L${xPos(series.length - 1 - index, series.length)} ${yPos(value, max)}`)
        .join(" ");
      const area = `${upperLine} ${lowerLine} Z`;
      lower = top;
      return { provider, area, line: upperLine };
    });
    return { layers, stackTop: lower };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, chartProviders, metric, max, hidden]);

  const activeIndex = hover ?? series.length - 1;
  const activeTotal = totals[activeIndex] ?? 0;
  const visibleProviders = chartProviders.filter((provider) => valueAt(provider.id, activeIndex) > 0);
  const peak = Math.max(...totals, 0);
  const average = totals.reduce((sum, value) => sum + value, 0) / Math.max(1, totals.length);
  const formatValue = (value: number) => (metric === "tokens" ? tokens(value) : usd(value));
  const hasData = rawMax > 0;

  const toggleProvider = (id: string) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Panel className="rise flex h-full min-h-[466px] flex-col p-5 sm:p-6" style={{ animationDelay: "80ms" }}>
      <PanelHeader
        title="Token throughput"
        subtitle={`${RANGE_CONFIG[range].label} · ${
          metric === "tokens" ? `stacked across ${chartProviders.length} sources` : "billable API spend"
        }`}
        right={
          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/25 p-0.5">
            <button
              type="button"
              className="range-tab"
              data-active={metric === "tokens"}
              onClick={() => setMetric("tokens")}
            >
              Tokens
            </button>
            <button
              type="button"
              className="range-tab"
              data-active={metric === "spend"}
              onClick={() => setMetric("spend")}
            >
              Spend
            </button>
          </div>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {chartProviders.map((provider) => {
          const isHidden = hidden.has(provider.id);
          return (
            <button
              key={provider.id}
              type="button"
              onClick={() => toggleProvider(provider.id)}
              className={`group inline-flex items-center gap-1.5 transition ${isHidden ? "opacity-30" : "opacity-100"}`}
              title={`${isHidden ? "Show" : "Hide"} ${provider.name}`}
            >
              <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: provider.color }} />
              <span className="text-[10px] text-fog/85 transition group-hover:text-ivory">{provider.name}</span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-5 flex-1">
        <div className="absolute inset-y-0 left-0 w-10">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <div
              key={ratio}
              className="absolute right-0 -translate-y-1/2 font-mono text-[8.5px] text-faint/80"
              style={{ top: `${6 + ratio * 88}%` }}
            >
              {metric === "tokens" ? compact(max * (1 - ratio), 0) : usd(max * (1 - ratio), { cents: false })}
            </div>
          ))}
        </div>

        <div className="absolute bottom-6 left-11 right-0 top-1">
          <svg
            viewBox="0 0 1000 300"
            preserveAspectRatio="none"
            className="h-full w-full overflow-visible"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              setHover(Math.round(ratio * (series.length - 1)));
            }}
            role="img"
            aria-label={`Stacked token usage chart, ${RANGE_CONFIG[range].label}`}
          >
            <defs>
              {providers.map((provider) => (
                <linearGradient key={provider.id} id={`area-${sanitize(provider.id)}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={provider.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={provider.color} stopOpacity="0.025" />
                </linearGradient>
              ))}
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
              <line
                key={ratio}
                x1="0"
                x2="1000"
                y1={8 + ratio * 284}
                y2={8 + ratio * 284}
                stroke="rgba(255,255,255,0.055)"
                strokeDasharray="2 6"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {geometry.layers.map(({ provider, area, line }) => (
              <g key={provider.id}>
                <path d={area} fill={`url(#area-${sanitize(provider.id)})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={provider.color}
                  strokeOpacity={hidden.has(provider.id) ? 0 : 0.55}
                  strokeWidth={1.2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </g>
            ))}

            {hover !== null ? (
              <line
                x1={xPos(hover, series.length)}
                x2={xPos(hover, series.length)}
                y1="0"
                y2="300"
                stroke="rgba(255,255,255,0.34)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {hasData ? (
              <>
                <circle
                  cx={xPos(series.length - 1, series.length)}
                  cy={yPos((geometry.stackTop[series.length - 1] ?? 0) as number, max)}
                  r="3"
                  fill="#d3fb52"
                />
                <circle
                  cx={xPos(series.length - 1, series.length)}
                  cy={yPos((geometry.stackTop[series.length - 1] ?? 0) as number, max)}
                  r="7"
                  fill="#d3fb52"
                  fillOpacity="0.12"
                />
              </>
            ) : null}
          </svg>
        </div>

        <div className="absolute bottom-0 left-11 right-0 flex justify-between">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const index = Math.min(series.length - 1, Math.round(ratio * (series.length - 1)));
            const point = series[index];
            return (
              <span
                key={ratio}
                className="font-mono text-[8.5px] text-faint/80"
                style={{ transform: ratio === 0 ? "none" : ratio === 1 ? "translateX(-100%)" : "translateX(-50%)" }}
              >
                {point ? axisLabel(point.t, RANGE_CONFIG[range].axis) : "—"}
              </span>
            );
          })}
        </div>

        {hover !== null && series[hover] ? (
          <div
            className="pointer-events-none absolute top-0 z-20 w-[210px] -translate-x-1/2 rounded-xl border border-white/[0.1] bg-[#0c0f12]/95 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,.9)] backdrop-blur-xl"
            style={{ left: `${Math.min(82, Math.max(18, (xPos(hover, series.length) / 1000) * 100))}%` }}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-faint">
                {range === "30d" ? axisLabel(series[hover].t, "date") : clockTime(series[hover].t)}
              </span>
              <span className="font-mono text-[9px] text-fog/70">{metric === "tokens" ? "TOKENS" : "SPEND"}</span>
            </div>
            <div className="mt-1.5 text-[17px] font-normal text-ivory">{formatValue(activeTotal)}</div>
            <div className="mt-2.5 space-y-1.5 border-t border-white/[0.07] pt-2.5">
              {visibleProviders.slice(0, 4).map((provider) => (
                <div key={provider.id} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: provider.color }} />
                    <span className="truncate text-[10px] text-fog">{provider.name}</span>
                  </span>
                  <span className="font-mono text-[9.5px] text-ivory/85">
                    {formatValue(valueAt(provider.id, hover))}
                  </span>
                </div>
              ))}
              {visibleProviders.length > 4 ? (
                <div className="text-[9px] text-faint">+{visibleProviders.length - 4} more sources</div>
              ) : null}
            </div>
          </div>
        ) : null}

        {!hasData ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pb-6">
            <Icon name="activity" size={20} className="text-faint" />
            <span className="text-[11px] text-faint">No traffic in this window yet</span>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-4">
        <ChartStat label="Peak" value={formatValue(peak)} hint="per bucket" />
        <ChartStat label="Average" value={formatValue(average)} hint="per bucket" />
        <ChartStat
          label={RANGE_CONFIG[range].short === "1H" ? "Window" : "In range"}
          value={formatValue(totals.reduce((sum, value) => sum + value, 0))}
          hint={metric === "tokens" ? "tokens" : "estimated"}
        />
      </div>
    </Panel>
  );
}

function ChartStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <div className="label text-[8.5px]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="num text-[15px] text-ivory/90">{value}</span>
        <span className="text-[9px] text-faint">{hint}</span>
      </div>
    </div>
  );
}

function xPos(index: number, count: number): number {
  return (index / Math.max(1, count - 1)) * 1000;
}

function yPos(value: number, max: number): number {
  return 292 - (value / Math.max(1, max)) * 284;
}

function niceChartMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}
