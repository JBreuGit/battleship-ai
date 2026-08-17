"use client";

import confetti from "canvas-confetti";
import { useEffect } from "react";
import { RankInfo, rankIndexForLevel } from "@/game/campaign";
import { RankedAvatarBadge } from "./RankInsigniaOverlay";
import { SoundControls } from "./useSoundManager";

export interface PromotionModalProps {
  /** The rank just attained. */
  rank: RankInfo;
  /** Campaign level the commander is now at (drives the insignia). */
  level: number;
  onContinue: () => void;
  sound?: SoundControls;
}

/**
 * Field-promotion ceremony: the updated avatar with its new insignia
 * pinning on, backed by the victory fanfare and a gold confetti burst.
 */
export function PromotionModal({
  rank,
  level,
  onContinue,
  sound,
}: PromotionModalProps) {
  useEffect(() => {
    sound?.play("victory");
    confetti({
      particleCount: 110,
      spread: 80,
      origin: { y: 0.55 },
      colors: ["#fbbf24", "#ff8c00", "#ffb066", "#f1f5f9"],
      zIndex: 60,
      disableForReducedMotion: true,
    });
    // The fanfare plays once on mount; sound identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rankIndex = rankIndexForLevel(level);
  const flagOfficer = rankIndex >= 7;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(251, 191, 36, 0.14), transparent 70%)",
        }}
      />
      <div className="animate-rise-in w-full max-w-sm rounded-2xl border border-amber-cta/50 bg-navy-900 p-8 text-center shadow-panel shadow-glow-amber">
        <p className="font-mono text-[10px] uppercase tracking-widest text-amber-cta">
          Field promotion · Dutch Navy
        </p>
        <div className="mt-4 flex justify-center">
          <RankedAvatarBadge level={level} size="xl" pinOn />
        </div>
        <p className="mt-4 font-display text-3xl font-extrabold tracking-wide text-amber-cta">
          Promoted to {rank.title}!
        </p>
        <p className="mt-2 text-sm text-foam-300">
          {flagOfficer
            ? "The fleet salutes you. Your command now carries flag-officer authority."
            : "Outstanding seamanship, commander. New insignia have been pinned to your uniform."}
        </p>
        <button
          type="button"
          onClick={() => {
            sound?.play("click");
            onContinue();
          }}
          className="mt-8 w-full rounded-xl bg-gradient-to-b from-amber-cta to-amber-deep px-4 py-3 font-display text-base font-bold tracking-wide text-navy-950 shadow-glow-amber transition-all duration-200 ease-out hover:brightness-110 active:scale-95"
        >
          Continue campaign
        </button>
      </div>
    </div>
  );
}
