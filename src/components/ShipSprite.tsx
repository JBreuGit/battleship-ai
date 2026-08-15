"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { FLEET_LENGTHS, ShipPlacement } from "@/game/types";

export type ShipVariant = "fleet" | "sunk";

/** Index into FLEET_LENGTHS: 0 carrier, 1 battleship, 2 cruiser, 3 submarine, 4 destroyer. */
export type ShipId = 0 | 1 | 2 | 3 | 4;

interface Palette {
  hull: string;
  hullEdge: string;
  deck: string;
  detail: string;
  accent: string;
}

const PALETTES: Record<ShipVariant, Palette> = {
  fleet: {
    hull: "#4d6076",
    hullEdge: "#2c3d52",
    deck: "#5d7189",
    detail: "#33455c",
    accent: "#8fa3ba",
  },
  sunk: {
    hull: "#3b2f2a",
    hullEdge: "#241c19",
    deck: "#453833",
    detail: "#2a211d",
    accent: "#b53d1f",
  },
};

function Carrier({ p }: { p: Palette }) {
  return (
    <g>
      {/* flight deck */}
      <path
        d="M14 54 L52 22 L440 14 Q488 16 490 40 L490 66 Q486 86 444 87 L60 84 Q22 80 14 54 Z"
        fill={p.hull}
        stroke={p.hullEdge}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* runway centerline */}
      <line
        x1="70"
        y1="52"
        x2="452"
        y2="48"
        stroke={p.accent}
        strokeWidth="4"
        strokeDasharray="18 14"
      />
      {/* angled landing strip */}
      <line x1="96" y1="70" x2="300" y2="30" stroke={p.deck} strokeWidth="5" />
      {/* island superstructure */}
      <rect x="308" y="60" width="86" height="18" rx="4" fill={p.detail} />
      <rect x="330" y="64" width="26" height="10" rx="2" fill={p.accent} />
      {/* deck-edge elevators */}
      <rect x="150" y="16" width="40" height="8" rx="2" fill={p.deck} />
      <rect x="360" y="12" width="40" height="8" rx="2" fill={p.deck} />
    </g>
  );
}

function Battleship({ p }: { p: Palette }) {
  return (
    <g>
      <path
        d="M8 50 C36 26 78 18 128 18 L336 18 C368 18 390 32 390 50 C390 68 368 82 336 82 L128 82 C78 82 36 74 8 50 Z"
        fill={p.hull}
        stroke={p.hullEdge}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* deck lines */}
      <path
        d="M40 50 C70 34 100 30 130 30 L330 30 M40 50 C70 66 100 70 130 70 L330 70"
        fill="none"
        stroke={p.deck}
        strokeWidth="3"
      />
      {/* fore turret with twin barrels */}
      <line x1="62" y1="42" x2="98" y2="42" stroke={p.detail} strokeWidth="5" />
      <line x1="62" y1="58" x2="98" y2="58" stroke={p.detail} strokeWidth="5" />
      <circle cx="112" cy="50" r="15" fill={p.detail} />
      {/* aft turret */}
      <line
        x1="316"
        y1="50"
        x2="352"
        y2="50"
        stroke={p.detail}
        strokeWidth="5"
      />
      <circle cx="304" cy="50" r="14" fill={p.detail} />
      {/* superstructure + funnel */}
      <rect x="160" y="34" width="96" height="32" rx="8" fill={p.detail} />
      <rect x="184" y="42" width="20" height="16" rx="3" fill={p.accent} />
      <circle cx="234" cy="50" r="7" fill={p.accent} />
    </g>
  );
}

function Cruiser({ p }: { p: Palette }) {
  return (
    <g>
      <path
        d="M6 50 C30 30 62 24 100 24 L242 24 C272 24 292 36 292 50 C292 64 272 76 242 76 L100 76 C62 76 30 70 6 50 Z"
        fill={p.hull}
        stroke={p.hullEdge}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* fore gun */}
      <line x1="48" y1="50" x2="80" y2="50" stroke={p.detail} strokeWidth="5" />
      <circle cx="92" cy="50" r="12" fill={p.detail} />
      {/* bridge */}
      <rect x="126" y="34" width="66" height="32" rx="7" fill={p.detail} />
      <rect x="142" y="42" width="16" height="14" rx="3" fill={p.accent} />
      {/* aft missile deck */}
      <rect x="216" y="40" width="44" height="20" rx="5" fill={p.deck} />
      <line
        x1="222"
        y1="50"
        x2="254"
        y2="50"
        stroke={p.detail}
        strokeWidth="4"
      />
    </g>
  );
}

