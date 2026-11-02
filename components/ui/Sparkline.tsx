"use client";

import { useId } from "react";

interface SparklineProps {
  values: number[];
  color?: string;
  className?: string;
  height?: number;
  strokeWidth?: number;
  fill?: boolean;
}

export function Sparkline({
  values,
  color = "#d3fb52",
  className = "",
  height = 36,
  strokeWidth = 1.4,
  fill = true,
}: SparklineProps) {
  const id = useId().replace(/:/g, "");
  const width = 120;
  const pad = 2;
  const safe = values.length ? values : [0, 0];
  const max = Math.max(...safe, 1);
  const step = safe.length > 1 ? (width - pad * 2) / (safe.length - 1) : 0;

  const points = safe.map((value, index) => {
    const x = pad + index * step;
    const y = height - pad - (value / max) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${width - pad} ${height - pad} L${pad} ${height - pad} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label="Trend sparkline"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#spark-${id})`} /> : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
