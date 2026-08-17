"use client";

import {
  MAX_WEAPON_TIER,
  ShipClassId,
  WeaponTier,
  weaponTierInfo,
} from "@/game/campaign";
import { ShipSprite } from "./ShipSprite";
import { SHIP_NAMES } from "./ShotEffects";

const TIER_LABEL_COLORS: Record<WeaponTier, string> = {
  1: "text-foam-300",
  2: "text-lagoon-300",
  3: "text-dutch-300",
  4: "text-amber-cta",
};

export interface WeaponUpgradeCardProps {
  shipClass: ShipClassId;
  currentTier: WeaponTier;
  /** Whether an upgrade point can be spent on this ship right now. */
  canUpgrade: boolean;
  onUpgrade: (shipClass: ShipClassId) => void;
}

/**
 * One ship class in the Armory: its illustration at the current weapon tier,
 * tier pips, and — when eligible — what the next upgrade does plus a button
 * to spend an upgrade point on it.
 */
export function WeaponUpgradeCard({
  shipClass,
  currentTier,
  canUpgrade,
  onUpgrade,
}: WeaponUpgradeCardProps) {
  const current = weaponTierInfo(currentTier);
  const maxed = currentTier >= MAX_WEAPON_TIER;
  const next = maxed
    ? null
    : weaponTierInfo((currentTier + 1) as WeaponTier);
  const eligible = canUpgrade && !maxed;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        eligible
          ? "border-amber-cta/60 bg-navy-800/80 shadow-glow-amber"
          : "border-navy-line/60 bg-navy-800/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-bold tracking-wide text-foam-100">
          {SHIP_NAMES[shipClass]}
        </p>
        <div className="flex gap-1" aria-label={`Tier ${currentTier} of 4`}>
          {([1, 2, 3, 4] as const).map((tier) => (
            <span
              key={tier}
              className={`h-2 w-2 rotate-45 rounded-[2px] ${
                tier <= currentTier ? "bg-amber-cta" : "bg-navy-line"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 h-10">
        <ShipSprite shipId={shipClass} weaponTier={currentTier} />
      </div>
      <p className={`mt-2 font-mono text-[10px] uppercase tracking-widest ${TIER_LABEL_COLORS[currentTier]}`}>
        Tier {currentTier} · {current.name}
      </p>
      <p className="mt-1 text-xs leading-snug text-foam-300">
        {current.description}
      </p>
      {next && (
        <div className="mt-3 border-t border-navy-line/50 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-foam-400">
            Next: {next.name}
          </p>
          <p className="mt-1 text-xs leading-snug text-foam-300">
            {next.description}
          </p>
          {eligible && (
            <button
              type="button"
              onClick={() => onUpgrade(shipClass)}
              className="mt-2 w-full rounded-lg bg-gradient-to-b from-amber-cta to-amber-deep px-3 py-1.5 font-display text-xs font-bold tracking-wide text-navy-950 transition-all duration-150 ease-out hover:brightness-110 active:scale-95"
            >
              Install upgrade
            </button>
          )}
        </div>
      )}
      {maxed && (
        <p className="mt-3 border-t border-navy-line/50 pt-2 font-mono text-[10px] uppercase tracking-widest text-amber-cta">
          Fully upgraded
        </p>
      )}
    </div>
  );
}
