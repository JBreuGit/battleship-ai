import { AdvancedGame, PlayerId } from "./advanced";
import { AdvancedAiPlayer } from "./advancedAi";
import { AiPlayer } from "./ai";
import { Board } from "./board";
import { randomFleet } from "./placement";
import { Rng, pick } from "./rng";
import { BOARD_SIZE, Coordinate } from "./types";

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

export interface AdvancedGameOutcome {
  won: boolean;
  /** Turns the tested AI took before the game ended. */
  turns: number;
}

const MAX_TURNS = 400;

/**
 * Play one full Admiral-mode game: the tested AI (with abilities) against
 * a purely random shooter that never uses abilities. `aiSeat` controls who
 * fires first.
 */
export function playAdvancedGame(
  ai: AdvancedAiPlayer,
  rng: Rng,
  aiSeat: PlayerId,
): AdvancedGameOutcome {
  const game = new AdvancedGame([randomFleet(rng), randomFleet(rng)], rng);
  const dummySeat: PlayerId = aiSeat === 0 ? 1 : 0;

  let turns = 0;
  for (;;) {
    if (game.currentTurn === aiSeat) {
      ai.takeTurn(game, aiSeat);
      turns++;
    } else {
      game.fireShot(dummySeat, randomUntriedCell(game, aiSeat, rng));
    }
    if (game.winner !== null) {
      return { won: game.winner === aiSeat, turns };
    }
    if (turns >= MAX_TURNS) {
      return { won: false, turns };
    }
  }
}

function randomUntriedCell(
  game: AdvancedGame,
  targetPlayer: PlayerId,
  rng: Rng,
): Coordinate {
  const board = game.board(targetPlayer);
  const candidates: Coordinate[] = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!board.hasBeenFiredAt({ x, y })) {
        candidates.push({ x, y });
      }
    }
  }
  return pick(rng, candidates);
}
