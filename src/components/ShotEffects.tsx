import { CSSProperties } from "react";
import { Coordinate, ShipPlacement } from "@/game/types";
import { PLAYERS, PlayerId } from "./PlayerBadge";
import { ShipId } from "./ShipSprite";

export const SHIP_NAMES = [
  "Carrier",
  "Battleship",
  "Cruiser",
  "Submarine",
  "Destroyer",
] as const;

/** Board-space rect for one cell of a 10x10 grid, in percent units. */
function cellRect(cell: Coordinate): CSSProperties {
  return {
    left: `${cell.x * 10}%`,
    top: `${cell.y * 10}%`,
    width: "10%",
    height: "10%",
  };
}

const DEBRIS: { dx: string; dy: string; delay: string }[] = [
  { dx: "-14px", dy: "10px", delay: "0s" },
  { dx: "12px", dy: "12px", delay: "0.03s" },
  { dx: "-7px", dy: "15px", delay: "0.06s" },
  { dx: "16px", dy: "7px", delay: "0.02s" },
  { dx: "4px", dy: "16px", delay: "0.08s" },
];

const SMOKE: { x: string; scale: number; delay: string }[] = [
  { x: "28%", scale: 0.9, delay: "0.12s" },
  { x: "50%", scale: 1.2, delay: "0.2s" },
  { x: "66%", scale: 0.8, delay: "0.3s" },
];

/**
 * Layered hit explosion: white-orange core flash, rising smoke puffs,
 * arcing debris specks, and a red vignette pulse around the cell.
 */
