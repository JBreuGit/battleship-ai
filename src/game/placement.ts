import { coordKey, isOnBoard, shipCells } from "./board";
import { Rng, pick, randomInt } from "./rng";
import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  Orientation,
  ShipPlacement,
} from "./types";

function blockedZone(cells: Coordinate[]): string[] {
  const keys: string[] = [];
  for (const { x, y } of cells) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(coordKey({ x: x + dx, y: y + dy }));
      }
    }
  }
  return keys;
}

/**
 * Whether `candidate` can be placed given the already-placed `others`:
 * fully on the board and neither overlapping nor touching any other ship.
 */
export function canPlaceShip(
  others: ShipPlacement[],
  candidate: ShipPlacement,
): boolean {
  const cells = shipCells(candidate);
  if (!cells.every(isOnBoard)) {
    return false;
  }
  const blocked = new Set<string>();
  for (const other of others) {
    for (const key of blockedZone(shipCells(other))) {
      blocked.add(key);
    }
  }
  return cells.every((cell) => !blocked.has(coordKey(cell)));
}

/**
 * Generate a random valid fleet: standard ships, on board, no overlap,
 * no touching. Retries from scratch in the rare case a fleet can't be
 * completed.
 */
export function randomFleet(rng: Rng): ShipPlacement[] {
  for (;;) {
    const placements: ShipPlacement[] = [];
    const blocked = new Set<string>();
    let failed = false;

    for (const length of FLEET_LENGTHS) {
      let placed = false;
      for (let attempt = 0; attempt < 200 && !placed; attempt++) {
        const orientation: Orientation = pick(rng, [
          "horizontal",
          "vertical",
        ] as const);
        const maxX =
          orientation === "horizontal" ? BOARD_SIZE - length : BOARD_SIZE;
        const maxY =
          orientation === "vertical" ? BOARD_SIZE - length : BOARD_SIZE;
        const placement: ShipPlacement = {
          bow: { x: randomInt(rng, maxX), y: randomInt(rng, maxY) },
          length,
          orientation,
        };
        const cells = shipCells(placement);
        if (
          cells.every(isOnBoard) &&
          cells.every((c) => !blocked.has(coordKey(c)))
        ) {
          placements.push(placement);
          for (const key of blockedZone(cells)) {
            blocked.add(key);
          }
          placed = true;
        }
      }
      if (!placed) {
        failed = true;
        break;
      }
    }

    if (!failed) {
      return placements;
    }
  }
}
