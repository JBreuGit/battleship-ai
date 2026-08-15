import { AiPlayer } from "./ai";
import { Board } from "./board";
import { randomFleet } from "./placement";
import { Rng } from "./rng";

export interface GameOutcome {
  winner: "a" | "b";
  /** Shots each player fired before the game ended. */
  aShots: number;
  bShots: number;
}

/**
 * Play one full game: players alternate shots at each other's board until
 * one sinks the entire opposing fleet. Player A fires first.
 */
export function playGame(
  playerA: AiPlayer,
  playerB: AiPlayer,
  rng: Rng,
): GameOutcome {
  const boardForA = new Board(randomFleet(rng)); // A fires at this
  const boardForB = new Board(randomFleet(rng)); // B fires at this

  let aShots = 0;
  let bShots = 0;
  for (;;) {
    const aTarget = playerA.nextShot();
    const aResult = boardForA.fire(aTarget);
    playerA.notify(aTarget, aResult);
    aShots++;
    if (aResult.outcome === "fleet-sunk") {
      return { winner: "a", aShots, bShots };
    }

    const bTarget = playerB.nextShot();
    const bResult = boardForB.fire(bTarget);
    playerB.notify(bTarget, bResult);
    bShots++;
    if (bResult.outcome === "fleet-sunk") {
      return { winner: "b", aShots, bShots };
    }
  }
}
