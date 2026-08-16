"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";
import type { Side } from "./BattleScreen";
import { PLAYERS, PlayerBadge } from "./PlayerBadge";

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
    const colors = ["#ff8c00", "#ff6b00", "#fbbf24", "#f1f5f9"];
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
            ? "border-dutch-500/40 bg-navy-900 shadow-glow-dutch"
            : "border-devin-400/40 bg-navy-900 shadow-glow-devin"
        }`}
      >
        <div className="flex justify-center">
          <PlayerBadge player={won ? "dutch" : "devin"} size="lg" active />
        </div>
        <p
          className={`mt-4 font-display text-4xl font-extrabold tracking-wide ${
            won ? "text-dutch-400" : "text-devin-400"
          }`}
        >
          {won ? "Victory" : "Defeat"}
        </p>
        <p className="mt-2 text-sm text-foam-300">
          {won
            ? `${PLAYERS.dutch.name} wins — the ${PLAYERS.devin.name} fleet is destroyed.`
            : `${PLAYERS.devin.name} wins — your fleet has been destroyed.`}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-navy-line bg-navy-800 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-foam-400">
              Dutch Navy shots
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-dutch-400">
              {playerShots}
            </dd>
          </div>
          <div className="rounded-xl border border-navy-line bg-navy-800 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-foam-400">
              Devin AI shots
            </dt>
            <dd className="mt-1 font-display text-2xl font-bold text-devin-400">
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
