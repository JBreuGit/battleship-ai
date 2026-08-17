"use client";

import {
  CAMPAIGN_LEVELS,
  CampaignState,
  RANKS,
  ShipClassId,
  isLevelCompleted,
  rankForLevel,
  rankIndexForLevel,
  totalLosses,
  totalWins,
} from "@/game/campaign";
import { RankedAvatarBadge } from "./RankInsigniaOverlay";
import { SoundControls } from "./useSoundManager";
import { WeaponUpgradeCard } from "./WeaponUpgradeCard";

export interface ArmoryScreenProps {
  campaign: CampaignState;
  onUpgrade: (shipClass: ShipClassId) => void;
  /** Proceed to fleet placement for the current level. */
  onStartLevel: () => void;
  /** Back to the mode selection screen. */
  onExit: () => void;
  onReset: () => void;
  sound?: SoundControls;
}

/**
 * Fleet Command / Armory: the between-engagement hub showing the commander's
 * rank and record, the 1-20 campaign progress map, and the weapon upgrade
 * status of each ship class.
 */
export function ArmoryScreen({
  campaign,
  onUpgrade,
  onStartLevel,
  onExit,
  onReset,
  sound,
}: ArmoryScreenProps) {
  const rank = rankForLevel(campaign.level);
  const rankIndex = rankIndexForLevel(campaign.level);
  const wins = totalWins(campaign);
  const losses = totalLosses(campaign);

  const click = () => sound?.play("click");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            click();
            onExit();
          }}
          className="rounded-lg border border-navy-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-foam-300 transition-colors hover:border-foam-300"
        >
          ← Exit
        </button>
        <h1 className="font-display text-lg font-extrabold tracking-widest text-amber-cta">
          Fleet Command
        </h1>
        <button
          type="button"
          onClick={() => {
            click();
            onReset();
          }}
          className="rounded-lg border border-navy-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-coral-400 transition-colors hover:border-coral-400"
        >
          Reset
        </button>
      </header>

      {/* Commander card: avatar with rank insignia, rank title, record */}
      <section className="flex items-center gap-4 rounded-2xl border border-amber-cta/40 bg-navy-900/80 p-4 shadow-panel">
        <RankedAvatarBadge level={campaign.level} size="lg" />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-foam-400">
            Dutch Navy · Commanding Officer
          </p>
          <p className="font-display text-lg font-extrabold tracking-wide text-foam-100 sm:text-xl">
            {rank.title}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-foam-300">
            {campaign.completed
              ? "Campaign complete — all 20 engagements won"
              : `Engagement ${campaign.level} of ${CAMPAIGN_LEVELS}`}
            {" · "}
            {wins}W – {losses}L
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-foam-400">
            Accreditations:{" "}
            {RANKS.slice(0, rankIndex + 1)
              .map((r) => r.title)
              .join(" · ")}
          </p>
        </div>
      </section>

      {/* Campaign progress map 1-20 */}
      <section className="rounded-2xl border border-navy-line/60 bg-navy-900/60 p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-foam-400">
          Campaign progress
        </p>
        <div className="mt-3 grid grid-cols-10 gap-1.5">
          {Array.from({ length: CAMPAIGN_LEVELS }, (_, i) => {
            const level = i + 1;
            const done = isLevelCompleted(campaign, level);
            const current = !campaign.completed && level === campaign.level;
            return (
              <span
                key={level}
                title={`Level ${level}${done ? " — won" : current ? " — current" : ""}`}
                className={`flex h-7 items-center justify-center rounded-md font-mono text-[10px] font-bold ${
                  done
                    ? "bg-amber-cta/90 text-navy-950"
                    : current
                      ? "animate-pulse-soft border border-amber-cta text-amber-cta"
                      : "border border-navy-line/70 text-foam-400"
                }`}
              >
                {done ? "✓" : level}
              </span>
            );
          })}
        </div>
      </section>

      {/* Armory: weapon upgrades per ship class */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-foam-200">
            Armory
          </h2>
          <p className="font-mono text-[11px] text-foam-300">
            Upgrade points:{" "}
            <span
              className={
                campaign.unspentUpgradePoints > 0
                  ? "font-bold text-amber-cta"
                  : ""
              }
            >
              {campaign.unspentUpgradePoints}
            </span>
          </p>
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([0, 1, 2, 3, 4] as const).map((shipClass) => (
            <WeaponUpgradeCard
              key={shipClass}
              shipClass={shipClass}
              currentTier={campaign.upgrades[shipClass]}
              canUpgrade={campaign.unspentUpgradePoints > 0}
              onUpgrade={(id) => {
                click();
                onUpgrade(id);
              }}
            />
          ))}
        </div>
      </section>

      {!campaign.completed && (
        <button
          type="button"
          onClick={() => {
            click();
            onStartLevel();
          }}
          className="sticky bottom-4 w-full rounded-xl bg-gradient-to-b from-amber-cta to-amber-deep px-4 py-3 font-display text-base font-bold tracking-wide text-navy-950 shadow-glow-amber transition-all duration-200 ease-out hover:brightness-110 active:scale-95"
        >
          Start engagement {campaign.level}
        </button>
      )}
    </main>
  );
}
