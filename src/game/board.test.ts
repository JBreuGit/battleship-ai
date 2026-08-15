import { Board, shipCells, isOnBoard } from "./board";
import {
  BOARD_SIZE,
  FLEET_LENGTHS,
  InvalidPlacementError,
  InvalidShotError,
  ShipPlacement,
} from "./types";

/**
 * A valid standard fleet with at least one full row/column gap between ships:
 *
 *   y=0: carrier (5) at x=0..4
 *   y=2: battleship (4) at x=0..3
 *   y=4: cruiser (3) at x=0..2
 *   y=6: submarine (3) at x=0..2
 *   y=8: destroyer (2) at x=0..1
 */
function validFleet(): ShipPlacement[] {
  return [
    { bow: { x: 0, y: 0 }, length: 5, orientation: "horizontal" },
    { bow: { x: 0, y: 2 }, length: 4, orientation: "horizontal" },
    { bow: { x: 0, y: 4 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 6 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 8 }, length: 2, orientation: "horizontal" },
  ];
}

describe("board and fleet constants", () => {
  it("uses a 10x10 board", () => {
    expect(BOARD_SIZE).toBe(10);
    expect(isOnBoard({ x: 0, y: 0 })).toBe(true);
    expect(isOnBoard({ x: 9, y: 9 })).toBe(true);
    expect(isOnBoard({ x: 10, y: 0 })).toBe(false);
    expect(isOnBoard({ x: 0, y: 10 })).toBe(false);
    expect(isOnBoard({ x: -1, y: 0 })).toBe(false);
    expect(isOnBoard({ x: 0, y: -1 })).toBe(false);
  });

  it("uses the standard 5 ships (5, 4, 3, 3, 2)", () => {
    expect([...FLEET_LENGTHS]).toEqual([5, 4, 3, 3, 2]);
  });
});

