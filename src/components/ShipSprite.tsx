"use client";

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useId,
} from "react";
import { FLEET_LENGTHS, ShipPlacement } from "@/game/types";
import { BotGlyph, LionCrest, PlayerId } from "./PlayerBadge";

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

/** Soft white foam line where the hull meets the water. */
function WaterlineFoam({ d }: { d: string }) {
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke="#dff3ff"
        strokeWidth="14"
        strokeLinejoin="round"
        opacity="0.13"
      />
      <path
        d={d}
        fill="none"
        stroke="#eefaff"
        strokeWidth="8"
        strokeLinejoin="round"
        opacity="0.16"
      />
    </>
  );
}

/** Foam chevrons curling around the bow (implies forward way on). */
function BowWake() {
  return (
    <g fill="none" stroke="#e8f7ff" strokeLinecap="round" aria-hidden>
      <path d="M9 33 Q1 50 9 67" strokeWidth="3" opacity="0.5" />
      <path d="M17 27 Q4 50 17 73" strokeWidth="2" opacity="0.32" />
    </g>
  );
}

/** Faint wake trail streaming aft of the stern. */
function WakeTrail({ w }: { w: number }) {
  return (
    <g stroke="#dff3ff" strokeLinecap="round" aria-hidden>
      <line x1={w - 9} y1="41" x2={w - 1} y2="38" strokeWidth="2.5" opacity="0.3" />
      <line x1={w - 7} y1="51" x2={w - 1} y2="51" strokeWidth="2.5" opacity="0.38" />
      <line x1={w - 9} y1="61" x2={w - 1} y2="64" strokeWidth="2.5" opacity="0.3" />
    </g>
  );
}

/** Steel-plating seams: slanted panel joints plus two long weld lines. */
function PanelSeams({ w, edge }: { w: number; edge: string }) {
  const seams: number[] = [];
  for (let x = 58; x < w - 34; x += 56) seams.push(x);
  return (
    <g stroke={edge} strokeWidth="1.3">
      {seams.map((x) => (
        <line key={x} x1={x} y1="14" x2={x - 7} y2="88" opacity="0.32" />
      ))}
      <line x1="16" y1="37" x2={w - 14} y2="36" strokeWidth="1" opacity="0.22" />
      <line x1="16" y1="65" x2={w - 14} y2="66" strokeWidth="1" opacity="0.22" />
    </g>
  );
}

/** Team color stripe running the length of the lower hull. */
function TeamStripe({ w, trim }: { w: number; trim: string }) {
  return (
    <g>
      <rect x="0" y="72" width={w} height="5" fill={trim} opacity="0.65" />
      <rect x="0" y="79" width={w} height="1.8" fill={trim} opacity="0.3" />
    </g>
  );
}

/** Anchor eye and chain run at the bow. */
function AnchorChain({ deck }: { deck: string }) {
  return (
    <g stroke={deck} fill="none" strokeLinecap="round">
      <circle cx="27" cy="45" r="3" strokeWidth="1.8" />
      <line
        x1="31"
        y1="45"
        x2="58"
        y2="43"
        strokeWidth="2"
        strokeDasharray="3 4"
      />
    </g>
  );
}

/** Small rotating-antenna mast: crossed yards with a bright emitter. */
function RadarMast({
  x,
  y,
  p,
}: {
  x: number;
  y: number;
  p: Palette;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y - 8}
        x2={x}
        y2={y + 8}
        stroke={p.deck}
        strokeWidth="2"
      />
      <line
        x1={x - 7}
        y1={y}
        x2={x + 7}
        y2={y}
        stroke={p.deck}
        strokeWidth="2"
      />
      <circle cx={x} cy={y} r="2.6" fill={p.accent} />
    </g>
  );
}

