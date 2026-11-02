"use client";

import type { ReactNode } from "react";

interface RingProps {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}

export function Ring({
  value,
  size = 120,
  stroke = 7,
  color = "#d3fb52",
  track = "rgba(255,255,255,0.075)",
  children,
  className = "",
}: RingProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.2, 0.7, 0.2, 1), stroke 300ms ease",
            filter: `drop-shadow(0 0 5px ${color}55)`,
          }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius - stroke * 1.9}
          fill="none"
          stroke="rgba(255,255,255,0.035)"
          strokeWidth={1}
          strokeDasharray="1 4"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
