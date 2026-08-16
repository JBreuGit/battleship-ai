"use client";

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useId,
} from "react";
import { FLEET_LENGTHS, ShipPlacement } from "@/game/types";
import { LionCrest, PlayerId } from "./PlayerBadge";

export type ShipVariant = "fleet" | "sunk";

/** Index into FLEET_LENGTHS: 0 carrier, 1 battleship, 2 cruiser, 3 submarine, 4 destroyer. */
export type ShipId = 0 | 1 | 2 | 3 | 4;

interface Palette {
  /** Fill for the main hull (gradient url or flat color). */
  hullFill: string;
  hullEdge: string;
  deck: string;
  detail: string;
  accent: string;
  /** Player trim color re-stroked along the hull outline. */
  trim: string;
}

interface Skin {
  /** Hull gradient stops, light from top-left. */
  stops: [string, string, string];
  hullEdge: string;
  deck: string;
  detail: string;
  accent: string;
  trim: string;
}

const SKINS: Record<PlayerId | "sunk", Skin> = {
  dutch: {
    stops: ["#b7c3d3", "#64748b", "#3f4c60"],
    hullEdge: "#2c3a4e",
    deck: "#94a3b8",
    detail: "#334155",
    accent: "#ffb066",
    trim: "#ff8c00",
  },
  devin: {
    stops: ["#3d4f6b", "#1e293b", "#0b1424"],
    hullEdge: "#060d19",
    deck: "#3b4f6e",
    detail: "#42597a",
    accent: "#7deeff",
    trim: "#00d9ff",
  },
  sunk: {
    stops: ["#5a453d", "#44302c", "#291c19"],
    hullEdge: "#1e1310",
    deck: "#544039",
    detail: "#33241f",
    accent: "#e11d48",
    trim: "#7f1d2d",
  },
};

/** Main hull shape with player-colored trim line along the outline. */
function HullBase({ d, p }: { d: string; p: Palette }) {
  return (
    <>
      <path
        d={d}
        fill={p.hullFill}
        stroke={p.hullEdge}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={p.trim}
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </>
  );
}

/** Glowing circuit traces for the AI fleet, spanning a hull `w` wide. */
function CircuitLines({ w, trim }: { w: number; trim: string }) {
  return (
    <g opacity="0.9">
      <path
        d={`M ${0.13 * w} 60 L ${0.28 * w} 60 L ${0.34 * w} 42 L ${0.56 * w} 42 L ${0.62 * w} 61 L ${0.84 * w} 61`}
        fill="none"
        stroke={trim}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx={0.13 * w} cy="60" r="3.5" fill={trim} />
      <circle cx={0.45 * w} cy="42" r="3.5" fill={trim} />
      <circle cx={0.84 * w} cy="61" r="3.5" fill={trim} />
    </g>
  );
}

/** Small Dutch Navy lion roundel for the flagship's deck. */
function LionDecal({ x, y, size }: { x: number; y: number; size: number }) {
  const pad = size * 0.12;
  return (
    <g>
      <circle
        cx={x + size / 2}
        cy={y + size / 2}
        r={size / 2 + pad}
        fill="#0a1628"
        stroke="#ff8c00"
        strokeWidth="2.5"
      />
      <svg x={x} y={y} width={size} height={size}>
        <LionCrest />
      </svg>
    </g>
  );
}

function Carrier({ p }: { p: Palette }) {
  return (
    <g>
      {/* flight deck */}
      <HullBase
        d="M14 54 L52 22 L440 14 Q488 16 490 40 L490 66 Q486 86 444 87 L60 84 Q22 80 14 54 Z"
        p={p}
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
      {/* deck-edge railings */}
      <line
        x1="80"
        y1="22"
        x2="430"
        y2="17"
        stroke={p.deck}
        strokeWidth="2"
        strokeDasharray="8 8"
        opacity="0.7"
      />
      {/* island superstructure */}
      <rect x="308" y="60" width="86" height="18" rx="4" fill={p.detail} />
      <rect x="330" y="64" width="26" height="10" rx="2" fill={p.accent} />
      {/* deck-edge elevators */}
      <rect x="150" y="16" width="40" height="8" rx="2" fill={p.deck} />
      <rect x="360" y="12" width="40" height="8" rx="2" fill={p.deck} />
      {/* deck hatches */}
      <rect x="120" y="60" width="14" height="9" rx="2" fill={p.detail} />
      <rect x="420" y="56" width="14" height="9" rx="2" fill={p.detail} />
    </g>
  );
}

function Battleship({ p }: { p: Palette }) {
  return (
    <g>
      <HullBase
        d="M8 50 C36 26 78 18 128 18 L336 18 C368 18 390 32 390 50 C390 68 368 82 336 82 L128 82 C78 82 36 74 8 50 Z"
        p={p}
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
      {/* deck hatches */}
      <rect x="136" y="44" width="12" height="12" rx="3" fill={p.deck} />
      <rect x="268" y="44" width="12" height="12" rx="3" fill={p.deck} />
    </g>
  );
}

