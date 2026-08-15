import { AiPlayer, Difficulty, createAi } from "./ai";
import { Board, coordKey } from "./board";
import { randomFleet } from "./placement";
import { createRng } from "./rng";
import { Coordinate, ShipPlacement } from "./types";

function fleetWithDestroyerAt(): ShipPlacement[] {
  return [
    { bow: { x: 0, y: 0 }, length: 5, orientation: "horizontal" },
    { bow: { x: 0, y: 2 }, length: 4, orientation: "horizontal" },
    { bow: { x: 0, y: 4 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 6 }, length: 3, orientation: "horizontal" },
    { bow: { x: 4, y: 8 }, length: 2, orientation: "horizontal" },
  ];
}

/** Let the AI play against a board until the fleet is sunk; return shots. */
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

describe.each(["easy", "medium", "hard"] as Difficulty[])(
  "%s AI basics",
  (difficulty) => {
    it("never fires at the same square twice and always sinks the fleet", () => {
      for (let seed = 0; seed < 5; seed++) {
        const rng = createRng(seed);
        const ai = createAi(difficulty, rng);
        const board = new Board(randomFleet(rng));
        const shots = playToCompletion(ai, board);
        const keys = shots.map(coordKey);
        expect(new Set(keys).size).toBe(keys.length);
        expect(board.allSunk()).toBe(true);
      }
    });
  },
);

describe.each(["medium", "hard"] as Difficulty[])(
  "%s AI hunting",
  (difficulty) => {
    it("fires next to a hit instead of guessing randomly", () => {
      const ai = createAi(difficulty, createRng(1));
      const board = new Board(fleetWithDestroyerAt());
      // Feed the AI a hit on the carrier at (2, 0).
      const hit = { x: 2, y: 0 };
      ai.notify(hit, board.fire(hit));

      const next = ai.nextShot();
      const distance = Math.abs(next.x - hit.x) + Math.abs(next.y - hit.y);
      expect(distance).toBe(1);
    });

    it("extends the line once two aligned hits are known", () => {
      const ai = createAi(difficulty, createRng(1));
      const board = new Board(fleetWithDestroyerAt());
      for (const cell of [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ]) {
        ai.notify(cell, board.fire(cell));
      }

      const next = ai.nextShot();
      expect(next.y).toBe(0);
      expect([1, 4]).toContain(next.x);
    });
  },
);

describe("hard AI deductions", () => {
  it("never fires adjacent to a sunk ship (ships cannot touch)", () => {
    const rng = createRng(7);
    const ai = createAi("hard", rng);
    const board = new Board(fleetWithDestroyerAt());

    // Sink the destroyer at (4,8)-(5,8) by feeding its cells directly.
    for (const cell of [
      { x: 4, y: 8 },
      { x: 5, y: 8 },
    ]) {
      ai.notify(cell, board.fire(cell));
    }

    const ring = new Set<string>();
    for (let x = 3; x <= 6; x++) {
      for (let y = 7; y <= 9; y++) {
        ring.add(coordKey({ x, y }));
      }
    }
    const shots = playToCompletion(ai, board);
    for (const shot of shots) {
      expect(ring.has(coordKey(shot))).toBe(false);
    }
  });
});
