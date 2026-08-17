"use client";

import type { CSSProperties } from "react";
import { PLAYERS } from "./PlayerBadge";
import { CALLSIGNS, PlayerAvatarBadge } from "./PlayerAvatar";

interface Speck {
  left: string;
  top: string;
  size: string;
  opacity: number;
  driftX: string;
  duration: string;
  delay: string;
}

const SPECKS: Speck[] = [
  { left: "6%", top: "82%", size: "3px", opacity: 0.5, driftX: "14px", duration: "16s", delay: "0s" },
  { left: "14%", top: "64%", size: "2px", opacity: 0.35, driftX: "-10px", duration: "21s", delay: "3s" },
  { left: "23%", top: "90%", size: "2px", opacity: 0.45, driftX: "8px", duration: "18s", delay: "7s" },
  { left: "31%", top: "72%", size: "3px", opacity: 0.3, driftX: "-16px", duration: "24s", delay: "1.5s" },
  { left: "42%", top: "86%", size: "2px", opacity: 0.5, driftX: "12px", duration: "15s", delay: "9s" },
  { left: "51%", top: "68%", size: "2px", opacity: 0.35, driftX: "-8px", duration: "22s", delay: "5s" },
  { left: "59%", top: "93%", size: "3px", opacity: 0.4, driftX: "18px", duration: "17s", delay: "11s" },
  { left: "67%", top: "76%", size: "2px", opacity: 0.3, driftX: "-12px", duration: "25s", delay: "2.5s" },
  { left: "74%", top: "88%", size: "2px", opacity: 0.5, driftX: "10px", duration: "19s", delay: "8s" },
  { left: "82%", top: "66%", size: "3px", opacity: 0.35, driftX: "-14px", duration: "23s", delay: "4s" },
  { left: "89%", top: "84%", size: "2px", opacity: 0.45, driftX: "8px", duration: "16s", delay: "12s" },
  { left: "96%", top: "74%", size: "2px", opacity: 0.3, driftX: "-10px", duration: "20s", delay: "6s" },
];

/** Very subtle floating light specks drifting up over the ocean backdrop. */
export function AmbientParticles() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {SPECKS.map((s, i) => (
        <span
          key={i}
          className="animate-speck-drift absolute rounded-full bg-lagoon-300 blur-[0.5px]"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            "--speck-o": s.opacity,
            "--speck-x": s.driftX,
            "--speck-t": s.duration,
            "--speck-d": s.delay,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Title screen: logo lockup with both avatars over the animated ocean. */
export function SplashScreen({ onDeploy }: { onDeploy: () => void }) {
  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="animate-rise-in flex items-start gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-1.5">
          <PlayerAvatarBadge player="dutch" size="xl" active />
          <p className="font-mono text-[10px] uppercase tracking-widest text-dutch-400/90">
            {CALLSIGNS.dutch}
          </p>
        </div>
        <span className="self-center pb-5 font-display text-lg font-extrabold tracking-widest text-foam-400">
          VS
        </span>
        <div className="flex flex-col items-center gap-1.5">
          <PlayerAvatarBadge player="devin" size="xl" active />
          <p className="font-mono text-[10px] uppercase tracking-widest text-devin-400/90">
            {CALLSIGNS.devin}
          </p>
        </div>
      </div>

      <div className="animate-rise-in [animation-delay:120ms]">
        <h1 className="font-display text-4xl font-extrabold tracking-wide sm:text-6xl">
          <span className="text-dutch-400 drop-shadow-[0_0_18px_rgba(255,107,0,0.35)]">
            {PLAYERS.dutch.name}
          </span>
          <span className="mx-3 text-[0.55em] text-foam-400">vs</span>
          <span className="text-devin-400 drop-shadow-[0_0_18px_rgba(0,217,255,0.35)]">
            {PLAYERS.devin.name}
          </span>
        </h1>
        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-foam-400">
          Battleship — Naval Strike
        </p>
      </div>

      <div className="animate-rise-in [animation-delay:260ms]">
        <button
          type="button"
          onClick={onDeploy}
          className="animate-glow-pulse-amber rounded-2xl bg-gradient-to-b from-amber-cta to-amber-deep px-10 py-4 font-display text-xl font-bold tracking-wide text-navy-950 transition-all duration-200 ease-out hover:brightness-110 active:scale-95"
        >
          Deploy Fleet
        </button>
      </div>

      <p className="animate-rise-in text-xs font-medium text-foam-400 [animation-delay:400ms]">
        Classic &amp; Admiral rules of engagement · Easy / Medium / Hard AI
      </p>
    </div>
  );
}
