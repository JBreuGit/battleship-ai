export const BOARD_SIZE = 10;

export const FLEET_LENGTHS = [5, 4, 3, 3, 2] as const;

export type Orientation = "horizontal" | "vertical";

export interface Coordinate {
  /** Column index, 0-based, 0..9 */
  x: number;
  /** Row index, 0-based, 0..9 */
  y: number;
}

export interface ShipPlacement {
  bow: Coordinate;
  length: number;
  orientation: Orientation;
}

export interface Ship {
  id: number;
  cells: Coordinate[];
  hits: Set<string>;
}

export type FireOutcome = "hit" | "miss" | "sunk" | "fleet-sunk";

export interface FireResult {
  outcome: FireOutcome;
  /** The cells of the ship that was sunk by this shot, if any. */
  sunkShip?: Coordinate[];
}

export type PlacementError =
  | "out-of-bounds"
  | "overlap"
  | "touching"
  | "invalid-fleet";

export class InvalidPlacementError extends Error {
  constructor(public readonly reason: PlacementError) {
    super(`Invalid ship placement: ${reason}`);
    this.name = "InvalidPlacementError";
  }
}

export class InvalidShotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidShotError";
  }
}