export function ExplosionEffect({ delay }: { delay?: string }) {
  const style = delay ? { animationDelay: delay } : undefined;
  return (
    <span
      className="pointer-events-none absolute inset-0 z-30 overflow-visible"
      aria-hidden
    >
      <span className="animate-explosion-flash absolute inset-[6%] rounded-full bg-[radial-gradient(circle,#fff7ed_0%,#fdba74_35%,#f97316_60%,rgba(249,115,22,0)_75%)]" style={style} />
      <span className="animate-vignette-pulse absolute -inset-1 rounded-lg" style={style} />
      <span className="animate-hit-ripple absolute -inset-[110%] rounded-full border border-lagoon-300/50" style={style} />
      <span className="animate-hit-ripple absolute -inset-[110%] rounded-full border border-foam-200/40" style={delay ? { animationDelay: `calc(${delay} + 0.15s)` } : { animationDelay: "0.15s" }} />
      {SMOKE.map((s, i) => (
        <span
          key={`smoke-${i}`}
          className="animate-smoke-puff absolute bottom-[30%] h-[45%] w-[45%] rounded-full bg-[radial-gradient(circle,rgba(120,120,125,0.75)_0%,rgba(55,58,64,0.5)_55%,rgba(30,32,38,0)_78%)]"
          style={{
            left: s.x,
            marginLeft: "-22%",
            scale: String(s.scale),
            animationDelay: delay
              ? `calc(${delay} + ${s.delay})`
              : s.delay,
          }}
        />
      ))}
      {DEBRIS.map((d, i) => (
        <span
          key={`debris-${i}`}
          className="animate-debris-arc absolute left-1/2 top-1/2 h-[7%] w-[7%] rounded-[1px] bg-navy-950"
          style={
            {
              "--dx": d.dx,
              "--dy": d.dy,
              animationDelay: delay ? `calc(${delay} + ${d.delay})` : d.delay,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

const RIPPLES = ["0s", "0.12s", "0.26s"];
const DROPLETS: { dx: string; delay: string }[] = [
  { dx: "-9px", delay: "0s" },
  { dx: "-3px", delay: "0.05s" },
  { dx: "5px", delay: "0.03s" },
  { dx: "11px", delay: "0.07s" },
];

/**
 * Miss splash: staggered concentric ripple rings, small droplets arcing up
 * and falling back, and a brief brightening of the water tile.
 */
export function SplashEffect() {
  return (
    <span
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      aria-hidden
    >
      <span className="animate-tile-brighten absolute inset-0 rounded-md bg-foam-100/60" />
      {RIPPLES.map((delay, i) => (
        <span
          key={`ring-${i}`}
          className="animate-splash-ring absolute inset-0 rounded-full border-2 border-foam-200/80"
          style={{ animationDelay: delay }}
        />
      ))}
      {DROPLETS.map((d, i) => (
        <span
          key={`drop-${i}`}
          className="animate-droplet absolute left-1/2 top-1/2 h-[9%] w-[9%] rounded-full bg-foam-100/90"
          style={
            { "--dx": d.dx, animationDelay: d.delay } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/**
 * Staggered explosion bursts along a just-sunk ship's cells, ~100ms apart.
 * Rendered over the board (positioned in board-space percent units).
 */
export function SunkExplosions({ cells }: { cells: Coordinate[] }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-30" aria-hidden>
      {cells.map((cell, i) => (
        <span key={coKey(cell)} className="absolute" style={cellRect(cell)}>
          <ExplosionEffect delay={`${i * 0.1}s`} />
        </span>
      ))}
    </span>
  );
}

function coKey(cell: Coordinate): string {
  return `${cell.x},${cell.y}`;
}

/** Persistent smoke wisps rising from a wrecked ship. */
export function WreckSmoke({ placement }: { placement: ShipPlacement }) {
  const cells: Coordinate[] = [];
  for (let i = 0; i < placement.length; i += 2) {
    cells.push(
      placement.orientation === "horizontal"
        ? { x: placement.bow.x + i, y: placement.bow.y }
        : { x: placement.bow.x, y: placement.bow.y + i },
    );
  }
  return (
    <span className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {cells.map((cell, i) => (
        <span key={coKey(cell)} className="absolute" style={cellRect(cell)}>
          <span
            className="animate-smoke-wisp absolute bottom-[35%] left-1/2 h-[55%] w-[55%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(148,152,160,0.5)_0%,rgba(70,74,82,0.3)_55%,rgba(30,32,38,0)_78%)]"
            style={{ animationDelay: `${i * 1.3}s` }}
          />
        </span>
      ))}
    </span>
  );
}

/** Thin smoke wisps rising from damaged (hit, not yet sunk) ship segments. */
export function DamageSmoke({ cells }: { cells: Coordinate[] }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-20" aria-hidden>
      {cells.map((cell, i) => (
        <span key={coKey(cell)} className="absolute" style={cellRect(cell)}>
          <span
            className="animate-smoke-wisp absolute bottom-[40%] left-1/2 h-[38%] w-[38%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(140,144,152,0.42)_0%,rgba(64,68,76,0.26)_55%,rgba(30,32,38,0)_78%)]"
            style={{ animationDelay: `${(i % 4) * 1.05}s`, animationDuration: "5.2s" }}
          />
        </span>
      ))}
    </span>
  );
}

export interface SunkCallout {
  shipId: ShipId;
  attacker: PlayerId;
  seq: number;
}

/** Slide-in "Cruiser Sunk!" banner in the attacking player's color. */
export function SunkBanner({ callout }: { callout: SunkCallout }) {
  const dutch = callout.attacker === "dutch";
  return (
    <div
      key={callout.seq}
      className={`animate-banner-in pointer-events-none absolute inset-x-0 top-[38%] z-40 flex justify-center`}
    >
      <div
        className={`flex items-center gap-2 rounded-2xl border px-4 py-2 font-display text-sm font-bold uppercase tracking-wider shadow-panel backdrop-blur-sm ${
          dutch
            ? "border-dutch-400/70 bg-navy-950/85 text-dutch-300 shadow-glow-dutch"
            : "border-devin-400/70 bg-navy-950/85 text-devin-300 shadow-glow-devin"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="animate-sound-pulse h-4 w-4"
          fill="currentColor"
          aria-hidden
        >
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path
            d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {SHIP_NAMES[callout.shipId]} sunk!
        <span className="text-[0.8em] font-semibold normal-case tracking-normal text-foam-400">
          — {PLAYERS[callout.attacker].name}
        </span>
      </div>
    </div>
  );
}
