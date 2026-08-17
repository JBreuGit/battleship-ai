import { CAMPAIGN_LEVELS } from "./campaignAi";

export { CAMPAIGN_LEVELS };

/** Fleet index: 0 carrier, 1 battleship, 2 cruiser, 3 submarine, 4 destroyer. */
export type ShipClassId = 0 | 1 | 2 | 3 | 4;

export const SHIP_CLASS_IDS: readonly ShipClassId[] = [0, 1, 2, 3, 4];

export type WeaponTier = 1 | 2 | 3 | 4;

export const MAX_WEAPON_TIER: WeaponTier = 4;

export interface WeaponTierInfo {
  tier: WeaponTier;
  name: string;
  description: string;
}

export const WEAPON_TIERS: readonly WeaponTierInfo[] = [
  {
    tier: 1,
    name: "Standard Cannon",
    description: "Factory-issue naval gun. One shot per turn.",
  },
  {
    tier: 2,
    name: "Rapid-Fire Cannon",
    description:
      "Autoloader retrofit — once per battle, fire a second shot in the same turn.",
  },
  {
    tier: 3,
    name: "Heavy Shell",
    description:
      "High-caliber ordnance — once per battle, blanket a 2×2 area in a single salvo.",
  },
  {
    tier: 4,
    name: "Guided Shot",
    description:
      "Radar-guided precision round — once per battle, a guaranteed hit on an enemy ship.",
  },
];

export function weaponTierInfo(tier: WeaponTier): WeaponTierInfo {
  return WEAPON_TIERS[tier - 1];
}

/** Levels whose victory awards a weapon upgrade point. */
export const UPGRADE_LEVELS: readonly number[] = [3, 6, 9, 12, 15, 18];

export interface RankInfo {
  title: string;
  /** First campaign level at which this rank is held. */
  fromLevel: number;
}

/** Naval rank ladder distributed across the 20 campaign levels. */
export const RANKS: readonly RankInfo[] = [
  { title: "Ensign", fromLevel: 1 },
  { title: "Lieutenant Junior Grade", fromLevel: 3 },
  { title: "Lieutenant", fromLevel: 5 },
  { title: "Lieutenant Commander", fromLevel: 7 },
  { title: "Commander", fromLevel: 9 },
  { title: "Captain", fromLevel: 11 },
  { title: "Commodore", fromLevel: 13 },
  { title: "Rear Admiral", fromLevel: 15 },
  { title: "Vice Admiral", fromLevel: 17 },
  { title: "Admiral", fromLevel: 19 },
  { title: "Fleet Admiral", fromLevel: 20 },
];

/** Index into RANKS for the rank held at a given campaign level. */
export function rankIndexForLevel(level: number): number {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (level >= RANKS[i].fromLevel) {
      index = i;
    }
  }
  return index;
}

export function rankForLevel(level: number): RankInfo {
  return RANKS[rankIndexForLevel(level)];
}

export interface LevelRecord {
  wins: number;
  losses: number;
}

/**
 * Full campaign save. Kept as a flat, versioned, JSON-serializable object
 * so persistence can later move from localStorage to a backend unchanged.
 */
export interface CampaignState {
  version: 1;
  /** Level currently being attempted, 1..20. */
  level: number;
  /** True once level 20 has been won. */
  completed: boolean;
  /** Win/loss record keyed by level number. */
  records: Record<number, LevelRecord>;
  /** Weapon tier per ship class (fleet index as string key when serialized). */
  upgrades: Record<ShipClassId, WeaponTier>;
  /** Upgrade points earned but not yet spent. */
  unspentUpgradePoints: number;
}

export function createCampaignState(): CampaignState {
  return {
    version: 1,
    level: 1,
    completed: false,
    records: {},
    upgrades: { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 },
    unspentUpgradePoints: 0,
  };
}

export interface WinOutcome {
  state: CampaignState;
  /** Set when the win raised the commander's rank. */
  promotedTo: RankInfo | null;
  /** True when the win awarded a weapon upgrade point. */
  upgradePointEarned: boolean;
}

/**
 * Record a victory at the current level: advance to the next level (the
 * campaign completes at level 20), award any upgrade point, and report a
 * promotion when the new level carries a higher rank.
 */