function Submarine({ p }: { p: Palette }) {
  return (
    <g>
      <path
        d="M12 50 C12 36 58 28 150 28 C242 28 288 38 288 50 C288 62 242 72 150 72 C58 72 12 64 12 50 Z"
        fill={p.hullEdge}
        stroke={p.detail}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* deck line */}
      <line x1="40" y1="50" x2="260" y2="50" stroke={p.hull} strokeWidth="6" />
      {/* sail */}
      <rect x="128" y="34" width="46" height="32" rx="12" fill={p.detail} />
      <circle cx="151" cy="50" r="6" fill={p.accent} />
      {/* bow planes */}
      <line x1="52" y1="34" x2="52" y2="66" stroke={p.detail} strokeWidth="5" />
      {/* stern rudder */}
      <line
        x1="266"
        y1="38"
        x2="266"
        y2="62"
        stroke={p.detail}
        strokeWidth="5"
      />
    </g>
  );
}

function Destroyer({ p }: { p: Palette }) {
  return (
    <g>
      <path
        d="M6 50 C24 32 48 26 82 26 L152 26 C176 26 192 38 192 50 C192 62 176 74 152 74 L82 74 C48 74 24 68 6 50 Z"
        fill={p.hull}
        stroke={p.hullEdge}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      {/* fore gun */}
      <line x1="34" y1="50" x2="58" y2="50" stroke={p.detail} strokeWidth="4" />
      <circle cx="66" cy="50" r="9" fill={p.detail} />
      {/* bridge */}
      <rect x="92" y="36" width="48" height="28" rx="6" fill={p.detail} />
      <rect x="104" y="43" width="13" height="12" rx="3" fill={p.accent} />
      {/* aft gun mount */}
      <circle cx="162" cy="50" r="7" fill={p.deck} />
    </g>
  );
}

const HULLS = [Carrier, Battleship, Cruiser, Submarine, Destroyer] as const;

export interface ShipSpriteProps {
  shipId: ShipId;
  variant?: ShipVariant;
}

/** Top-down warship silhouette; horizontal, drawn in a length×1-cell box. */
export function ShipSprite({ shipId, variant = "fleet" }: ShipSpriteProps) {
  const Hull = HULLS[shipId];
  const length = FLEET_LENGTHS[shipId];
  return (
    <svg
      viewBox={`0 0 ${length * 100} 100`}
      className="h-full w-full"
      aria-hidden
    >
      <Hull p={PALETTES[variant]} />
    </svg>
  );
}

export interface ShipOverlayProps {
  shipId: ShipId;
  placement: ShipPlacement;
  variant?: ShipVariant;
  className?: string;
  style?: CSSProperties;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/** Positions a ShipSprite over a 10x10 board (percent-based; rotates for vertical). */
export function ShipOverlay({
  shipId,
  placement,
  variant = "fleet",
  className = "",
  style,
  onPointerDown,
}: ShipOverlayProps) {
  const { bow, length, orientation } = placement;
  const horizontal = orientation === "horizontal";
  return (
    <div
      className={`absolute ${className}`}
      style={{
        left: `${bow.x * 10}%`,
        top: `${bow.y * 10}%`,
        width: horizontal ? `${length * 10}%` : "10%",
        height: horizontal ? "10%" : `${length * 10}%`,
        ...style,
      }}
      onPointerDown={onPointerDown}
    >
      <div
        className="h-full w-full"
        style={{
          width: horizontal ? "100%" : `${length * 100}%`,
          height: horizontal ? "100%" : `${100 / length}%`,
          transformOrigin: "top left",
          transform: horizontal ? undefined : "rotate(90deg) translateY(-100%)",
        }}
      >
        <ShipSprite shipId={shipId} variant={variant} />
      </div>
    </div>
  );
}