describe("ship placement", () => {
  it("accepts a valid fleet", () => {
    expect(() => new Board(validFleet())).not.toThrow();
  });

  it("accepts vertical ships and ships along edges", () => {
    const fleet: ShipPlacement[] = [
      { bow: { x: 0, y: 0 }, length: 5, orientation: "vertical" },
      { bow: { x: 9, y: 0 }, length: 4, orientation: "vertical" },
      { bow: { x: 2, y: 0 }, length: 3, orientation: "vertical" },
      { bow: { x: 4, y: 7 }, length: 3, orientation: "vertical" },
      { bow: { x: 6, y: 9 }, length: 2, orientation: "horizontal" },
    ];
    expect(() => new Board(fleet)).not.toThrow();
  });

  it("rejects a ship hanging off the right edge", () => {
    const fleet = validFleet();
    fleet[0] = { bow: { x: 6, y: 0 }, length: 5, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(InvalidPlacementError);
    expect(() => new Board(fleet)).toThrow(/out-of-bounds/);
  });

  it("rejects a ship hanging off the bottom edge", () => {
    const fleet = validFleet();
    fleet[1] = { bow: { x: 7, y: 7 }, length: 4, orientation: "vertical" };
    expect(() => new Board(fleet)).toThrow(/out-of-bounds/);
  });

  it("rejects a ship starting off the board", () => {
    const fleet = validFleet();
    fleet[4] = { bow: { x: -1, y: 8 }, length: 2, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(/out-of-bounds/);
  });

  it("rejects overlapping ships", () => {
    const fleet = validFleet();
    // battleship crosses the carrier at (2, 0)
    fleet[1] = { bow: { x: 2, y: 0 }, length: 4, orientation: "vertical" };
    expect(() => new Board(fleet)).toThrow(InvalidPlacementError);
    expect(() => new Board(fleet)).toThrow(/overlap/);
  });

  it("rejects ships touching side by side", () => {
    const fleet = validFleet();
    // battleship directly below the carrier (y=1 touches y=0)
    fleet[1] = { bow: { x: 0, y: 1 }, length: 4, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(/touching/);
  });

  it("rejects ships touching end to end", () => {
    const fleet = validFleet();
    // battleship starts right after the carrier's stern on the same row
    fleet[1] = { bow: { x: 5, y: 0 }, length: 4, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(/touching/);
  });

  it("rejects ships touching diagonally", () => {
    const fleet = validFleet();
    // battleship's bow is diagonally adjacent to the carrier's stern (4,0)
    fleet[1] = { bow: { x: 5, y: 1 }, length: 4, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(/touching/);
  });

  it("accepts ships separated by exactly one empty cell", () => {
    const fleet = validFleet();
    // one full empty column between carrier (ends x=4) and destroyer at x=6
    fleet[4] = { bow: { x: 6, y: 0 }, length: 2, orientation: "horizontal" };
    expect(() => new Board(fleet)).not.toThrow();
  });

  it("rejects a fleet with the wrong number of ships", () => {
    expect(() => new Board(validFleet().slice(0, 4))).toThrow(/invalid-fleet/);
  });

  it("rejects a fleet with the wrong ship lengths", () => {
    const fleet = validFleet();
    fleet[4] = { bow: { x: 0, y: 8 }, length: 3, orientation: "horizontal" };
    expect(() => new Board(fleet)).toThrow(/invalid-fleet/);
  });
});

describe("firing", () => {
  it("reports a miss on an empty square", () => {
    const board = new Board(validFleet());
    expect(board.fire({ x: 9, y: 9 })).toEqual({ outcome: "miss" });
  });

  it("reports a hit on an occupied square without sinking", () => {
    const board = new Board(validFleet());
    expect(board.fire({ x: 0, y: 0 })).toEqual({ outcome: "hit" });
  });

  it("reports sunk on the shot that destroys a whole ship", () => {
    const board = new Board(validFleet());
    expect(board.fire({ x: 0, y: 8 })).toEqual({ outcome: "hit" });
    expect(board.fire({ x: 1, y: 8 })).toEqual({
      outcome: "sunk",
      sunkShip: [
        { x: 0, y: 8 },
        { x: 1, y: 8 },
      ],
    });
  });

  it("hits on one ship do not affect other ships", () => {
    const board = new Board(validFleet());
    board.fire({ x: 0, y: 8 }); // hit destroyer
    // sink the cruiser; destroyer's single hit must not count toward it
    board.fire({ x: 0, y: 4 });
    board.fire({ x: 1, y: 4 });
    expect(board.fire({ x: 2, y: 4 }).outcome).toBe("sunk");
    expect(board.allSunk()).toBe(false);
  });

  it("reports fleet-sunk on the final shot of the final ship", () => {
    const board = new Board(validFleet());
    const cells = board.occupiedCells();
    const last = cells[cells.length - 1];
    for (const cell of cells.slice(0, -1)) {
      const { outcome } = board.fire(cell);
      expect(outcome === "hit" || outcome === "sunk").toBe(true);
      expect(outcome).not.toBe("fleet-sunk");
    }
    expect(board.allSunk()).toBe(false);
    expect(board.fire(last).outcome).toBe("fleet-sunk");
    expect(board.allSunk()).toBe(true);
  });

  it("rejects firing at the same square twice", () => {
    const board = new Board(validFleet());
    board.fire({ x: 5, y: 5 });
    expect(() => board.fire({ x: 5, y: 5 })).toThrow(InvalidShotError);
    expect(() => board.fire({ x: 5, y: 5 })).toThrow(/already been fired at/);
  });

  it("rejects firing at the same occupied square twice", () => {
    const board = new Board(validFleet());
    expect(board.fire({ x: 0, y: 0 }).outcome).toBe("hit");
    expect(() => board.fire({ x: 0, y: 0 })).toThrow(InvalidShotError);
  });

  it("rejects firing off the board", () => {
    const board = new Board(validFleet());
    expect(() => board.fire({ x: -1, y: 0 })).toThrow(InvalidShotError);
    expect(() => board.fire({ x: 10, y: 0 })).toThrow(InvalidShotError);
    expect(() => board.fire({ x: 0, y: 10 })).toThrow(InvalidShotError);
  });

  it("tracks which squares have been fired at", () => {
    const board = new Board(validFleet());
    expect(board.hasBeenFiredAt({ x: 3, y: 3 })).toBe(false);
    board.fire({ x: 3, y: 3 });
    expect(board.hasBeenFiredAt({ x: 3, y: 3 })).toBe(true);
  });
});

describe("shipCells", () => {
  it("expands horizontal and vertical placements", () => {
    expect(
      shipCells({ bow: { x: 2, y: 3 }, length: 3, orientation: "horizontal" }),
    ).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ]);
    expect(
      shipCells({ bow: { x: 2, y: 3 }, length: 2, orientation: "vertical" }),
    ).toEqual([
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ]);
  });
});
