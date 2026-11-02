"use client";

import { clockTime, relativeTime, tokens as fmtTokens, usd } from "@/lib/format";
import { priceFor } from "@/lib/pricing";
import type { FeedEvent, StatePayload } from "@/lib/types";
import { Icon } from "./ui/Icon";
import { Panel, PanelHeader, alpha } from "./ui/Panel";

export function LiveFeed({ payload }: { payload: StatePayload }) {
  return (
    <Panel id="stream" className="rise flex h-full max-h-[600px] flex-col p-5 sm:p-6" style={{ animationDelay: "200ms" }}>
      <PanelHeader
        title="Live stream"
        subtitle="Requests, syncs and collector events"
        right={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.1em] text-signal">
              <span className="h-1.5 w-1.5 rounded-full bg-signal live-dot" />
              LIVE
            </span>
            <span className="chip text-[8px]">1.5s</span>
          </div>
        }
      />

      <div className="scroll-thin mt-4 min-h-0 max-h-[420px] flex-1 space-y-0 overflow-y-auto pr-1">
        {payload.events.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <Icon name="activity" size={20} className="text-faint" />
            <span className="text-[11px] text-faint">Waiting for the first event</span>
          </div>
        ) : (
          payload.events.map((event) => <FeedRow key={event.id} event={event} now={payload.now} />)
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="terminal" size={12} className="shrink-0 text-faint" />
          <span className="truncate font-mono text-[9px] text-faint">POST /api/ingest</span>
        </div>
        <span className="font-mono text-[8.5px] text-faint">{payload.events.length} recent</span>
      </div>
    </Panel>
  );
}

function FeedRow({ event, now }: { event: FeedEvent; now: number }) {
  if (event.kind === "sync" || event.kind === "alert") {
    const alert = event.kind === "alert";
    return (
      <div className="feed-row flex items-start gap-3 border-b border-white/[0.045] py-2.5 last:border-0">
        <span className="num w-9 shrink-0 pt-0.5 text-[9px] text-faint">{clockTime(event.at)}</span>
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
          style={{
            color: alert ? "#ff8f62" : "#8d939d",
            borderColor: alert ? "rgba(255,143,98,.22)" : "rgba(255,255,255,.08)",
            background: alert ? "rgba(255,143,98,.06)" : "rgba(255,255,255,.025)",
          }}
        >
          <Icon name={alert ? "zap" : "refresh"} size={10} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[11px] text-ivory/80">{event.providerName}</span>
            <span className="font-mono text-[7.5px] uppercase tracking-[0.1em]" style={{ color: alert ? "#ff8f62" : "#5b626c" }}>
              {alert ? "ALERT" : "SYNC"}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[9.5px] text-faint">{event.text ?? "Collector updated"}</div>
        </div>
        {event.kind === "sync" && event.tokens > 0 ? (
          <span className="num shrink-0 pt-0.5 text-[9px] text-fog/70">{fmtTokens(event.tokens)} tok</span>
        ) : (
          <span className="shrink-0 pt-0.5 text-[8.5px] text-faint">{relativeTime(event.at, now)}</span>
        )}
      </div>
    );
  }

  const label = priceFor(event.model).label;
  return (
    <div className="feed-row flex items-center gap-3 border-b border-white/[0.045] py-2.5 last:border-0">
      <span className="num w-9 shrink-0 text-[9px] text-faint">{clockTime(event.at)}</span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: event.color, boxShadow: `0 0 6px ${alpha(event.color, "66")}` }}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-ivory/85">{label}</div>
        <div className="mt-0.5 truncate text-[9px] text-faint">
          {event.providerName}
          <span className="mx-1 text-white/15">·</span>
          {fmtTokens(event.tokens)} tok
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[10.5px] text-ivory/80">{event.cost >= 0.005 ? usd(event.cost) : "<$0.01"}</div>
        <div className="mt-0.5 font-mono text-[8px] text-faint">{relativeTime(event.at, now)}</div>
      </div>
    </div>
  );
}
