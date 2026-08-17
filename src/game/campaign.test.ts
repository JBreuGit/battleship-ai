import {
  CAMPAIGN_LEVELS,
  CAMPAIGN_STORAGE_KEY,
  RANKS,
  UPGRADE_LEVELS,
  applyUpgrade,
  createCampaignState,
  deserializeCampaign,
  isLevelCompleted,
  loadCampaign,
  rankForLevel,
  rankIndexForLevel,
  recordLoss,
  recordWin,
  resetCampaign,
  saveCampaign,
  serializeCampaign,
  totalLosses,
  totalWins,
} from "./campaign";
import type { CampaignState, ShipClassId } from "./campaign";

describe("rank ladder", () => {
  it("starts at Ensign and ends at Fleet Admiral", () => {
    expect(rankForLevel(1).title).toBe("Ensign");
    expect(rankForLevel(CAMPAIGN_LEVELS).title).toBe("Fleet Admiral");
  });

  it("never demotes as levels rise and visits every rank", () => {
    const seen = new Set<number>();
    let prev = 0;
    for (let level = 1; level <= CAMPAIGN_LEVELS; level++) {
      const index = rankIndexForLevel(level);
      expect(index).toBeGreaterThanOrEqual(prev);
      expect(index - prev).toBeLessThanOrEqual(1);
      seen.add(index);
      prev = index;
    }
    expect(seen.size).toBe(RANKS.length);
  });
});

describe("campaign progression", () => {
  it("a win advances to the next level and records it", () => {
    const { state, promotedTo } = recordWin(createCampaignState());
    expect(state.level).toBe(2);
    expect(state.records[1]).toEqual({ wins: 1, losses: 0 });
    expect(isLevelCompleted(state, 1)).toBe(true);
    expect(promotedTo).toBeNull();
  });

  it("a loss keeps the current level for a retry", () => {
    const state = recordLoss(createCampaignState());
    expect(state.level).toBe(1);
    expect(state.records[1]).toEqual({ wins: 0, losses: 1 });
  });

  it("reports a promotion when the new level carries a higher rank", () => {
    let state = createCampaignState();
    state = { ...state, level: 2 };
    const outcome = recordWin(state);
    expect(outcome.state.level).toBe(3);
    expect(outcome.promotedTo?.title).toBe("Lieutenant Junior Grade");
  });

  it("winning level 20 completes the campaign without leaving it", () => {
    const outcome = recordWin({ ...createCampaignState(), level: 20 });
    expect(outcome.state.level).toBe(CAMPAIGN_LEVELS);
    expect(outcome.state.completed).toBe(true);
  });

  it("awards upgrade points exactly at the scheduled levels", () => {
    let state = createCampaignState();
    for (let level = 1; level <= CAMPAIGN_LEVELS; level++) {
      state = { ...state, level };
      const outcome = recordWin(state);
      expect(outcome.upgradePointEarned).toBe(UPGRADE_LEVELS.includes(level));
      state = outcome.state;
    }
    expect(state.unspentUpgradePoints).toBe(UPGRADE_LEVELS.length);
    expect(totalWins(state)).toBe(CAMPAIGN_LEVELS);
    expect(totalLosses(state)).toBe(0);
  });
});

describe("weapon upgrades", () => {
  const withPoints = (points: number): CampaignState => ({
    ...createCampaignState(),
    unspentUpgradePoints: points,
  });

  it("spends a point to raise a ship class tier", () => {
    const state = applyUpgrade(withPoints(2), 0);
    expect(state.upgrades[0]).toBe(2);
    expect(state.unspentUpgradePoints).toBe(1);
  });

  it("does nothing without points or at max tier", () => {
    const noPoints = withPoints(0);
    expect(applyUpgrade(noPoints, 1)).toBe(noPoints);
    const maxed: CampaignState = {
      ...withPoints(1),
      upgrades: { ...withPoints(1).upgrades, 2: 4 },
    };
    expect(applyUpgrade(maxed, 2 as ShipClassId)).toBe(maxed);
  });
});

describe("persistence", () => {
  afterEach(() => {
    window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
  });

  it("round-trips through serialization", () => {
    let state = createCampaignState();
    state = recordWin(state).state;
    state = recordLoss(state);
    expect(deserializeCampaign(serializeCampaign(state))).toEqual(state);
  });

  it("rejects malformed or wrong-version payloads", () => {
    expect(deserializeCampaign("not json")).toBeNull();
    expect(deserializeCampaign("{}")).toBeNull();
    expect(deserializeCampaign(JSON.stringify({ version: 2 }))).toBeNull();
    expect(
      deserializeCampaign(JSON.stringify({ version: 1, level: 99 })),
    ).toBeNull();
  });

  it("saves to and loads from localStorage", () => {
    const state = recordWin(createCampaignState()).state;
    saveCampaign(state);
    expect(loadCampaign()).toEqual(state);
  });

  it("falls back to a fresh campaign when storage is empty or corrupt", () => {
    expect(loadCampaign()).toEqual(createCampaignState());
    window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, "garbage");
    expect(loadCampaign()).toEqual(createCampaignState());
  });

  it("resetCampaign clears progress", () => {
    saveCampaign(recordWin(createCampaignState()).state);
    const fresh = resetCampaign();
    expect(fresh.level).toBe(1);
    expect(loadCampaign()).toEqual(fresh);
  });
});