function Cruiser({ p }: { p: Palette }) {
  return (
    <g>
      <HullBase
        d="M6 50 C30 30 62 24 100 24 L242 24 C272 24 292 36 292 50 C292 64 272 76 242 76 L100 76 C62 76 30 70 6 50 Z"
        p={p}
      />
      {/* deck railing */}
      <path
        d="M42 36 C70 30 90 29 110 29 L236 29"
        fill="none"
        stroke={p.deck}
        strokeWidth="2"
        strokeDasharray="7 7"
        opacity="0.7"
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
      <HullBase
        d="M12 50 C12 36 58 28 150 28 C242 28 288 38 288 50 C288 62 242 72 150 72 C58 72 12 64 12 50 Z"
        p={p}
      />
      {/* deck line */}
      <line x1="40" y1="50" x2="260" y2="50" stroke={p.deck} strokeWidth="6" />
      {/* sail with periscope */}
      <rect x="128" y="34" width="46" height="32" rx="12" fill={p.detail} />
      <circle cx="151" cy="50" r="6" fill={p.accent} />
      <line
        x1="164"
        y1="50"
        x2="176"
        y2="50"
        stroke={p.accent}
        strokeWidth="3"
        strokeLinecap="round"
      />
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
      {/* hull hatches */}
      <circle cx="92" cy="50" r="4" fill={p.detail} />
      <circle cx="216" cy="50" r="4" fill={p.detail} />
    </g>
  );
}

function Destroyer({ p }: { p: Palette }) {
  return (
    <g>
      <HullBase
        d="M6 50 C24 32 48 26 82 26 L152 26 C176 26 192 38 192 50 C192 62 176 74 152 74 L82 74 C48 74 24 68 6 50 Z"
        p={p}
      />
      {/* fore gun */}
      <line x1="34" y1="50" x2="58" y2="50" stroke={p.detail} strokeWidth="4" />
      <circle cx="66" cy="50" r="9" fill={p.detail} />
      {/* bridge */}
      <rect x="92" y="36" width="48" height="28" rx="6" fill={p.detail} />
      <rect x="104" y="43" width="13" height="12" rx="3" fill={p.accent} />
      {/* aft gun mount */}
      <circle cx="162" cy="50" r="7" fill={p.deck} />
      {/* bow wave guard */}
      <path
        d="M20 42 C28 36 36 33 46 31"
        fill="none"
        stroke={p.deck}
        strokeWidth="2.5"
        opacity="0.7"
      />
    </g>
  );
}

const HULLS = [Carrier, Battleship, Cruiser, Submarine, Destroyer] as const;

export interface ShipSpriteProps {
  shipId: ShipId;
  variant?: ShipVariant;
  /** Whose skin to draw: Dutch Navy orange-and-steel or Devin AI dark circuit hulls. */
  player?: PlayerId;
}

/** Top-down warship silhouette; horizontal, drawn in a length×1-cell box. */
export function ShipSprite({
  shipId,
  variant = "fleet",
  player = "dutch",
}: ShipSpriteProps) {
  const rawId = useId();
  const gradId = `hull-${rawId.replace(/[^a-zA-Z0-9-]/g, "")}`;
  const Hull = HULLS[shipId];
  const length = FLEET_LENGTHS[shipId];
  const width = length * 100;
  const skin = SKINS[variant === "sunk" ? "sunk" : player];
  const p: Palette = {
    hullFill: `url(#${gradId})`,
    hullEdge: skin.hullEdge,
    deck: skin.deck,
    detail: skin.detail,
    accent: skin.accent,
    trim: skin.trim,
  };
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      className="h-full w-full"
      style={
        variant === "fleet"
          ? { filter: "drop-shadow(0 3px 3px rgba(4, 10, 22, 0.5))" }
          : undefined
      }
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stopColor={skin.stops[0]} />
          <stop offset="50%" stopColor={skin.stops[1]} />
          <stop offset="100%" stopColor={skin.stops[2]} />
        </linearGradient>
      </defs>
      <Hull p={p} />
      {variant === "fleet" && player === "devin" && (
        <CircuitLines w={width} trim={skin.trim} />
      )}
      {variant === "fleet" && player === "dutch" && shipId === 0 && (
        <LionDecal x={216} y={30} size={40} />
      )}
    </svg>
  );
}

export interface ShipOverlayProps {
  shipId: ShipId;
  placement: ShipPlacement;
  variant?: ShipVariant;
  player?: PlayerId;
  className?: string;
  style?: CSSProperties;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

/** Positions a ShipSprite over a 10x10 board (percent-based; rotates for vertical). */
export function ShipOverlay({
  shipId,
  placement,
  variant = "fleet",
  player = "dutch",
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
        <ShipSprite shipId={shipId} variant={variant} player={player} />
      </div>
    </div>
  );
}
