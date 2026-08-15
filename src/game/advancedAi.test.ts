import { AdvancedGame } from "./advanced";
import { AdvancedHardAi, AdvancedMediumAi } from "./advancedAi";
import { createRng } from "./rng";
import { ShipPlacement } from "./types";

function validFleet(): ShipPlacement[] {
  return [
    { bow: { x: 0, y: 0 }, length: 5, orientation: "horizontal" },
    { bow: { x: 0, y: 2 }, length: 4, orientation: "horizontal" },
    { bow: { x: 0, y: 4 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 6 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 8 }, length: 2, orientation: "horizontal" },
  ];
}

describe("Admiral mode AI", () => {
  it("medium fires first at a cell exposed by the opponent's sonar", () => {
    const game = new AdvancedGame([validFleet(), validFleet()], createRng(1));
    const ai = new AdvancedMediumAi(createRng(2));
    ai.noteRevealedEnemyCell({ x: 2, y: 4 }); // a cruiser cell
    const events = ai.takeTurn(game, 0);
    const shot = events.find((e) => e.kind === "shot");
    expect(shot).toBeDefined();
    if (shot?.kind === "shot") {
      expect(shot.target).toEqual({ x: 2, y: 4 });
      expect(shot.result.outcome).toBe("hit");
    }
  });

  it("hard fires first at a cell exposed by the opponent's sonar", () => {
    const game = new AdvancedGame([validFleet(), validFleet()], createRng(1));
    const ai = new AdvancedHardAi(createRng(2));
    ai.noteRevealedEnemyCell({ x: 0, y: 0 }); // a carrier cell
    const events = ai.takeTurn(game, 0);
    expect(events).toEqual([
      {
        kind: "shot",
        target: { x: 0, y: 0 },
        result: { outcome: "hit" },
      },
    ]);
  });

  it("hard immediately re-fires at a square where the submarine evaded", () => {
    const game = new AdvancedGame([validFleet(), validFleet()], createRng(1));
    const ai = new AdvancedHardAi(createRng(2));
    ai.noteRevealedEnemyCell({ x: 1, y: 6 }); // a submarine cell (stealthed)
    const first = ai.takeTurn(game, 0);
    expect(first[0]).toEqual({
      kind: "shot",
      target: { x: 1, y: 6 },
      result: { outcome: "evaded" },
    });
    game.fireShot(1, { x: 9, y: 9 });
    const second = ai.takeTurn(game, 0);
    expect(second[0]).toEqual({
      kind: "shot",
      target: { x: 1, y: 6 },
      result: { outcome: "hit" },
    });
  });
});
