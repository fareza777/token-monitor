"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { relativeTime, tokens as fmtTokens, usd } from "@/lib/format";
import type { RangeKey, StatePayload } from "@/lib/types";
import { BurnChart } from "./BurnChart";
import { KpiCards } from "./KpiCards";
import { LimitsPanel } from "./LimitsPanel";
import { LiveFeed } from "./LiveFeed";
import { ModelBoard } from "./ModelBoard";
import { ProviderFleet } from "./ProviderFleet";
import { PulsePanel } from "./PulsePanel";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";
import { SourceDialog } from "./SourceDialog";
import { TopBar } from "./TopBar";
import { Icon } from "./ui/Icon";

export function Dashboard({ initial }: { initial: StatePayload }) {
  const [state, setState] = useState<StatePayload>(initial);
  const [range, setRange] = useState<RangeKey>("1h");
  const [connected, setConnected] = useState(true);
  const [active, setActive] = useState("overview");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clock, setClock] = useState(initial.now);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;
    const stream = new EventSource(`/api/stream?range=${range}`);

    stream.onmessage = (event) => {
      if (!alive) return;
      try {
        const payload = JSON.parse(event.data) as StatePayload;
        setState(payload);
        setConnected(true);
        setClock(payload.now);
      } catch {
        // Ignore malformed frames; the next snapshot will replace them.
      }
    };
    stream.onerror = () => {
      if (alive) setConnected(false);
    };

    return () => {
      alive = false;
      stream.close();
    };
  }, [range, tick]);

  useEffect(() => {
    const sections = ["overview", "providers", "models", "stream"];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-18% 0px -68% 0px", threshold: 0 },
    );
    for (const id of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/state?range=${range}`, { cache: "no-store" });
      if (response.ok) setState((await response.json()) as StatePayload);
    } catch {
      // The live stream will catch up.
    }
  }, [range]);

  const view = useMemo(() => ({ ...state, now: clock }), [state, clock]);
  const pending = state.range !== range;

  const navigate = (id: string) => {
    if (id === "settings") {
      setSettingsOpen(true);
      return;
    }
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openSource = () => setSourceOpen(true);

  return (
    <div className="flex min-h-screen">
      <Sidebar active={active} onNavigate={navigate} onOpenSettings={() => setSettingsOpen(true)} connected={connected} />

      <main className="min-w-0 flex-1 px-4 pb-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <div className="mx-auto w-full max-w-[1560px]">
          <div className="mb-5 flex items-center justify-between md:hidden">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.035]">
                <span className="grid grid-cols-2 gap-[2.5px]">
                  <span className="h-[5px] w-[5px] rounded-[1px] bg-ivory/70" />
                  <span className="h-[5px] w-[5px] rounded-[1px] bg-signal" />
                  <span className="h-[5px] w-[5px] rounded-[1px] bg-ivory/25" />
                  <span className="h-[5px] w-[5px] rounded-[1px] bg-ivory/45" />
                </span>
              </span>
              <div>
                <div className="text-[12px] font-medium text-ivory">Token Monitor</div>
                <div className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-faint">live llm telemetry</div>
              </div>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-[8.5px] text-signal">
              <span className="h-1.5 w-1.5 rounded-full bg-signal live-dot" />
              LIVE
            </span>
          </div>

          <div id="overview" className="scroll-mt-6">
            <TopBar
              now={clock}
              range={range}
              onRange={setRange}
              connected={connected && !pending}
              onOpenSource={openSource}
              onOpenSettings={() => setSettingsOpen(true)}
              demo={state.meta.demo}
              providerCount={state.providers.length}
            />
            <div className="mt-5">
              <KpiCards payload={view} />
            </div>
          </div>

          <div className={`mt-5 grid gap-5 transition-opacity duration-300 xl:grid-cols-[minmax(0,1.68fr)_minmax(330px,1fr)] ${pending ? "opacity-60" : "opacity-100"}`}>
            <BurnChart payload={view} />
            <LimitsPanel payload={view} onOpenSettings={() => setSettingsOpen(true)} />
          </div>

          <div className={`mt-5 grid gap-5 transition-opacity duration-300 xl:grid-cols-[minmax(0,1.62fr)_minmax(340px,1fr)] ${pending ? "opacity-60" : "opacity-100"}`}>
            <ProviderFleet payload={view} onManage={openSource} />
            <LiveFeed payload={view} />
          </div>

          <div className={`mt-5 grid gap-5 transition-opacity duration-300 xl:grid-cols-[minmax(0,1.62fr)_minmax(340px,1fr)] ${pending ? "opacity-60" : "opacity-100"}`}>
            <ModelBoard payload={view} />
            <PulsePanel payload={view} />
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-4">
            <div className="flex items-center gap-2 text-[9.5px] text-faint">
              <span className="font-mono uppercase tracking-[0.12em] text-fog/70">Token Monitor</span>
              <span className="text-white/15">/</span>
              <span>local-first usage command deck</span>
              <span className="text-white/15">·</span>
              <span>v{state.meta.version}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[9px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-signal/70" />
                updated {relativeTime(state.now, clock)}
              </span>
              <span className="hidden sm:inline">official · local · experimental · demo</span>
              <a
                href="https://github.com/fareza777/token-monitor"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 transition hover:text-ivory"
              >
                github
                <Icon name="external" size={9} />
              </a>
              <button type="button" onClick={openSource} className="transition hover:text-ivory">
                ingest api
              </button>
              <button type="button" onClick={() => setSettingsOpen(true)} className="transition hover:text-ivory">
                settings
              </button>
            </div>
          </footer>

          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 font-mono text-[8px] tracking-[0.05em] text-faint/60">
            <span>
              {fmtTokens(state.totals.tokensToday)} tokens today · {usd(state.totals.costToday)} equivalent ·{" "}
              {state.meta.claudeLogs} claude files · {state.meta.codexLogs} codex rollouts
            </span>
            <span>stream 1.5s · {connected ? "connected" : "reconnecting"}</span>
          </div>
        </div>
      </main>

      <SourceDialog
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onChanged={() => {
          void refresh();
          setTick((value) => value + 1);
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={state.settings}
        onSaved={() => {
          void refresh();
          setTick((value) => value + 1);
        }}
      />
    </div>
  );
}