/** Pair of small deck vents. */
function Vents({ x, y, deck }: { x: number; y: number; deck: string }) {
  return (
    <g fill={deck}>
      <rect x={x} y={y} width="9" height="5" rx="1.5" />
      <rect x={x + 13} y={y} width="9" height="5" rx="1.5" />
    </g>
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

/** Small team crest roundel painted near the bow. */
function CrestDecal({
  cx,
  cy,
  size,
  player,
}: {
  cx: number;
  cy: number;
  size: number;
  player: PlayerId;
}) {
  const r = size / 2;
  return (
    <g opacity="0.95">
      <circle
        cx={cx}
        cy={cy}
        r={r + size * 0.14}
        fill="#0a1628"
        stroke={player === "dutch" ? "#ff8c00" : "#00d9ff"}
        strokeWidth="1.8"
      />
      <svg x={cx - r} y={cy - r} width={size} height={size}>
        {player === "dutch" ? <LionCrest /> : <BotGlyph />}
      </svg>
    </g>
  );
}

/** Burnt hull scorch at a hit segment: charred blotch, cracks, ember glow. */
function Scorch({ cx, gradId }: { cx: number; gradId: string }) {
  return (
    <g>
      <ellipse cx={cx} cy="50" rx="37" ry="28" fill={`url(#${gradId})`} />
      <path
        d={`M${cx - 19} 41 L${cx - 5} 51 L${cx - 13} 62 M${cx + 6} 36 L${cx + 11} 50 L${cx + 21} 59`}
        stroke="#120a08"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.7"
      />
      <circle cx={cx} cy="50" r="5" fill="#f97316" opacity="0.35" />
      <circle cx={cx + 9} cy="45" r="2.5" fill="#fdba74" opacity="0.3" />
    </g>
  );
}

const CARRIER_D =
  "M14 54 L52 22 L440 14 Q488 16 490 40 L490 66 Q486 86 444 87 L60 84 Q22 80 14 54 Z";

function Carrier({ p }: { p: Palette }) {
  return (
    <g>
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
      {/* catapult tracks at the bow */}
      <line x1="66" y1="41" x2="158" y2="38" stroke={p.deck} strokeWidth="2" />
      <line x1="70" y1="61" x2="162" y2="59" stroke={p.deck} strokeWidth="2" />
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
      <line
        x1="86"
        y1="80"
        x2="300"
        y2="82"
        stroke={p.deck}
        strokeWidth="2"
        strokeDasharray="8 8"
        opacity="0.5"
      />
      {/* arresting wires across the aft deck */}
      <g stroke={p.detail} strokeWidth="1.5" opacity="0.8">
        <line x1="414" y1="24" x2="410" y2="76" />
        <line x1="428" y1="24" x2="424" y2="76" />
        <line x1="442" y1="26" x2="438" y2="74" />
      </g>
      {/* island superstructure */}
      <rect x="308" y="60" width="86" height="18" rx="4" fill={p.detail} />
      <rect x="330" y="64" width="26" height="10" rx="2" fill={p.accent} />
      <RadarMast x={378} y={69} p={p} />
      {/* deck-edge elevators */}
      <rect x="150" y="16" width="40" height="8" rx="2" fill={p.deck} />
      <rect x="360" y="12" width="40" height="8" rx="2" fill={p.deck} />
      {/* parked aircraft */}
      <path d="M330 26 l17 6 l-17 6 l5 -6 Z" fill={p.deck} />
      <path d="M356 24 l17 6 l-17 6 l5 -6 Z" fill={p.deck} opacity="0.85" />
      {/* deck hatches */}
      <rect x="120" y="60" width="14" height="9" rx="2" fill={p.detail} />
      <rect x="420" y="56" width="14" height="9" rx="2" fill={p.detail} />
      <AnchorChain deck={p.deck} />
    </g>
  );
}

const BATTLESHIP_D =
  "M8 50 C36 26 78 18 128 18 L336 18 C368 18 390 32 390 50 C390 68 368 82 336 82 L128 82 C78 82 36 74 8 50 Z";

function Battleship({ p }: { p: Palette }) {
  return (
    <g>
      {/* deck lines */}
      <path
        d="M40 50 C70 34 100 30 130 30 L330 30 M40 50 C70 66 100 70 130 70 L330 70"
        fill="none"
        stroke={p.deck}
        strokeWidth="3"
      />
      {/* deck railings */}
      <line
        x1="70"
        y1="25"
        x2="330"
        y2="24"
        stroke={p.deck}
        strokeWidth="1.8"
        strokeDasharray="7 7"
        opacity="0.6"
      />
      <line
        x1="70"
        y1="75"
        x2="330"
        y2="76"
        stroke={p.deck}
        strokeWidth="1.8"
        strokeDasharray="7 7"
        opacity="0.6"
      />
      {/* fore turret with twin barrels on its barbette ring */}
      <circle
        cx="112"
        cy="50"
        r="19"
        fill="none"
        stroke={p.deck}
        strokeWidth="1.6"
        opacity="0.8"
      />
      <line x1="62" y1="42" x2="98" y2="42" stroke={p.detail} strokeWidth="5" />
      <line x1="62" y1="58" x2="98" y2="58" stroke={p.detail} strokeWidth="5" />
      <circle cx="112" cy="50" r="15" fill={p.detail} />
      {/* aft turret */}
      <circle
        cx="304"
        cy="50"
        r="18"
        fill="none"
        stroke={p.deck}
        strokeWidth="1.6"
        opacity="0.8"
      />
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
      <RadarMast x={170} y={50} p={p} />
      <Vents x={262} y={58} deck={p.deck} />
      {/* deck hatches */}
      <rect x="136" y="44" width="12" height="12" rx="3" fill={p.deck} />
      <rect x="268" y="44" width="12" height="12" rx="3" fill={p.deck} />
      <AnchorChain deck={p.deck} />
    </g>
  );
}

const CRUISER_D =
  "M6 50 C30 30 62 24 100 24 L242 24 C272 24 292 36 292 50 C292 64 272 76 242 76 L100 76 C62 76 30 70 6 50 Z";

function Cruiser({ p }: { p: Palette }) {
  return (
    <g>
      {/* deck railings */}
      <path
        d="M42 36 C70 30 90 29 110 29 L236 29"
        fill="none"
        stroke={p.deck}
        strokeWidth="2"
        strokeDasharray="7 7"
        opacity="0.7"
      />
      <path
        d="M42 64 C70 70 90 71 110 71 L236 71"
        fill="none"
        stroke={p.deck}
        strokeWidth="2"
        strokeDasharray="7 7"
        opacity="0.5"
      />
      {/* fore gun on its base ring */}
      <circle
        cx="92"
        cy="50"
        r="15"
        fill="none"
        stroke={p.deck}
        strokeWidth="1.5"
        opacity="0.8"
      />
      <line x1="48" y1="50" x2="80" y2="50" stroke={p.detail} strokeWidth="5" />
      <circle cx="92" cy="50" r="12" fill={p.detail} />
      {/* bridge */}
      <rect x="126" y="34" width="66" height="32" rx="7" fill={p.detail} />
      <rect x="142" y="42" width="16" height="14" rx="3" fill={p.accent} />
      <RadarMast x={178} y={50} p={p} />
      {/* aft helipad */}
      <rect x="216" y="38" width="46" height="24" rx="6" fill={p.deck} />
      <circle
        cx="239"
        cy="50"
        r="9.5"
        fill="none"
        stroke={p.detail}
        strokeWidth="1.8"
      />
      <line
        x1="235"
        y1="50"
        x2="243"
        y2="50"
        stroke={p.detail}
        strokeWidth="2.4"
      />
      <AnchorChain deck={p.deck} />
    </g>
  );
}

const SUBMARINE_D =
  "M12 50 C12 36 58 28 150 28 C242 28 288 38 288 50 C288 62 242 72 150 72 C58 72 12 64 12 50 Z";

function Submarine({ p }: { p: Palette }) {
  return (
    <g>
      {/* deck line */}
      <line x1="40" y1="50" x2="260" y2="50" stroke={p.deck} strokeWidth="6" />
      {/* limber-hole vents along the casing */}
      <g fill={p.detail} opacity="0.85">
        {[64, 88, 112, 190, 214, 238].map((x) => (
          <rect key={x} x={x} y="38" width="9" height="3" rx="1.5" />
        ))}
      </g>
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
      {/* stern rudder + prop wash */}
      <line
        x1="266"
        y1="38"
        x2="266"
        y2="62"
        stroke={p.detail}
        strokeWidth="5"
      />
      <path
        d="M274 44 q6 6 0 12"
        fill="none"
        stroke={p.deck}
        strokeWidth="2"
        opacity="0.7"
      />
      {/* hull hatches */}
      <circle cx="92" cy="50" r="4" fill={p.detail} />
      <circle cx="216" cy="50" r="4" fill={p.detail} />
    </g>
  );
}

const DESTROYER_D =
  "M6 50 C24 32 48 26 82 26 L152 26 C176 26 192 38 192 50 C192 62 176 74 152 74 L82 74 C48 74 24 68 6 50 Z";

function Destroyer({ p }: { p: Palette }) {
  return (
    <g>
      {/* fore gun */}
      <line x1="34" y1="50" x2="58" y2="50" stroke={p.detail} strokeWidth="4" />
      <circle cx="66" cy="50" r="9" fill={p.detail} />
      {/* bridge */}
      <rect x="92" y="36" width="48" height="28" rx="6" fill={p.detail} />
      <rect x="104" y="43" width="13" height="12" rx="3" fill={p.accent} />
      <RadarMast x={130} y={50} p={p} />
      {/* funnel */}
      <circle cx="152" cy="42" r="5" fill={p.detail} />
      <circle cx="152" cy="42" r="2" fill={p.accent} />
      {/* aft gun mount + depth-charge racks */}
      <circle cx="162" cy="56" r="6" fill={p.deck} />
      <rect x="172" y="44" width="12" height="5" rx="1.5" fill={p.deck} />
      <rect x="172" y="52" width="12" height="5" rx="1.5" fill={p.deck} />
      {/* bow wave guard */}
      <path
        d="M20 42 C28 36 36 33 46 31"
        fill="none"
        stroke={p.deck}
        strokeWidth="2.5"
        opacity="0.7"
      />
      <AnchorChain deck={p.deck} />
    </g>
  );
}

const HULLS: { d: string; Details: (props: { p: Palette }) => ReactNode }[] = [
  { d: CARRIER_D, Details: Carrier },
  { d: BATTLESHIP_D, Details: Battleship },
  { d: CRUISER_D, Details: Cruiser },
  { d: SUBMARINE_D, Details: Submarine },
  { d: DESTROYER_D, Details: Destroyer },
];

/** Bow crest roundel placement per ship class (null = hull too small). */
const CREST_POS: ({ cx: number; cy: number; size: number } | null)[] = [
  { cx: 96, cy: 66, size: 20 },
  { cx: 40, cy: 50, size: 17 },
  { cx: 28, cy: 50, size: 15 },
  null,
  null,
];

export interface ShipSpriteProps {
  shipId: ShipId;
  variant?: ShipVariant;
  /** Whose skin to draw: Dutch Navy orange-and-steel or Devin AI dark circuit hulls. */
  player?: PlayerId;
  /** Damaged segments (0-based indices along the ship's length) to scorch. */
  hits?: number[];
}

/** Top-down warship silhouette; horizontal, drawn in a length×1-cell box. */
export function ShipSprite({
  shipId,
  variant = "fleet",
  player = "dutch",
  hits,
}: ShipSpriteProps) {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9-]/g, "");
  const gradId = `hull-${safeId}`;
  const clipId = `clip-${safeId}`;
  const scorchId = `scorch-${safeId}`;
  const { d, Details } = HULLS[shipId];
  const length = FLEET_LENGTHS[shipId];
  const width = length * 100;
  const sunk = variant === "sunk";
  const skin = SKINS[sunk ? "sunk" : player];
  const p: Palette = {
    hullFill: `url(#${gradId})`,
    hullEdge: skin.hullEdge,
    deck: skin.deck,
    detail: skin.detail,
    accent: skin.accent,
    trim: skin.trim,
  };
  const scorched =
    hits ??
    (sunk
      ? Array.from({ length: Math.ceil(length / 2) }, (_, i) => i * 2)
      : []);
  const crest = CREST_POS[shipId];
  return (
    <svg
      viewBox={`0 0 ${width} 100`}
      className="h-full w-full"
      style={
        sunk
          ? undefined
          : { filter: "drop-shadow(0 3px 3px rgba(4, 10, 22, 0.5))" }
      }
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stopColor={skin.stops[0]} />
          <stop offset="50%" stopColor={skin.stops[1]} />
          <stop offset="100%" stopColor={skin.stops[2]} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={d} />
        </clipPath>
        {scorched.length > 0 && (
          <radialGradient id={scorchId}>
            <stop offset="0%" stopColor="#0c0705" stopOpacity="0.92" />
            <stop offset="55%" stopColor="#140c08" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#140c08" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      {!sunk && <WaterlineFoam d={d} />}
      {!sunk && (
        <>
          <BowWake />
          <WakeTrail w={width} />
        </>
      )}
      <HullBase d={d} p={p} />
      <g clipPath={`url(#${clipId})`}>
        <PanelSeams w={width} edge={skin.hullEdge} />
        <TeamStripe w={width} trim={skin.trim} />
      </g>
      <Details p={p} />
      {!sunk && player === "devin" && (
        <CircuitLines w={width} trim={skin.trim} />
      )}
      {!sunk && player === "dutch" && shipId === 0 && (
        <LionDecal x={216} y={30} size={40} />
      )}
      {!sunk && crest && (
        <CrestDecal cx={crest.cx} cy={crest.cy} size={crest.size} player={player} />
      )}
      {scorched.length > 0 && (
        <g clipPath={`url(#${clipId})`}>
          {scorched.map((i) => (
            <Scorch key={i} cx={(i + 0.5) * 100} gradId={scorchId} />
          ))}
        </g>
      )}
    </svg>
  );
}

export interface ShipOverlayProps {
  shipId: ShipId;
  placement: ShipPlacement;
  variant?: ShipVariant;
  player?: PlayerId;
  hits?: number[];
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
  hits,
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
        <ShipSprite
          shipId={shipId}
          variant={variant}
          player={player}
          hits={hits}
        />
      </div>
    </div>
  );
}
