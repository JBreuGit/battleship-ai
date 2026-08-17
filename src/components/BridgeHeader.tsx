"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PLAYERS } from "./PlayerBadge";
import { PlayerAvatarBadge } from "./PlayerAvatar";

/** Sticky ship's-bridge control-panel header: brushed metal, rivets, stencil title, mini radar. */
export function BridgeHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="bridge-header sticky top-0 z-40 border-b border-navy-line/70 backdrop-blur-md">
      <div aria-hidden className="rivet-row h-1.5 w-full" />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex items-center -space-x-1.5">
            <PlayerAvatarBadge player="dutch" size="sm" />
            <PlayerAvatarBadge player="devin" size="sm" />
          </span>
          <div>
            <h1 className="font-stencil text-base tracking-wider sm:text-lg">
              <span className="text-dutch-400">{PLAYERS.dutch.name}</span>
              <span className="mx-1.5 text-[0.75em] text-foam-400">VS</span>
              <span className="text-devin-400">{PLAYERS.devin.name}</span>
            </h1>
            <p className="-mt-0.5 hidden text-[11px] font-medium uppercase tracking-[0.22em] text-foam-400 sm:block">
              Battleship · Bridge Command
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <MiniRadar />
          {children}
        </div>
      </div>
      <div aria-hidden className="rivet-row h-1.5 w-full" />
    </header>
  );
}

/** Small ambient radar scope with a rotating sweep. */
function MiniRadar() {
  return (
    <span
      aria-hidden
      className="relative hidden h-9 w-9 items-center justify-center rounded-full border border-lagoon-600/50 bg-navy-950/80 shadow-btn sm:flex"
    >
      <svg viewBox="0 0 36 36" className="h-full w-full">
        <circle cx="18" cy="18" r="15" fill="none" stroke="#155e75" strokeWidth="0.8" opacity="0.7" />
        <circle cx="18" cy="18" r="9.5" fill="none" stroke="#155e75" strokeWidth="0.7" opacity="0.55" />
        <circle cx="18" cy="18" r="4" fill="none" stroke="#155e75" strokeWidth="0.6" opacity="0.45" />
        <line x1="3" y1="18" x2="33" y2="18" stroke="#155e75" strokeWidth="0.5" opacity="0.4" />
        <line x1="18" y1="3" x2="18" y2="33" stroke="#155e75" strokeWidth="0.5" opacity="0.4" />
        <g className="animate-radar-sweep">
          <path d="M18 18 L18 3 A15 15 0 0 1 27.5 6.2 Z" fill="#22d3ee" opacity="0.28" />
          <line x1="18" y1="18" x2="18" y2="3" stroke="#67e8f9" strokeWidth="1" opacity="0.8" />
        </g>
        <circle cx="24" cy="12" r="1.2" fill="#67e8f9" className="animate-pulse-soft" />
      </svg>
    </span>
  );
}

/** Decorative fixed coordinates readout in the bottom corner. */
export function CoordinateReadout() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 3600), 2000);
    return () => clearInterval(id);
  }, []);

  const lat = 52 + ((tick * 7) % 60) / 1000;
  const lon = 4 + ((tick * 13) % 60) / 1000;
  const depth = 42 + (tick % 9);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-2 left-3 z-20 hidden font-mono text-[10px] leading-4 text-lagoon-600/80 sm:block"
    >
      <p>LAT {lat.toFixed(3)}°N · LON {lon.toFixed(3)}°E</p>
      <p>DEPTH {depth} FTM · BRG 047° · ALL STATIONS MANNED</p>
    </div>
  );
}
