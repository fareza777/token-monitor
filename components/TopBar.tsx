"use client";

import { fullDate, RANGE_CONFIG } from "@/lib/format";
import type { RangeKey } from "@/lib/types";
import { Icon } from "./ui/Icon";

interface TopBarProps {
  now: number;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
  connected: boolean;
  onOpenSource: () => void;
  onOpenSettings: () => void;
  demo: boolean;
  providerCount: number;
}

const RANGES: RangeKey[] = ["1h", "24h", "7d", "30d"];

export function TopBar({
  now,
  range,
  onRange,
  connected,
  onOpenSource,
  onOpenSettings,
  demo,
  providerCount,
}: TopBarProps) {
  return (
    <header className="rise">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-faint">
            <span>Workspace</span>
            <span className="text-white/20">/</span>
            <span className="text-ivory/55">Overview</span>
            <span className="ml-1 h-1 w-1 rounded-full bg-signal/70" />
            <span className="normal-case tracking-normal text-fog/70">{providerCount} sources</span>
          </div>
          <h1 className="mt-2.5 text-[30px] font-medium leading-none tracking-[-0.045em] text-ivory sm:text-[34px]">
            Usage overview
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-fog/90">
            Every provider, every token — one live signal.{" "}
            <span className="text-faint">{fullDate(now)}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] py-1 pl-2.5 pr-3"
            title={connected ? "Streaming snapshots every 1.5s" : "Reconnecting to the snapshot stream"}
          >
            <span className="relative flex h-1.5 w-1.5">
              {connected ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-40" />
              ) : null}
              <span className={`relative h-1.5 w-1.5 rounded-full ${connected ? "bg-signal" : "bg-faint"}`} />
            </span>
            <span className={`font-mono text-[9px] tracking-[0.12em] ${connected ? "text-signal" : "text-faint"}`}>
              {connected ? "LIVE" : "SYNCING"}
            </span>
            <span className="font-mono text-[8.5px] tracking-[0.04em] text-faint">1.5s</span>
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-black/25 p-0.5">
            {RANGES.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onRange(key)}
                className="range-tab"
                data-active={range === key}
                aria-pressed={range === key}
                title={RANGE_CONFIG[key].label}
              >
                {RANGE_CONFIG[key].short}
              </button>
            ))}
          </div>

          <button type="button" className="icon-btn" onClick={onOpenSettings} aria-label="Workspace settings" title="Workspace settings">
            <Icon name="sliders" size={15} />
          </button>

          <button type="button" className="btn btn-primary" onClick={onOpenSource}>
            <Icon name="plus" size={14} />
            Add source
          </button>
        </div>
      </div>

      {demo ? <DemoBanner onOpenSource={onOpenSource} /> : null}
    </header>
  );
}

function DemoBanner({ onOpenSource }: { onOpenSource: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[13px] border border-signal/[0.16] bg-signal/[0.045] px-4 py-2.5">
      <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.12em] text-signal">
        <span className="h-1.5 w-1.5 rounded-full bg-signal live-dot" />
        SIMULATION
      </span>
      <span className="text-[11.5px] text-ivory/70">
        Demo traffic is filling sources without credentials — every demo number is labeled.
      </span>
      <span className="text-[11px] text-faint">Connect a key in .env.local or POST to /api/ingest.</span>
      <button
        type="button"
        onClick={onOpenSource}
        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-signal transition hover:text-[#e4ff86]"
      >
        Connect a source
        <Icon name="arrow-right" size={12} />
      </button>
    </div>
  );
}
