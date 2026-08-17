import {
  AdvancedGame,
  BarrageReport,
  PlayerId,
  ReconReport,
  ShotResult,
  SonarReport,
} from "./advanced";
import { Difficulty, EasyAi, HardAi, MediumAi } from "./ai";
import { coordKey, isOnBoard } from "./board";
import { Rng, pick, randomInt } from "./rng";
import { BOARD_SIZE, Coordinate } from "./types";

/** One step of an Admiral-mode turn, for UI replay and logging. */
export type TurnEvent =
  | { kind: "shot"; target: Coordinate; result: ShotResult }
  | { kind: "recon"; center: Coordinate; report: ReconReport }
  | { kind: "sonar"; center: Coordinate; report: SonarReport }
  | { kind: "barrage"; center: Coordinate; report: BarrageReport }
  | { kind: "rapid-fire" };

export interface AdvancedAiPlayer {
  readonly difficulty: Difficulty;
  /** Play one full turn as `me` and return what happened. */
  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[];
  /**
   * Tell the AI that the opponent's own sonar ping exposed one of the
   * opponent's ship cells to it.
   */
  noteRevealedEnemyCell(cell: Coordinate): void;
}

/** Centers whose 3x3 scan area lies fully on the board. */
export function randomScanCenter(rng: Rng): Coordinate {
  return {
    x: 1 + randomInt(rng, BOARD_SIZE - 2),
    y: 1 + randomInt(rng, BOARD_SIZE - 2),
  };
}

/**
 * Easy: fires at a random untried square every turn and ignores its
 * abilities entirely. An evaded shot teaches it nothing — the square stays
 * unknown, so it may eventually try it again.
 */
export class AdvancedEasyAi extends EasyAi implements AdvancedAiPlayer {
  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const target = this.nextShot();
    const result = game.fireShot(me, target);
    if (result.outcome !== "evaded") {
      this.notify(target, result);
    }
    return [{ kind: "shot", target, result }];
  }

  noteRevealedEnemyCell(): void {}
}

/**
 * Medium: same hunting brain as classic Medium, plus a greedy ability
 * policy — whenever it is not chasing a wounded ship it burns whatever
 * ability is available next (rapid fire, barrage, recon, sonar) at a
 * random spot. Scan results are used shallowly: an empty area is marked
 * off, a contact area becomes preferred hunting ground.
 */