export function recordWin(state: CampaignState): WinOutcome {
  const level = state.level;
  const record = state.records[level] ?? { wins: 0, losses: 0 };
  const nextLevel = Math.min(CAMPAIGN_LEVELS, level + 1);
  const upgradePointEarned = UPGRADE_LEVELS.includes(level);
  const oldRank = rankIndexForLevel(level);
  const newRank = rankIndexForLevel(nextLevel);
  const next: CampaignState = {
    ...state,
    level: nextLevel,
    completed: state.completed || level === CAMPAIGN_LEVELS,
    records: {
      ...state.records,
      [level]: { ...record, wins: record.wins + 1 },
    },
    unspentUpgradePoints:
      state.unspentUpgradePoints + (upgradePointEarned ? 1 : 0),
  };
  return {
    state: next,
    promotedTo: newRank > oldRank ? RANKS[newRank] : null,
    upgradePointEarned,
  };
}

/** Record a defeat: the level is kept and can be retried immediately. */
export function recordLoss(state: CampaignState): CampaignState {
  const record = state.records[state.level] ?? { wins: 0, losses: 0 };
  return {
    ...state,
    records: {
      ...state.records,
      [state.level]: { ...record, losses: record.losses + 1 },
    },
  };
}

/** Spend an upgrade point on a ship class; no-op when not allowed. */
export function applyUpgrade(
  state: CampaignState,
  shipClass: ShipClassId,
): CampaignState {
  if (
    state.unspentUpgradePoints <= 0 ||
    state.upgrades[shipClass] >= MAX_WEAPON_TIER
  ) {
    return state;
  }
  return {
    ...state,
    upgrades: {
      ...state.upgrades,
      [shipClass]: (state.upgrades[shipClass] + 1) as WeaponTier,
    },
    unspentUpgradePoints: state.unspentUpgradePoints - 1,
  };
}

/** True when a level has been won at least once. */
export function isLevelCompleted(state: CampaignState, level: number): boolean {
  return (state.records[level]?.wins ?? 0) > 0;
}

export function totalWins(state: CampaignState): number {
  return Object.values(state.records).reduce((sum, r) => sum + r.wins, 0);
}

export function totalLosses(state: CampaignState): number {
  return Object.values(state.records).reduce((sum, r) => sum + r.losses, 0);
}

export const CAMPAIGN_STORAGE_KEY = "battleship-campaign-v1";

export function serializeCampaign(state: CampaignState): string {
  return JSON.stringify(state);
}

export function deserializeCampaign(raw: string): CampaignState | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (
      typeof data !== "object" ||
      data === null ||
      (data as { version?: unknown }).version !== 1
    ) {
      return null;
    }
    const parsed = data as CampaignState;
    if (
      !Number.isInteger(parsed.level) ||
      parsed.level < 1 ||
      parsed.level > CAMPAIGN_LEVELS ||
      typeof parsed.completed !== "boolean" ||
      typeof parsed.records !== "object" ||
      parsed.records === null ||
      typeof parsed.upgrades !== "object" ||
      parsed.upgrades === null ||
      !Number.isInteger(parsed.unspentUpgradePoints) ||
      parsed.unspentUpgradePoints < 0
    ) {
      return null;
    }
    const base = createCampaignState();
    const upgrades = { ...base.upgrades };
    for (const shipClass of SHIP_CLASS_IDS) {
      const tier: unknown = parsed.upgrades[shipClass];
      if (
        typeof tier === "number" &&
        Number.isInteger(tier) &&
        tier >= 1 &&
        tier <= MAX_WEAPON_TIER
      ) {
        upgrades[shipClass] = tier as WeaponTier;
      }
    }
    const records: Record<number, LevelRecord> = {};
    for (const [key, value] of Object.entries(parsed.records)) {
      const level = Number(key);
      const record = value as Partial<LevelRecord> | null;
      if (
        Number.isInteger(level) &&
        level >= 1 &&
        level <= CAMPAIGN_LEVELS &&
        typeof record === "object" &&
        record !== null &&
        Number.isInteger(record.wins) &&
        (record.wins as number) >= 0 &&
        Number.isInteger(record.losses) &&
        (record.losses as number) >= 0
      ) {
        records[level] = {
          wins: record.wins as number,
          losses: record.losses as number,
        };
      }
    }
    return {
      version: 1,
      level: parsed.level,
      completed: parsed.completed,
      records,
      upgrades,
      unspentUpgradePoints: parsed.unspentUpgradePoints,
    };
  } catch {
    return null;
  }
}

export function loadCampaign(): CampaignState {
  if (typeof window === "undefined") {
    return createCampaignState();
  }
  const raw = window.localStorage.getItem(CAMPAIGN_STORAGE_KEY);
  return (raw && deserializeCampaign(raw)) || createCampaignState();
}

export function saveCampaign(state: CampaignState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, serializeCampaign(state));
}

export function resetCampaign(): CampaignState {
  const fresh = createCampaignState();
  saveCampaign(fresh);
  return fresh;
}
