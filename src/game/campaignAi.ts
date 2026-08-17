import { AdvancedGame, BarrageReport, PlayerId } from "./advanced";
import {
  AdvancedAiPlayer,
  TurnEvent,
  randomScanCenter,
} from "./advancedAi";
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

/**
 * Campaign opponent for Battle Commander's Admiral-rules battles: the
 * level-scaled shot selection of CampaignAi plus an ability policy over
 * whatever the level's loadout has unlocked. Low levels rarely reach for
 * an ability; level 20 uses one nearly every eligible turn — barrage and
 * rapid fire to finish wounded ships, recon and sonar while searching.
 */
export class CampaignAdmiralAi extends CampaignAi implements AdvancedAiPlayer {
  private readonly fireQueue: Coordinate[] = [];
  private suspects: Coordinate[] = [];

  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const t = (this.params.level - 1) / (CAMPAIGN_LEVELS - 1);
    const abilityChance = 0.25 + 0.7 * t;
    const hunting =
      this.cellsWhere("hit").length > 0 || this.pendingQueue().length > 0;
    if (this.rng() < abilityChance) {
      const events = hunting
        ? this.finisherAbility(game, me)
        : this.searchAbility(game, me);
      if (events) {
        return events;
      }
    }
    return this.fireTurn(game, me);
  }

  noteRevealedEnemyCell(cell: Coordinate): void {
    this.fireQueue.push(cell);
  }

  private pendingQueue(): Coordinate[] {
    return this.fireQueue.filter((cell) => this.knowledge(cell) === "unknown");
  }

  /** Spend barrage or rapid fire on a wounded ship. */
  private finisherAbility(
    game: AdvancedGame,
    me: PlayerId,
  ): TurnEvent[] | null {
    if (game.abilityAvailable(me, "barrage")) {
      const center = this.pickTarget();
      const report = game.useBarrage(me, center);
      this.absorbBarrage(report);
      return [{ kind: "barrage", center, report }];
    }
    if (game.abilityAvailable(me, "rapid-fire")) {
      return this.rapidFireTurn(game, me);
    }
    return null;
  }

  /** Spend a scan (or spare firepower) while no ship is wounded. */
  private searchAbility(
    game: AdvancedGame,
    me: PlayerId,
  ): TurnEvent[] | null {
    if (game.abilityAvailable(me, "recon")) {
      const center = randomScanCenter(this.rng);
      const report = game.useRecon(me, center);
      this.fireQueue.push(...report.contacts);
      const contactKeys = new Set(report.contacts.map(coordKey));
      for (const cell of report.cells) {
        if (
          !contactKeys.has(coordKey(cell)) &&
          this.knowledge(cell) === "unknown"
        ) {
          this.setKnowledge(cell, "cleared");
        }
      }
      return [{ kind: "recon", center, report }];
    }
    if (game.abilityAvailable(me, "sonar")) {
      const center = randomScanCenter(this.rng);
      const report = game.useSonar(me, center);
      this.absorbScan(report.cells, report.contacts > 0);
      return [{ kind: "sonar", center, report }];
    }
    if (game.abilityAvailable(me, "rapid-fire")) {
      return this.rapidFireTurn(game, me);
    }
    if (game.abilityAvailable(me, "barrage")) {
      const center = this.randomUnknown();
      const report = game.useBarrage(me, center);
      this.absorbBarrage(report);
      return [{ kind: "barrage", center, report }];
    }
    return null;
  }

  private rapidFireTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    game.useRapidFire(me);
    const events: TurnEvent[] = [{ kind: "rapid-fire" }];
    events.push(...this.fireTurn(game, me));
    if (game.winner === null) {
      events.push(...this.fireTurn(game, me));
    }
    return events;
  }

  private fireTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const target = this.pickTarget();
    const result = game.fireShot(me, target);
    if (result.outcome === "evaded") {
      this.fireQueue.push(target); // the sub is there — shoot it again
    } else {
      this.notify(target, result);
    }
    return [{ kind: "shot", target, result }];
  }

  private pickTarget(): Coordinate {
    const queued = this.pendingQueue();
    if (queued.length > 0) {
      return queued[0];
    }
    if (this.cellsWhere("hit").length === 0) {
      this.suspects = this.suspects.filter(
        (cell) => this.knowledge(cell) === "unknown",
      );
      if (this.suspects.length > 0) {
        return pick(this.rng, this.suspects);
      }
    }
    return this.nextShot();
  }

  private absorbScan(cells: Coordinate[], contact: boolean): void {
    for (const cell of cells) {
      if (this.knowledge(cell) !== "unknown") {
        continue;
      }
      if (contact) {
        this.suspects.push(cell);
      } else {
        this.setKnowledge(cell, "cleared");
      }
    }
  }

  private absorbBarrage(report: BarrageReport): void {
    for (const { target, result } of report.shots) {
      if (result.outcome === "evaded") {
        this.fireQueue.push(target);
      } else {
        this.notify(target, result);
      }
    }
  }
}

export function createCampaignAdmiralAi(
  level: number,
  rng: Rng,
): AdvancedAiPlayer {
  return new CampaignAdmiralAi(level, rng);
}
