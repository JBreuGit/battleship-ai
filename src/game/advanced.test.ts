import {
  ABILITY_SHIP,
  AdvancedGame,
  AdvancedRuleError,
  INITIAL_USES,
  PlayerId,
  SHIP_CLASSES,
} from "./advanced";
import { shipCells } from "./board";
import { createRng } from "./rng";
import { Coordinate, ShipPlacement } from "./types";

/**
 * Same fixture fleet as board.test.ts:
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

/** Cells guaranteed empty on the fixture fleet (odd rows have no ships). */
function emptyCells(): Coordinate[] {
  const cells: Coordinate[] = [];
  for (const y of [1, 3, 5, 7, 9]) {
    for (let x = 0; x < 10; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function newGame(seed = 1): AdvancedGame {
  return new AdvancedGame([validFleet(), validFleet()], createRng(seed));
}

/** Fire a guaranteed miss for `player` to hand the turn back. */
function makeMissers(): (game: AdvancedGame, player: PlayerId) => void {
  const remaining: [Coordinate[], Coordinate[]] = [emptyCells(), emptyCells()];
  return (game, player) => {
    const target = remaining[player].shift();
    if (!target) {
      throw new Error("ran out of empty cells");
    }
    expect(game.fireShot(player, target).outcome).toBe("miss");
  };
}

describe("Admiral mode: turns and shots", () => {
  it("starts with player 0 and alternates after each shot", () => {
    const game = newGame();
    expect(game.currentTurn).toBe(0);
    game.fireShot(0, { x: 9, y: 9 });
    expect(game.currentTurn).toBe(1);
    game.fireShot(1, { x: 9, y: 9 });
    expect(game.currentTurn).toBe(0);
  });

  it("rejects acting out of turn", () => {
    const game = newGame();
    expect(() => game.fireShot(1, { x: 9, y: 9 })).toThrow(AdvancedRuleError);
    expect(() => game.useRecon(1, { x: 5, y: 5 })).toThrow(AdvancedRuleError);
  });

  it("rejects off-board and repeated shots", () => {
    const game = newGame();
    expect(() => game.fireShot(0, { x: 10, y: 0 })).toThrow(AdvancedRuleError);
    game.fireShot(0, { x: 9, y: 9 });
    game.fireShot(1, { x: 9, y: 9 });
    expect(() => game.fireShot(0, { x: 9, y: 9 })).toThrow(AdvancedRuleError);
  });

  it("hits without sinking keep normal outcomes", () => {
    const game = newGame();
    expect(game.fireShot(0, { x: 0, y: 0 }).outcome).toBe("hit");
    expect(game.fireShot(1, { x: 0, y: 2 }).outcome).toBe("hit");
  });

  it("declares a winner when the whole fleet is sunk and blocks further play", () => {
    const game = newGame();
    const miss = makeMissers();
    const targets = validFleet().flatMap(shipCells);
    for (const target of targets) {
      let result = game.fireShot(0, target);
      if (result.outcome === "evaded") {
        miss(game, 1);
        result = game.fireShot(0, target);
      }
      expect(["hit", "sunk", "fleet-sunk"]).toContain(result.outcome);
      if (game.winner === null) {
        miss(game, 1);
      }
    }
    expect(game.winner).toBe(0);
    expect(() => game.fireShot(1, { x: 9, y: 9 })).toThrow(AdvancedRuleError);
    expect(() => game.fireShot(0, { x: 9, y: 9 })).toThrow(AdvancedRuleError);
  });
});

describe("Admiral mode: carrier recon flight", () => {
  it("reveals the exact ship cells of a 3x3 area without dealing damage", () => {
    const game = newGame();
    // Area centered at (1,1) covers carrier cells (0,0),(1,0),(2,0)
    // and battleship cells (0,2),(1,2),(2,2).
    const report = game.useRecon(0, { x: 1, y: 1 });
    expect(report.cells).toHaveLength(9);
    const keys = report.contacts.map(({ x, y }) => `${x},${y}`).sort();
    expect(keys).toEqual(["0,0", "0,2", "1,0", "1,2", "2,0", "2,2"]);
    expect(game.board(1).hasBeenFiredAt({ x: 1, y: 1 })).toBe(false);
    expect(game.currentTurn).toBe(1);
  });

  it("clips the scanned area at board edges", () => {
    const game = newGame();
    const report = game.useRecon(0, { x: 9, y: 9 });
    expect(report.cells).toHaveLength(4);
    expect(report.contacts).toEqual([]);
  });

  it("is limited to its initial number of uses", () => {
    const game = newGame();
    const miss = makeMissers();
    for (let i = 0; i < INITIAL_USES.recon; i++) {
      game.useRecon(0, { x: 5, y: 5 });
      miss(game, 1);
    }
    expect(game.usesLeft(0, "recon")).toBe(0);
    expect(game.abilityAvailable(0, "recon")).toBe(false);
    expect(() => game.useRecon(0, { x: 5, y: 5 })).toThrow(AdvancedRuleError);
  });

  it("is forfeited once the carrier is sunk", () => {
    const game = newGame();
    const miss = makeMissers();
    // Player 1 sinks player 0's carrier at (0..4, 0).
    for (let x = 0; x < 5; x++) {
      miss(game, 0);
      game.fireShot(1, { x, y: 0 });
    }
    expect(game.shipAfloat(0, "carrier")).toBe(false);
    expect(game.abilityAvailable(0, "recon")).toBe(false);
    expect(() => game.useRecon(0, { x: 5, y: 5 })).toThrow(AdvancedRuleError);
  });
});

describe("Admiral mode: cruiser active sonar", () => {
  it("counts contacts in a 5x5 area and reveals one of the pinger's own un-hit ship cells", () => {
    const game = newGame();
    const ownCells = new Set(
      game
        .board(0)
        .occupiedCells()
        .map(({ x, y }) => `${x},${y}`),
    );
    // 5x5 centered at (1,0) covers carrier cells x=0..3 at y=0 and
    // battleship cells x=0..3 at y=2.
    const report = game.useSonar(0, { x: 1, y: 0 });
    expect(report.cells).toHaveLength(12);
    expect(report.contacts).toBe(8);
    expect(report.revealedOwnCell).not.toBeNull();
    const revealed = report.revealedOwnCell!;
    expect(ownCells.has(`${revealed.x},${revealed.y}`)).toBe(true);
    expect(game.currentTurn).toBe(1);
  });

  it("reports no contacts over open water", () => {
    const game = newGame();
    const report = game.useSonar(0, { x: 7, y: 8 });
    expect(report.contacts).toBe(0);
  });
});

describe("Admiral mode: submarine silent running", () => {
  it("evades the first would-be hit and leaves the square targetable", () => {
    const game = newGame();
    const miss = makeMissers();
    const subCell = { x: 1, y: 6 };
    expect(game.fireShot(0, subCell).outcome).toBe("evaded");
    expect(game.currentTurn).toBe(1); // the evaded shot still costs the turn
    expect(game.board(1).hasBeenFiredAt(subCell)).toBe(false);
    miss(game, 1);
    expect(game.fireShot(0, subCell).outcome).toBe("hit");
  });

  it("only triggers once per match", () => {
    const game = newGame();
    const miss = makeMissers();
    expect(game.fireShot(0, { x: 0, y: 6 }).outcome).toBe("evaded");
    miss(game, 1);
    expect(game.fireShot(0, { x: 1, y: 6 }).outcome).toBe("hit");
    expect(game.stealthAvailable(1)).toBe(false);
  });

  it("does not trigger on cells the attacker has sonar-pinged", () => {
    const game = newGame();
    const miss = makeMissers();
    game.useSonar(0, { x: 1, y: 6 }); // pings the sub's area
    miss(game, 1);
    expect(game.fireShot(0, { x: 1, y: 6 }).outcome).toBe("hit");
    expect(game.stealthAvailable(1)).toBe(true); // stealth not consumed
  });

  it("each side has its own silent running charge", () => {
    const game = newGame();
    expect(game.fireShot(0, { x: 0, y: 6 }).outcome).toBe("evaded");
    expect(game.fireShot(1, { x: 0, y: 6 }).outcome).toBe("evaded");
    expect(game.stealthAvailable(0)).toBe(false);
    expect(game.stealthAvailable(1)).toBe(false);
  });
});

describe("Admiral mode: battleship barrage", () => {
  it("fires a 5-cell cross in one action", () => {
    const game = newGame();
    // Cross centered on (1,2): hits battleship at (0,2),(1,2),(2,2),
    // misses at (1,1),(1,3).
    const report = game.useBarrage(0, { x: 1, y: 2 });
    expect(report.shots).toHaveLength(5);
    expect(report.skipped).toHaveLength(0);
    const outcomes = report.shots.map((s) => s.result.outcome);
    expect(outcomes.filter((o) => o === "hit")).toHaveLength(3);
    expect(outcomes.filter((o) => o === "miss")).toHaveLength(2);
    expect(game.currentTurn).toBe(1);
  });

  it("skips off-board and already-fired cells", () => {
    const game = newGame();
    game.fireShot(0, { x: 9, y: 8 });
    game.fireShot(1, { x: 9, y: 9 });
    const report = game.useBarrage(0, { x: 9, y: 9 });
    // Pattern (9,9),(10,9),(8,9),(9,10),(9,8): two off-board, one repeat.
    expect(report.skipped).toHaveLength(3);
    expect(report.shots).toHaveLength(2);
  });

  it("has a single use per match", () => {
    const game = newGame();
    const miss = makeMissers();
    expect(INITIAL_USES.barrage).toBe(1);
    game.useBarrage(0, { x: 5, y: 5 });
    miss(game, 1);
    expect(() => game.useBarrage(0, { x: 7, y: 7 })).toThrow(
      AdvancedRuleError,
    );
  });

  it("can sink the last ship and win mid-barrage", () => {
    const game = newGame();
    const miss = makeMissers();
    // Sink everything except the destroyer at (0,8),(1,8).
    const targets = validFleet().slice(0, 4).flatMap(shipCells);
    for (const target of targets) {
      let result = game.fireShot(0, target);
      if (result.outcome === "evaded") {
        miss(game, 1);
        result = game.fireShot(0, target);
      }
      miss(game, 1);
    }
    const report = game.useBarrage(0, { x: 1, y: 8 });
    const last = report.shots[report.shots.length - 1];
    expect(last.result.outcome).toBe("fleet-sunk");
    expect(game.winner).toBe(0);
  });
});

describe("Admiral mode: destroyer rapid fire", () => {
  it("grants two shots in a single turn", () => {
    const game = newGame();
    game.useRapidFire(0);
    expect(game.shotsRemaining).toBe(2);
    game.fireShot(0, { x: 9, y: 9 });
    expect(game.currentTurn).toBe(0);
    game.fireShot(0, { x: 8, y: 9 });
    expect(game.currentTurn).toBe(1);
    expect(game.usesLeft(0, "rapid-fire")).toBe(INITIAL_USES["rapid-fire"] - 1);
  });

  it("cannot be stacked or combined with another ability in the same turn", () => {
    const game = newGame();
    game.useRapidFire(0);
    expect(() => game.useRapidFire(0)).toThrow(AdvancedRuleError);
    expect(() => game.useRecon(0, { x: 5, y: 5 })).toThrow(AdvancedRuleError);
  });

  it("ends the game immediately if the first shot wins", () => {
    const game = newGame();
    const miss = makeMissers();
    const targets = validFleet().flatMap(shipCells);
    // Sink all but the last cell.
    for (const target of targets.slice(0, -1)) {
      let result = game.fireShot(0, target);
      if (result.outcome === "evaded") {
        miss(game, 1);
        result = game.fireShot(0, target);
      }
      miss(game, 1);
    }
    game.useRapidFire(0);
    const result = game.fireShot(0, targets[targets.length - 1]);
    expect(result.outcome).toBe("fleet-sunk");
    expect(game.winner).toBe(0);
    expect(() => game.fireShot(0, { x: 9, y: 9 })).toThrow(AdvancedRuleError);
  });
});

describe("Admiral mode: ability bookkeeping", () => {
  it("maps every ability to a ship class and starts with the agreed uses", () => {
    expect(SHIP_CLASSES).toEqual([
      "carrier",
      "battleship",
      "cruiser",
      "submarine",
      "destroyer",
    ]);
    expect(ABILITY_SHIP).toEqual({
      recon: "carrier",
      barrage: "battleship",
      sonar: "cruiser",
      "rapid-fire": "destroyer",
    });
    expect(INITIAL_USES).toEqual({
      recon: 2,
      barrage: 1,
      sonar: 2,
      "rapid-fire": 2,
    });
  });

  it("tracks shots fired per player, counting each barrage cell", () => {
    const game = newGame();
    game.fireShot(0, { x: 9, y: 9 });
    game.fireShot(1, { x: 9, y: 9 });
    game.useBarrage(0, { x: 5, y: 5 });
    expect(game.shotsFired(0)).toBe(6);
    expect(game.shotsFired(1)).toBe(1);
  });
});
