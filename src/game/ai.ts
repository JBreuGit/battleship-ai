import { coordKey, isOnBoard } from "./board";
import { Rng, pick } from "./rng";
import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  FireResult,
  Orientation,
} from "./types";

export type Difficulty = "easy" | "medium" | "hard";

/**
 * What the AI knows about a square of the opponent's board:
 * - "unknown": not fired at
 * - "miss": fired, no ship
 * - "hit": fired, hit a ship that is not yet sunk
 * - "sunk": fired, part of a sunk ship
 * - "cleared": deduced empty (adjacent to a sunk ship — ships never touch)
 */
export type CellKnowledge =
  | "unknown"
  | "miss"
  | "hit"
  | "sunk"
  | "cleared";

export interface AiPlayer {
  readonly difficulty: Difficulty;
  /** Choose the next square to fire at. Never repeats a square. */
  nextShot(): Coordinate;
  /** Feed back the result of the shot so the AI can learn from it. */
  notify(target: Coordinate, result: FireResult): void;
}

const ORTHOGONAL = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

export abstract class BaseAi implements AiPlayer {
  abstract readonly difficulty: Difficulty;
  protected readonly grid: CellKnowledge[][];
  protected remainingLengths: number[] = [...FLEET_LENGTHS];

  constructor(protected readonly rng: Rng) {
    this.grid = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => "unknown" as CellKnowledge),
    );
  }

  abstract nextShot(): Coordinate;

  notify(target: Coordinate, result: FireResult): void {
    if (result.outcome === "miss") {
      this.grid[target.y][target.x] = "miss";
      return;
    }
    this.grid[target.y][target.x] = "hit";
    if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
      const cells = result.sunkShip ?? [target];
      for (const cell of cells) {
        this.grid[cell.y][cell.x] = "sunk";
      }
      const index = this.remainingLengths.indexOf(cells.length);
      if (index !== -1) {
        this.remainingLengths.splice(index, 1);
      }
      this.onShipSunk(cells);
    }
  }

  protected onShipSunk(_cells: Coordinate[]): void {}

  protected knowledge({ x, y }: Coordinate): CellKnowledge {
    return this.grid[y][x];
  }

  /** Record externally-deduced knowledge about a square. */
  protected setKnowledge({ x, y }: Coordinate, state: CellKnowledge): void {
    this.grid[y][x] = state;
  }

  protected cellsWhere(state: CellKnowledge): Coordinate[] {
    const cells: Coordinate[] = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (this.grid[y][x] === state) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  }

  protected randomUnknown(): Coordinate {
    return pick(this.rng, this.cellsWhere("unknown"));
  }
}

/** Easy: fires at a uniformly random square it has not tried before. */
export class EasyAi extends BaseAi {
  readonly difficulty = "easy";

  nextShot(): Coordinate {
    return this.randomUnknown();
  }
}

/**
 * Medium: hunts randomly, but once it hits a ship it targets the squares
 * next to its hits, extending the line once the orientation is known.
 */
export class MediumAi extends BaseAi {
  readonly difficulty = "medium";

  nextShot(): Coordinate {
    const hits = this.cellsWhere("hit");
    if (hits.length > 0) {
      const candidates = this.targetCandidates(hits);
      if (candidates.length > 0) {
        return pick(this.rng, candidates);
      }
    }
    return this.randomUnknown();
  }

  protected targetCandidates(hits: Coordinate[]): Coordinate[] {
    if (hits.length >= 2) {
      const inline = this.lineExtensions(hits);
      if (inline.length > 0) {
        return inline;
      }
    }
    const neighbors: Coordinate[] = [];
    for (const hit of hits) {
      for (const { dx, dy } of ORTHOGONAL) {
        const cell = { x: hit.x + dx, y: hit.y + dy };
        if (isOnBoard(cell) && this.knowledge(cell) === "unknown") {
          neighbors.push(cell);
        }
      }
    }
    return dedupe(neighbors);
  }

