import type { SVGProps } from "react";

export type IconName =
  | "grid"
  | "layers"
  | "cpu"
  | "activity"
  | "sliders"
  | "plus"
  | "arrow-up-right"
  | "arrow-down-right"
  | "arrow-right"
  | "x"
  | "check"
  | "clock"
  | "database"
  | "zap"
  | "refresh"
  | "chevron-down"
  | "copy"
  | "terminal"
  | "shield"
  | "sparkles"
  | "wallet"
  | "external"
  | "search";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };

  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.6" />
          <rect x="14" y="3" width="7" height="7" rx="1.6" />
          <rect x="3" y="14" width="7" height="7" rx="1.6" />
          <rect x="14" y="14" width="7" height="7" rx="1.6" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
          <path d="m3 12 9 4.5 9-4.5" />
          <path d="m3 16.5 9 4.5 9-4.5" />
        </svg>
      );
    case "cpu":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path d="M3 12h4l2.5-7 4.5 14 3-7h4" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...common}>
          <path d="M4 6h10M18 6h2M4 12h3M11 12h9M4 18h8M16 18h4" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" />
          <circle cx="14" cy="18" r="2" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "arrow-up-right":
      return (
        <svg {...common}>
          <path d="M7 17 17 7M8 7h9v9" />
        </svg>
      );
    case "arrow-down-right":
      return (
        <svg {...common}>
          <path d="m7 7 10 10M17 8v9H8" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m4 12.5 5 5L20 6.5" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.2 2" />
        </svg>
      );
    case "database":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="5.5" rx="8" ry="3" />
          <path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
          <path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      );
    case "zap":
      return (
        <svg {...common}>
          <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-1.6 5.7" />
          <path d="M20 4v7h-7" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M15 5H6a2 2 0 0 0-2 2v9" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="m7 9 3 3-3 3M13 15h4" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />
          <path d="m9.5 12 1.8 1.8 3.4-3.6" />
        </svg>
      );
    case "sparkles":
      return (
        <svg {...common}>
          <path d="M12 3.5 13.7 9l5.3 1.8L13.7 13 12 18.5 10.3 13 5 11.2 10.3 9 12 3.5Z" />
          <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <path d="M3 10h18M16 14.5h1.5" />
          <path d="M6 6V5a2 2 0 0 1 2.4-2l9 2" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9" />
          <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4 4" />
        </svg>
      );
    default:
      return null;
  }
}
