"use client";

import { Icon, type IconName } from "./ui/Icon";

interface SidebarProps {
  active: string;
  onNavigate: (id: string) => void;
  onOpenSettings: () => void;
  connected: boolean;
}

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "overview", label: "Deck", icon: "grid" },
  { id: "providers", label: "Sources", icon: "layers" },
  { id: "models", label: "Models", icon: "cpu" },
  { id: "stream", label: "Live", icon: "activity" },
];

export function Sidebar({ active, onNavigate, onOpenSettings, connected }: SidebarProps) {
  return (
    <aside className="sticky top-0 z-40 hidden h-screen w-[84px] shrink-0 flex-col items-center border-r border-line/70 bg-ink/55 py-5 backdrop-blur-xl md:flex">
      <button
        type="button"
        onClick={() => onNavigate("overview")}
        className="group flex h-10 w-10 items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.035] transition hover:border-signal/30 hover:bg-signal/[0.06]"
        aria-label="Token Monitor home"
      >
        <span className="grid grid-cols-2 gap-[3px]">
          <span className="h-[6px] w-[6px] rounded-[1.5px] bg-ivory/70 transition group-hover:bg-ivory" />
          <span className="h-[6px] w-[6px] rounded-[1.5px] bg-signal shadow-[0_0_7px_rgba(211,251,82,.6)]" />
          <span className="h-[6px] w-[6px] rounded-[1.5px] bg-ivory/25" />
          <span className="h-[6px] w-[6px] rounded-[1.5px] bg-ivory/45" />
        </span>
      </button>

      <div className="mt-8 flex w-full flex-col items-center gap-2">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="nav-btn"
            data-active={active === item.id}
            aria-current={active === item.id ? "page" : undefined}
            title={item.label}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="nav-btn"
          title="Workspace settings"
        >
          <Icon name="sliders" size={17} />
          <span>Setup</span>
        </button>

        <div className="h-px w-6 bg-white/10" />

        <div className="flex flex-col items-center gap-1.5" title={connected ? "Live stream connected" : "Reconnecting to live stream"}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-signal" : "bg-faint"}`}
          />
          <span className="font-mono text-[8px] tracking-[0.08em] text-faint">v0.1</span>
        </div>
      </div>
    </aside>
  );
}
