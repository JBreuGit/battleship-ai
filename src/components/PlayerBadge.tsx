"use client";

import { memo } from "react";
import { FLEET_LENGTHS } from "@/game/types";

export type PlayerId = "dutch" | "devin";

export interface PlayerTheme {
  name: string;
  /** Bright accent (gradient start). */
  from: string;
  /** Deep accent (gradient end). */
  to: string;
  text: string;
  glowClass: string;
  pulseClass: string;
}

export const PLAYERS: Record<PlayerId, PlayerTheme> = {
  dutch: {
    name: "Dutch Navy",
    from: "#ff8c00",
    to: "#ff6b00",
    text: "text-dutch-400",
    glowClass: "shadow-glow-dutch",
    pulseClass: "animate-glow-pulse-dutch",
  },
  devin: {
    name: "Devin AI",
    from: "#00d9ff",
    to: "#0ea5e9",
    text: "text-devin-400",
    glowClass: "shadow-glow-devin",
    pulseClass: "animate-glow-pulse-devin",
  },
};

/** Heraldic orange lion head — Dutch Navy crest. */
export function LionCrest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="lion-hull" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb066" />
          <stop offset="55%" stopColor="#ff8c00" />
          <stop offset="100%" stopColor="#ff6b00" />
        </linearGradient>
      </defs>
      {/* Mane: pointed heraldic flames around the head */}
      <path
        d="M24 3 L27.5 9 L33 5.5 L33.6 12.2 L40 10.5 L38.2 16.9 L44.5 17.5 L40.4 22.8 L45.5 26.5 L39.6 28.9 L42.5 34.7 L36.2 34.5 L36.8 41 L30.9 38.4 L29 45 L24 40.4 L19 45 L17.1 38.4 L11.2 41 L11.8 34.5 L5.5 34.7 L8.4 28.9 L2.5 26.5 L7.6 22.8 L3.5 17.5 L9.8 16.9 L8 10.5 L14.4 12.2 L15 5.5 L20.5 9 Z"
        fill="url(#lion-hull)"
      />
      {/* Face plate */}
      <path
        d="M24 11 C30.5 11 34.5 15.4 34.5 21.4 C34.5 25 33 27.8 30.8 29.8 L30.8 32.4 C30.8 36.4 27.9 38.8 24 38.8 C20.1 38.8 17.2 36.4 17.2 32.4 L17.2 29.8 C15 27.8 13.5 25 13.5 21.4 C13.5 15.4 17.5 11 24 11 Z"
        fill="#0a1628"
        opacity="0.92"
      />
      {/* Brow + eyes */}
      <path
        d="M17.8 19.2 L22 17.6 M30.2 19.2 L26 17.6"
        stroke="#ffb066"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="19.9" cy="21.6" r="1.7" fill="#ff8c00" />
      <circle cx="28.1" cy="21.6" r="1.7" fill="#ff8c00" />
      {/* Muzzle + nose */}
      <path
        d="M24 25.2 L21.4 28.2 L26.6 28.2 Z"
        fill="#ff8c00"
      />
      <path
        d="M24 28.4 L24 31 M24 31 C22.4 33.2 20.6 33.4 19.2 32.6 M24 31 C25.6 33.2 27.4 33.4 28.8 32.6"
        stroke="#ffb066"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Whisker frame */}
      <path
        d="M17.2 32.4 C18.6 35.6 21 36.8 24 36.8 C27 36.8 29.4 35.6 30.8 32.4"
        stroke="#ff6b00"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Original chip/neural glyph — Devin AI player icon. */
export function BotGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="bot-core" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7deeff" />
          <stop offset="60%" stopColor="#00d9ff" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      {/* Chip body */}
      <rect
        x="11"
        y="11"
        width="26"
        height="26"
        rx="7"
        fill="none"
        stroke="url(#bot-core)"
        strokeWidth="2.4"
      />
      {/* Pins */}
      <path
        d="M18 11 V5 M24 11 V5 M30 11 V5 M18 37 V43 M24 37 V43 M30 37 V43 M11 18 H5 M11 24 H5 M11 30 H5 M37 18 H43 M37 24 H43 M37 30 H43"
        stroke="#00d9ff"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Neural nodes */}
      <circle cx="24" cy="24" r="4.2" fill="url(#bot-core)" />
      <circle cx="17.5" cy="18.5" r="2" fill="#7deeff" />
      <circle cx="30.5" cy="18.5" r="2" fill="#7deeff" />
      <circle cx="17.5" cy="29.5" r="2" fill="#7deeff" />
      <circle cx="30.5" cy="29.5" r="2" fill="#7deeff" />
      {/* Links */}
      <path
        d="M19 20 L21.5 22.2 M29 20 L26.5 22.2 M19 28 L21.5 25.8 M29 28 L26.5 25.8"
        stroke="#00d9ff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ShipPipsProps {
  player: PlayerId;
  /** Number of ships destroyed (grayed out). */
  sunkCount: number;
}

/** Ships-remaining meter: one small hull icon per fleet ship. */
export const ShipPips = memo(function ShipPips({
  player,
  sunkCount,
}: ShipPipsProps) {
  const theme = PLAYERS[player];
  const remaining = FLEET_LENGTHS.length - sunkCount;
  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${theme.name}: ${remaining} of ${FLEET_LENGTHS.length} ships afloat`}
    >
      {FLEET_LENGTHS.map((len, i) => {
        const sunk = i >= remaining;
        return (
          <svg
            key={i}
            viewBox="0 0 16 12"
            className={`h-3 w-4 transition-all duration-500 ${
              sunk ? "opacity-30 grayscale" : ""
            }`}
            aria-hidden
          >
            <path
              d="M1.5 7 H14.5 L12.2 10.5 H3.8 Z"
              fill={sunk ? "#64748b" : theme.from}
            />
            <rect
              x={7 - len * 0.4}
              y="4"
              width={2 + len * 0.8}
              height="2.4"
              rx="1"
              fill={sunk ? "#64748b" : theme.to}
            />
          </svg>
        );
      })}
    </span>
  );
});
