"use client";

import { CAMPAIGN_LEVELS } from "@/game/campaign";

export interface BattleCommanderModeCardProps {
  /** Current campaign level (1 when no save exists). */
  level: number;
  /** True when a saved campaign exists to continue. */
  hasSave: boolean;
  onLaunch: () => void;
}

/**
 * The fourth, career-mode option on the mode selection screen: a larger
 * gold/bronze card with a rank-insignia chevron icon that launches the
 * Battle Commander campaign.
 */
export function BattleCommanderModeCard({
  level,
  hasSave,
  onLaunch,
}: BattleCommanderModeCardProps) {
  return (
    <button
      type="button"
      onClick={onLaunch}
      className="radar-panel animate-rise-in relative w-full overflow-hidden rounded-2xl border-2 border-amber-cta/70 bg-gradient-to-b from-navy-800 to-navy-900 p-5 text-left shadow-panel shadow-glow-amber transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.99]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 60% 50% at 85% 15%, rgba(251, 191, 36, 0.12), transparent 70%)",
        }}
      />
      <span className="flex items-start gap-4">
        <RankInsigniaIcon />
        <span className="min-w-0">
          <span className="block font-display text-lg font-extrabold tracking-wide text-amber-cta">
            Battle Commander
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest text-dutch-300">
            Career campaign · {CAMPAIGN_LEVELS} engagements
          </span>
          <span className="mt-2 block text-xs leading-relaxed text-foam-300">
            Battle Commander: Take command of the Dutch Navy fleet across 20
            escalating engagements. Prove yourself against Devin AI&apos;s
            evolving tactics, earn field promotions, and upgrade your
            fleet&apos;s firepower as you rise through the ranks.
          </span>
          <span className="mt-3 inline-block rounded-lg bg-gradient-to-b from-amber-cta to-amber-deep px-3 py-1.5 font-display text-xs font-bold tracking-wide text-navy-950">
            {hasSave ? `Continue Campaign — Level ${level}` : "Start Campaign"}
          </span>
        </span>
      </span>
    </button>
  );
}

/** Gold naval rank chevrons with a star, on a bronze roundel. */
function RankInsigniaIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 shrink-0" aria-hidden>
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="#0a1628"
        stroke="#b45309"
        strokeWidth="2.5"
      />
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1"
        strokeDasharray="2 3"
      />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M14 ${34 - i * 6} L24 ${28 - i * 6} L34 ${34 - i * 6}`}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <path
        d="M24 8.2 L25.6 12.4 L30 12.6 L26.6 15.4 L27.8 19.6 L24 17.2 L20.2 19.6 L21.4 15.4 L18 12.6 L22.4 12.4 Z"
        fill="#fbbf24"
        stroke="#b45309"
        strokeWidth="0.7"
      />
    </svg>
  );
}
