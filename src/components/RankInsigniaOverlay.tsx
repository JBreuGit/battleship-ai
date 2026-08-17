"use client";

import { rankIndexForLevel } from "@/game/campaign";
import { AvatarPortrait } from "./PlayerAvatar";

/**
 * Layered rank insignia composited over the Dutch commander's portrait:
 * gold shoulder bars, chest ribbon rows, and cap upgrades at flag ranks.
 * The base avatar is never redrawn — everything here is an overlay in the
 * same 96×96 coordinate space as AvatarPortrait.
 */

const GOLD = "#fbbf24";
const GOLD_DEEP = "#b45309";
const RIBBON_COLORS = ["#e11d48", "#0ea5e9", "#fbbf24", "#16a34a", "#a855f7"];

export interface RankInsigniaOverlayProps {
  /** Index into RANKS (0 = Ensign … 10 = Fleet Admiral). */
  rankIndex: number;
  className?: string;
}

export function RankInsigniaOverlay({
  rankIndex,
  className,
}: RankInsigniaOverlayProps) {
  // 1-2 ranks per extra shoulder bar, capped at 5 visible bars per side.
  const bars = Math.min(5, 1 + Math.floor(rankIndex / 2));
  // One ribbon earned per rank past Ensign, laid out in rows of 3.
  const ribbons = Math.min(9, rankIndex);
  const flagOfficer = rankIndex >= 7;
  const fleetAdmiral = rankIndex >= 10;

  return (
    <svg
      viewBox="0 0 96 96"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}
      aria-hidden
    >
      {/* left + right shoulder rank bars over the epaulettes */}
      <g transform="rotate(-14 21 70)">
        <ShoulderBars bars={bars} x={14} y={66.8} />
      </g>
      <g transform="rotate(14 75 70)">
        <ShoulderBars bars={bars} x={66.5} y={66.8} />
      </g>

      {/* chest ribbon rack, above the name tape */}
      {ribbons > 0 && (
        <g>
          {Array.from({ length: ribbons }, (_, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            return (
              <rect
                key={i}
                x={54 + col * 8.4}
                y={75.5 - row * 3.4}
                width="7.4"
                height="2.6"
                rx="0.6"
                fill={RIBBON_COLORS[(i * 2 + row) % RIBBON_COLORS.length]}
                stroke="#0d1830"
                strokeWidth="0.4"
              />
            );
          })}
        </g>
      )}

      {/* flag-officer cap upgrade: gold oak-leaf arc on the visor */}
      {flagOfficer && (
        <path
          d="M37.5 30.5 C42 28.7 54 28.7 58.5 30.5"
          fill="none"
          stroke={GOLD}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2.2 1.6"
          opacity="0.95"
        />
      )}

      {/* Fleet Admiral: star above the cap badge */}
      {fleetAdmiral && (
        <path
          d={starPath(48, 12.6, 2.9)}
          fill={GOLD}
          stroke={GOLD_DEEP}
          strokeWidth="0.6"
        />
      )}
    </svg>
  );
}

function ShoulderBars({ bars, x, y }: { bars: number; x: number; y: number }) {
  return (
    <g>
      {Array.from({ length: bars }, (_, i) => (
        <rect
          key={i}
          x={x + i * 3.1}
          y={y}
          width="2"
          height="5.6"
          rx="0.7"
          fill={GOLD}
          stroke={GOLD_DEEP}
          strokeWidth="0.5"
        />
      ))}
    </g>
  );
}

function starPath(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return `M${points.join(" L")} Z`;
}

const RANKED_SIZES = {
  md: "h-11 w-11",
  lg: "h-20 w-20",
  xl: "h-24 w-24 sm:h-28 sm:w-28",
} as const;

export interface RankedAvatarBadgeProps {
  /** Campaign level whose rank insignia to composite over the portrait. */
  level: number;
  size?: keyof typeof RANKED_SIZES;
  /** Play the insignia pin-on animation (promotions). */
  pinOn?: boolean;
}

/**
 * The Dutch commander's portrait in the standard rope-ring frame, with the
 * campaign rank insignia layered on top.
 */
export function RankedAvatarBadge({
  level,
  size = "lg",
  pinOn,
}: RankedAvatarBadgeProps) {
  const rankIndex = rankIndexForLevel(level);
  return (
    <span
      className={`relative inline-block shrink-0 rounded-full ${RANKED_SIZES[size]}`}
    >
      <span className="absolute inset-0 overflow-hidden rounded-full">
        <AvatarPortrait player="dutch" />
        <span
          className={`absolute inset-0 block ${pinOn ? "animate-insignia-pin" : ""}`}
        >
          <RankInsigniaOverlay rankIndex={rankIndex} />
        </span>
      </span>
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <circle cx="50" cy="50" r="47" fill="none" stroke="#b45309" strokeWidth="5.5" />
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="#ffb066"
          strokeWidth="5.5"
          strokeDasharray="3 4.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
