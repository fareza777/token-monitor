import type { HTMLAttributes, ReactNode } from "react";

export function Panel({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} {...props}>
      {children}
    </div>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
  accent?: boolean;
}

export function PanelHeader({ title, subtitle, right, className = "", accent = false }: PanelHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {accent ? <span className="h-1.5 w-1.5 rounded-full bg-signal shadow-[0_0_8px_rgba(211,251,82,.7)]" /> : null}
          <h2 className="truncate text-[13.5px] font-medium tracking-[-0.01em] text-ivory/95">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 text-[11px] leading-relaxed text-fog/85">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function alpha(hex: string, opacity: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  return `#${clean}${opacity}`;
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  live: { label: "LIVE", color: "#d3fb52", bg: "rgba(211,251,82,.08)", border: "rgba(211,251,82,.18)" },
  demo: { label: "DEMO", color: "#f0c45a", bg: "rgba(240,196,90,.08)", border: "rgba(240,196,90,.2)" },
  idle: { label: "IDLE", color: "#9aa1ab", bg: "rgba(255,255,255,.04)", border: "rgba(255,255,255,.08)" },
  degraded: { label: "ISSUE", color: "#ff8f62", bg: "rgba(255,143,98,.08)", border: "rgba(255,143,98,.22)" },
  offline: { label: "OFF", color: "#5b626c", bg: "rgba(255,255,255,.025)", border: "rgba(255,255,255,.06)" },
  syncing: { label: "SYNC", color: "#7dd3fc", bg: "rgba(125,211,252,.08)", border: "rgba(125,211,252,.2)" },
};

export function StatusChip({ status, subtle = false }: { status: string; subtle?: boolean }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.idle;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-mono text-[8.5px] tracking-[0.1em]"
      style={{
        color: subtle ? "rgba(244,242,234,.55)" : style.color,
        background: subtle ? "transparent" : style.bg,
        borderColor: subtle ? "rgba(255,255,255,.07)" : style.border,
      }}
    >
      <span
        className={`h-1 w-1 rounded-full ${status === "live" ? "live-dot" : ""}`}
        style={{ background: style.color, opacity: status === "live" ? 1 : 0.8 }}
      />
      {style.label}
    </span>
  );
}

export function Monogram({ short, color, size = 34 }: { short: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[10px] border font-mono font-medium"
      style={{
        width: size,
        height: size,
        color,
        background: alpha(color, "16"),
        borderColor: alpha(color, "2e"),
        boxShadow: `inset 0 1px 0 ${alpha(color, "1f")}`,
        fontSize: size * 0.31,
        letterSpacing: "0.02em",
      }}
    >
      {short.slice(0, 2)}
    </span>
  );
}

export function Meter({
  value,
  color = "#d3fb52",
  className = "",
  height = 4,
  glow = false,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  glow?: boolean;
}) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div className={`meter ${className}`} style={{ height }}>
      <span
        style={{
          width: `${clamped}%`,
          background: color,
          boxShadow: glow ? `0 0 10px ${color}66` : undefined,
        }}
      />
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`divider ${className}`} />;
}
