import { BaseAi, HardAi } from "./ai";
import { coordKey, isOnBoard } from "./board";
import { Rng, pick } from "./rng";
import { BOARD_SIZE, Coordinate } from "./types";

export const CAMPAIGN_LEVELS = 20;

/**
 * Skill knobs for a campaign opponent, derived from the level number by a
 * single smooth curve — there are no per-level hardcoded behaviors.
 */
export interface CampaignAiParams {
  level: number;
  /**
   * Chance per turn of pursuing known hits instead of firing blind.
   * Low levels frequently "lose interest" in a wounded ship.
   */
  targetFollowChance: number;
  /**
   * Chance per hunting turn of firing at the probability-density optimum
   * instead of a random untried square.
   */
  optimalShotChance: number;
  /**
   * Chance of a blind shot being wasted on the board perimeter, where
   * ship density is lowest. Makes early levels weaker than pure random.
   */
  perimeterBias: number;
  /** Restrict random hunting to a checkerboard parity pattern. */
  usesParity: boolean;
  /** Deduce the empty ring around sunk ships (ships never touch). */
  clearsSunkRing: boolean;
}

function clampLevel(level: number): number {
  return Math.min(CAMPAIGN_LEVELS, Math.max(1, Math.round(level)));
}

/**
 * Difficulty curve for the 20-level campaign. Level 1 sits below the
 * classic Easy AI (it barely follows up on hits), the midgame matches
 * Medium/Hard, and level 20 exceeds Hard: full probability-density
 * targeting plus parity hunting and sunk-ring deduction on every shot.
 */
export function campaignParams(level: number): CampaignAiParams {
  const l = clampLevel(level);
  const t = (l - 1) / (CAMPAIGN_LEVELS - 1);
  return {
    level: l,
    targetFollowChance: Math.min(1, 0.12 + 0.95 * t),
    optimalShotChance: Math.min(1, Math.pow(t, 1.5) * 1.08),
    perimeterBias: Math.max(0, 0.65 * (1 - 3 * t)),
    usesParity: l >= 8,
    clearsSunkRing: l >= 12,
  };
}

const ORTHOGONAL = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

/**
 * Parameterized campaign opponent. Reuses the Hard AI's placement-density
 * engine, but each turn rolls against the level-derived skill knobs to
 * decide whether to play optimally, sloppily, or completely blind.
 */
export class CampaignAi extends HardAi {
  readonly params: CampaignAiParams;

  constructor(level: number, rng: Rng) {
    super(rng);
    this.params = campaignParams(level);
  }

  override nextShot(): Coordinate {
    const { targetFollowChance, optimalShotChance, usesParity } = this.params;
    const hits = this.cellsWhere("hit");

    if (hits.length > 0 && this.rng() < targetFollowChance) {
      if (this.rng() < optimalShotChance) {
        return super.nextShot();
      }
      const candidates = this.neighborCandidates(hits);
      if (candidates.length > 0) {
        return pick(this.rng, candidates);
      }
    }

    if (this.rng() < optimalShotChance) {
      return super.nextShot();
    }
    if (this.rng() < this.params.perimeterBias) {
      const perimeter = this.cellsWhere("unknown").filter(
        (c) =>
          c.x === 0 ||
          c.y === 0 ||
          c.x === BOARD_SIZE - 1 ||
          c.y === BOARD_SIZE - 1,
      );
      if (perimeter.length > 0) {
        return pick(this.rng, perimeter);
      }
    }
    if (usesParity) {
      const parity = this.cellsWhere("unknown").filter(
        (c) => (c.x + c.y) % 2 === 0,
      );
      if (parity.length > 0) {
        return pick(this.rng, parity);
      }
    }
    return this.randomUnknown();
  }

  protected override onShipSunk(cells: Coordinate[]): void {
    if (this.params.clearsSunkRing) {
      super.onShipSunk(cells);
    }
  }

  /** Untried squares orthogonally adjacent to any outstanding hit. */
  private neighborCandidates(hits: Coordinate[]): Coordinate[] {
    const seen = new Set<string>();
    const candidates: Coordinate[] = [];
    for (const hit of hits) {
      for (const { dx, dy } of ORTHOGONAL) {
        const cell = { x: hit.x + dx, y: hit.y + dy };
        const key = coordKey(cell);
        if (
          isOnBoard(cell) &&
          this.knowledge(cell) === "unknown" &&
          !seen.has(key)
        ) {
          seen.add(key);
          candidates.push(cell);
        }
      }
    }
    return candidates;
  }
}

export function createCampaignAi(level: number, rng: Rng): BaseAi {
  return new CampaignAi(level, rng);
}
