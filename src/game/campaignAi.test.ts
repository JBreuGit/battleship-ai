import { createAi } from "./ai";
import { Board, coordKey } from "./board";
import {
  CAMPAIGN_LEVELS,
  campaignParams,
  createCampaignAi,
} from "./campaignAi";
import { randomFleet } from "./placement";
import { createRng } from "./rng";
import { Coordinate } from "./types";
import type { AiPlayer } from "./ai";

function playToCompletion(ai: AiPlayer, board: Board): Coordinate[] {
  const shots: Coordinate[] = [];
  for (let i = 0; i < 100; i++) {
    const target = ai.nextShot();
    shots.push(target);
    const result = board.fire(target);
    ai.notify(target, result);
    if (result.outcome === "fleet-sunk") {
      return shots;
    }
  }
  throw new Error("AI failed to sink the fleet within 100 shots");
}

function averageShots(makeAi: (rng: ReturnType<typeof createRng>) => AiPlayer, seeds: number): number {
  let total = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const rng = createRng(seed * 7919 + 13);
    const ai = makeAi(rng);
    const board = new Board(randomFleet(rng));
    total += playToCompletion(ai, board).length;
  }
  return total / seeds;
}

describe("campaignParams", () => {
  it("clamps levels outside 1..20", () => {
    expect(campaignParams(0).level).toBe(1);
    expect(campaignParams(99).level).toBe(CAMPAIGN_LEVELS);
  });

  it("scales monotonically from level 1 to 20", () => {
    for (let level = 2; level <= CAMPAIGN_LEVELS; level++) {
      const prev = campaignParams(level - 1);
      const curr = campaignParams(level);
      expect(curr.targetFollowChance).toBeGreaterThanOrEqual(
        prev.targetFollowChance,
      );
      expect(curr.optimalShotChance).toBeGreaterThanOrEqual(
        prev.optimalShotChance,
      );
    }
  });

  it("starts below Easy: mostly blind, weak follow-up", () => {
    const p = campaignParams(1);
    expect(p.optimalShotChance).toBe(0);
    expect(p.targetFollowChance).toBeLessThan(0.4);
    expect(p.perimeterBias).toBeGreaterThan(0.4);
    expect(p.usesParity).toBe(false);
    expect(p.clearsSunkRing).toBe(false);
  });

  it("plays fully optimally at level 20", () => {
    const p = campaignParams(CAMPAIGN_LEVELS);
    expect(p.optimalShotChance).toBe(1);
    expect(p.targetFollowChance).toBe(1);
    expect(p.perimeterBias).toBe(0);
    expect(p.usesParity).toBe(true);
    expect(p.clearsSunkRing).toBe(true);
  });
});

describe.each([1, 5, 10, 15, 20])("campaign AI level %i basics", (level) => {
  it("never repeats a square and always sinks the fleet", () => {
    for (let seed = 0; seed < 5; seed++) {
      const rng = createRng(seed);
      const ai = createCampaignAi(level, rng);
      const board = new Board(randomFleet(rng));
      const shots = playToCompletion(ai, board);
      const keys = shots.map(coordKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect(board.allSunk()).toBe(true);
    }
  });
});

describe("campaign difficulty curve", () => {
  const SEEDS = 40;

  it("takes fewer shots to win as the level rises", () => {
    const level1 = averageShots((rng) => createCampaignAi(1, rng), SEEDS);
    const level10 = averageShots((rng) => createCampaignAi(10, rng), SEEDS);
    const level20 = averageShots((rng) => createCampaignAi(20, rng), SEEDS);
    expect(level10).toBeLessThan(level1 - 3);
    expect(level20).toBeLessThan(level10 - 3);
  });

  it("level 1 plays no stronger than the classic Easy AI", () => {
    // Easy fires uniformly blind (~95 shots to clear a board), which is
    // close to the worst possible. Level 1 keeps a sliver of hunting, so
    // it must land in Easy's neighborhood — never meaningfully stronger.
    const level1 = averageShots((rng) => createCampaignAi(1, rng), SEEDS);
    const easy = averageShots((rng) => createAi("easy", rng), SEEDS);
    expect(level1).toBeGreaterThan(easy - 5);
  });

  it("level 20 is at least as strong as the classic Hard AI", () => {
    const level20 = averageShots((rng) => createCampaignAi(20, rng), SEEDS);
    const hard = averageShots((rng) => createAi("hard", rng), SEEDS);
    expect(level20).toBeLessThanOrEqual(hard + 1);
  });
});
