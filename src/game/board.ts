import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  FireResult,
  InvalidPlacementError,
  InvalidShotError,
  Ship,
  ShipPlacement,
} from "./types";

export function coordKey({ x, y }: Coordinate): string {
  return `${x},${y}`;
}

export function isOnBoard({ x, y }: Coordinate): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < BOARD_SIZE &&
    y >= 0 &&
    y < BOARD_SIZE
  );
}

export function shipCells(placement: ShipPlacement): Coordinate[] {
  const { bow, length, orientation } = placement;
  return Array.from({ length }, (_, i) =>
    orientation === "horizontal"
      ? { x: bow.x + i, y: bow.y }
      : { x: bow.x, y: bow.y + i },
  );
}

function neighborsAndSelf({ x, y }: Coordinate): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      cells.push({ x: x + dx, y: y + dy });
    }
  }
  return cells;
}

function sameFleet(lengths: number[]): boolean {
  const expected = [...FLEET_LENGTHS].sort((a, b) => b - a);
  const actual = [...lengths].sort((a, b) => b - a);
  return (
    expected.length === actual.length &&
    expected.every((len, i) => len === actual[i])
  );
}

/**
 * A 10x10 Battleship board holding one fleet.
 *
 * Placement rules enforced at construction:
 * - the fleet must be exactly the standard ships (lengths 5, 4, 3, 3, 2)
 * - every ship must lie fully on the board
 * - ships may not overlap
 * - ships may not touch, not even diagonally
 */
export class Board {
  private readonly ships: Ship[];
  private readonly cellToShip = new Map<string, Ship>();
  private readonly shots = new Set<string>();

  constructor(placements: ShipPlacement[]) {
    if (!sameFleet(placements.map((p) => p.length))) {
      throw new InvalidPlacementError("invalid-fleet");
    }

    this.ships = placements.map((placement, id) => {
      const cells = shipCells(placement);
      if (!cells.every(isOnBoard)) {
        throw new InvalidPlacementError("out-of-bounds");
      }
      return { id, cells, hits: new Set<string>() };
    });

    const occupied = new Set<string>();
    const forbidden = new Set<string>();
    for (const ship of this.ships) {
      for (const cell of ship.cells) {
        const key = coordKey(cell);
        if (occupied.has(key)) {
          throw new InvalidPlacementError("overlap");
        }
        if (forbidden.has(key)) {
          throw new InvalidPlacementError("touching");
        }
        occupied.add(key);
        this.cellToShip.set(key, ship);
      }
      for (const cell of ship.cells) {
        for (const neighbor of neighborsAndSelf(cell)) {
          forbidden.add(coordKey(neighbor));
        }
      }
    }
  }

  /**
   * Fire at a square. Throws InvalidShotError for off-board targets or
   * squares that have already been fired at.
   */
  fire(target: Coordinate): FireResult {
    if (!isOnBoard(target)) {
      throw new InvalidShotError(
        `Shot (${target.x}, ${target.y}) is off the board`,
      );
    }
    const key = coordKey(target);
    if (this.shots.has(key)) {
      throw new InvalidShotError(
        `Square (${target.x}, ${target.y}) has already been fired at`,
      );
    }
    this.shots.add(key);

    const ship = this.cellToShip.get(key);
    if (!ship) {
      return { outcome: "miss" };
    }

    ship.hits.add(key);
    if (ship.hits.size < ship.cells.length) {
      return { outcome: "hit" };
    }

    const sunkShip = ship.cells.map((c) => ({ ...c }));
    return this.allSunk()
      ? { outcome: "fleet-sunk", sunkShip }
      : { outcome: "sunk", sunkShip };
  }

  hasBeenFiredAt(target: Coordinate): boolean {
    return this.shots.has(coordKey(target));
  }

  /** Fleet index (order of the constructor placements) of the ship at a cell, or null. */
  shipIdAt(target: Coordinate): number | null {
    return this.cellToShip.get(coordKey(target))?.id ?? null;
  }

  isShipSunk(id: number): boolean {
    const ship = this.ships[id];
    return ship !== undefined && ship.hits.size === ship.cells.length;
  }

  allSunk(): boolean {
    return this.ships.every((ship) => ship.hits.size === ship.cells.length);
  }

  /** Cells occupied by ships, for AI placement and rendering later. */
  occupiedCells(): Coordinate[] {
    return this.ships.flatMap((ship) => ship.cells.map((c) => ({ ...c })));
  }
}