  /** If all current hits share a row or column, the ends of that line. */
  private lineExtensions(hits: Coordinate[]): Coordinate[] {
    const sameRow = hits.every((h) => h.y === hits[0].y);
    const sameCol = hits.every((h) => h.x === hits[0].x);
    if (!sameRow && !sameCol) {
      return [];
    }
    const axis: keyof Coordinate = sameRow ? "x" : "y";
    const values = hits.map((h) => h[axis]);
    const ends = [Math.min(...values) - 1, Math.max(...values) + 1];
    return ends
      .map((value) =>
        sameRow ? { x: value, y: hits[0].y } : { x: hits[0].x, y: value },
      )
      .filter((cell) => isOnBoard(cell) && this.knowledge(cell) === "unknown");
  }
}

/**
 * Hard: probability-density targeting. Every turn it enumerates all
 * placements of the remaining ships consistent with what it knows, and
 * fires at the square covered by the most placements. While a wounded
 * ship is on the board, only placements that explain the outstanding hits
 * are considered. It also exploits the no-touching rule by marking the
 * ring around every sunk ship as known-empty.
 */
export class HardAi extends BaseAi {
  readonly difficulty = "hard";

  nextShot(): Coordinate {
    const hits = this.cellsWhere("hit");
    const density = this.placementDensity(hits);
    let best: Coordinate[] = [];
    let bestScore = 0;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        if (this.grid[y][x] !== "unknown") {
          continue;
        }
        const score = density[y][x];
        if (score > bestScore) {
          bestScore = score;
          best = [{ x, y }];
        } else if (score === bestScore && score > 0) {
          best.push({ x, y });
        }
      }
    }
    return best.length > 0 ? pick(this.rng, best) : this.randomUnknown();
  }

  protected override onShipSunk(cells: Coordinate[]): void {
    for (const { x, y } of cells) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = { x: x + dx, y: y + dy };
          if (isOnBoard(cell) && this.knowledge(cell) === "unknown") {
            this.grid[cell.y][cell.x] = "cleared";
          }
        }
      }
    }
  }

  protected placementDensity(hits: Coordinate[]): number[][] {
    const density = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => 0),
    );
    const targeting = hits.length > 0;
    const hitKeys = new Set(hits.map(coordKey));

    for (const length of this.remainingLengths) {
      for (const orientation of ["horizontal", "vertical"] as const) {
        const maxX =
          orientation === "horizontal" ? BOARD_SIZE - length : BOARD_SIZE - 1;
        const maxY =
          orientation === "vertical" ? BOARD_SIZE - length : BOARD_SIZE - 1;
        for (let y = 0; y <= maxY; y++) {
          for (let x = 0; x <= maxX; x++) {
            const cells = this.placementCells({ x, y }, length, orientation);
            if (!this.isPossiblePlacement(cells)) {
              continue;
            }
            if (targeting && !cells.some((c) => hitKeys.has(coordKey(c)))) {
              continue;
            }
            for (const cell of cells) {
              if (this.knowledge(cell) === "unknown") {
                density[cell.y][cell.x] += 1;
              }
            }
          }
        }
      }
    }
    return density;
  }

  private placementCells(
    bow: Coordinate,
    length: number,
    orientation: Orientation,
  ): Coordinate[] {
    return Array.from({ length }, (_, i) =>
      orientation === "horizontal"
        ? { x: bow.x + i, y: bow.y }
        : { x: bow.x, y: bow.y + i },
    );
  }

  private isPossiblePlacement(cells: Coordinate[]): boolean {
    return cells.every((cell) => {
      const state = this.knowledge(cell);
      return state === "unknown" || state === "hit";
    });
  }
}

function dedupe(cells: Coordinate[]): Coordinate[] {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const key = coordKey(cell);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function createAi(difficulty: Difficulty, rng: Rng): AiPlayer {
  switch (difficulty) {
    case "easy":
      return new EasyAi(rng);
    case "medium":
      return new MediumAi(rng);
    case "hard":
      return new HardAi(rng);
  }
}