export class AdvancedMediumAi extends MediumAi implements AdvancedAiPlayer {
  private readonly fireQueue: Coordinate[] = [];
  private suspects: Coordinate[] = [];

  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const hunting =
      this.cellsWhere("hit").length > 0 || this.pendingQueue().length > 0;
    if (!hunting) {
      const ability = this.greedyAbility(game, me);
      if (ability) {
        return ability;
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

  private greedyAbility(
    game: AdvancedGame,
    me: PlayerId,
  ): TurnEvent[] | null {
    if (game.abilityAvailable(me, "rapid-fire")) {
      game.useRapidFire(me);
      const events: TurnEvent[] = [{ kind: "rapid-fire" }];
      events.push(...this.fireTurn(game, me));
      if (game.winner === null) {
        events.push(...this.fireTurn(game, me));
      }
      return events;
    }
    if (game.abilityAvailable(me, "barrage")) {
      const center = this.randomUnknown();
      const report = game.useBarrage(me, center);
      this.absorbBarrage(report);
      return [{ kind: "barrage", center, report }];
    }
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
    return null;
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

const BONUS_PER_HIDDEN_CONTACT = 4;

/**
 * Hard: classic probability-density targeting, plus a deliberate ability
 * policy —
 * - fires first at squares it knows contain a ship (sonar reveals,
 *   evaded submarines);
 * - while a wounded ship is outstanding it finishes it with a barrage
 *   cross or rapid fire;
 * - while searching it spends recon and sonar on the densest unscanned
 *   area, firing at recon-photographed ship cells directly, marking empty
 *   areas off exactly and weighting sonar areas with unexplained contacts
 *   into its density map.
 */
export class AdvancedHardAi extends HardAi implements AdvancedAiPlayer {
  private readonly knownShipCells: Coordinate[] = [];
  private readonly areaBonus = new Map<string, number>();
  private readonly scanned = new Set<string>();

  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const hits = this.cellsWhere("hit");
    if (hits.length > 0) {
      if (game.abilityAvailable(me, "barrage")) {
        return this.barrageTurn(game, me);
      }
      if (game.abilityAvailable(me, "rapid-fire")) {
        return this.rapidFireTurn(game, me);
      }
      return this.fireTurn(game, me);
    }
    if (this.pendingKnown().length > 0) {
      return this.fireTurn(game, me);
    }
    if (game.abilityAvailable(me, "recon")) {
      const center = this.bestScanCenter();
      const report = game.useRecon(me, center);
      this.knownShipCells.push(...report.contacts);
      const contactKeys = new Set(report.contacts.map(coordKey));
      for (const cell of report.cells) {
        this.scanned.add(coordKey(cell));
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
      const center = this.bestScanCenter();
      const report = game.useSonar(me, center);
      this.absorbScan(report.cells, this.hiddenContacts(report));
      return [{ kind: "sonar", center, report }];
    }
    return this.fireTurn(game, me);
  }

  noteRevealedEnemyCell(cell: Coordinate): void {
    this.knownShipCells.push(cell);
  }

  protected override placementDensity(hits: Coordinate[]): number[][] {
    const density = super.placementDensity(hits);
    if (hits.length === 0) {
      for (const [key, bonus] of this.areaBonus) {
        const [x, y] = key.split(",").map(Number);
        if (this.knowledge({ x, y }) === "unknown") {
          density[y][x] += bonus;
        }
      }
    }
    return density;
  }

  private pendingKnown(): Coordinate[] {
    return this.knownShipCells.filter(
      (cell) => this.knowledge(cell) === "unknown",
    );
  }

  private fireTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const target = this.pickTarget();
    const result = game.fireShot(me, target);
    this.absorbShot(target, result);
    return [{ kind: "shot", target, result }];
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

  private barrageTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const center = this.pickTarget();
    const report = game.useBarrage(me, center);
    for (const { target, result } of report.shots) {
      this.absorbShot(target, result);
    }
    return [{ kind: "barrage", center, report }];
  }

  private pickTarget(): Coordinate {
    const known = this.pendingKnown();
    if (known.length > 0) {
      return known[0];
    }
    return this.nextShot();
  }

  private absorbShot(target: Coordinate, result: ShotResult): void {
    if (result.outcome === "evaded") {
      this.knownShipCells.push(target); // the sub is there — shoot it again
    } else {
      this.notify(target, result);
    }
  }

  /** Unexplained ship cells in a sonar report (contacts minus known ones). */
  private hiddenContacts(report: SonarReport): number {
    const known = report.cells.filter((cell) => {
      const state = this.knowledge(cell);
      return state === "hit" || state === "sunk";
    }).length;
    return Math.max(0, report.contacts - known);
  }

  private absorbScan(cells: Coordinate[], hiddenContacts: number): void {
    for (const cell of cells) {
      this.scanned.add(coordKey(cell));
      if (this.knowledge(cell) !== "unknown") {
        continue;
      }
      if (hiddenContacts > 0) {
        this.areaBonus.set(
          coordKey(cell),
          hiddenContacts * BONUS_PER_HIDDEN_CONTACT,
        );
      } else {
        this.setKnowledge(cell, "cleared");
      }
    }
  }

  /** The 3x3 center with the highest placement density over unscanned cells. */
  private bestScanCenter(): Coordinate {
    const density = super.placementDensity([]);
    let best: Coordinate[] = [{ x: 4, y: 4 }];
    let bestScore = -1;
    for (let y = 1; y < BOARD_SIZE - 1; y++) {
      for (let x = 1; x < BOARD_SIZE - 1; x++) {
        let score = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const cell = { x: x + dx, y: y + dy };
            if (
              isOnBoard(cell) &&
              !this.scanned.has(coordKey(cell)) &&
              this.knowledge(cell) === "unknown"
            ) {
              score += density[cell.y][cell.x];
            }
          }
        }
        if (score > bestScore) {
          bestScore = score;
          best = [{ x, y }];
        } else if (score === bestScore) {
          best.push({ x, y });
        }
      }
    }
    return pick(this.rng, best);
  }
}

export function createAdvancedAi(
  difficulty: Difficulty,
  rng: Rng,
): AdvancedAiPlayer {
  switch (difficulty) {
    case "easy":
      return new AdvancedEasyAi(rng);
    case "medium":
      return new AdvancedMediumAi(rng);
    case "hard":
      return new AdvancedHardAi(rng);
  }
}
