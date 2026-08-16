"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";
import type { Side } from "./BattleScreen";

export interface GameOverModalProps {
  winner: Side;
  playerShots: number;
  enemyShots: number;
  onPlayAgain: () => void;
}

/** Victory/defeat modal with stats; fires a confetti burst on victory. */
export function GameOverModal({
  winner,
  playerShots,
  enemyShots,
  onPlayAgain,
}: GameOverModalProps) {
  const won = winner === "player";

  useEffect(() => {
    if (!won) {
      return;
    }
    const colors = ["#22d3ee", "#fbbf24", "#0ea5e9", "#f1f5f9"];
    confetti({
      particleCount: 120,
      spread: 75,
      origin: { y: 0.6 },
      colors,
      zIndex: 60,
      disableForReducedMotion: true,
    });
    const timer = setTimeout(
      () =>
        confetti({
          particleCount: 60,
          spread: 100,
          origin: { y: 0.4 },
          colors,
          zIndex: 60,
          disableForReducedMotion: true,
        }),
      450,
    );
    return () => clearTimeout(timer);
  }, [won]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm">
      <div
        className={`animate-rise-in w-full max-w-sm rounded-2xl border p-8 text-center shadow-panel ${
          won
            ? "border-amber-cta/40 bg-navy-900 shadow-glow-amber"
            : "border-navy-line bg-navy-900"
        }`}
      >
        <p
          className={`font-display text-4xl font-extrabold tracking-wide ${
            won ? "text-amber-cta" : "text-coral-500"
          }`}
        >
          {won ? "Victory" : "Defeat"}
        </p>
        <p className="mt-2 text-sm text-foam-300">
          {won
            ? "Enemy fleet destroyed."
            : "Your fleet has been destroyed."}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-navy-line bg-navy-800 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-foam-400">
              Your shots
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-cyan-cta">
              {playerShots}
            </dd>
          </div>
          <div className="rounded-xl border border-navy-line bg-navy-800 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-foam-400">
              Enemy shots
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-cyan-cta">
              {enemyShots}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={onPlayAgain}
          className="mt-8 w-full rounded-xl bg-gradient-to-b from-amber-cta to-amber-deep px-4 py-3 font-display text-base font-bold tracking-wide text-navy-950 shadow-glow-amber transition-all duration-200 ease-out hover:brightness-110 active:scale-95"
        >
          Play again
        </button>
      </div>
    </div>
  );
}
