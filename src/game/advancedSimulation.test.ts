import { createAdvancedAi } from "./advancedAi";
import { Difficulty } from "./ai";
import { createRng } from "./rng";
import { playAdvancedGame } from "./simulate";

const GAMES_PER_DIFFICULTY = 200;

interface Stats {
  wins: number;
  games: number;
  /** Average number of turns the AI took in the games it won. */
  avgTurnsPerWin: number;
}

/**
 * Play full Admiral-mode games of the given difficulty against a purely
 * random opponent without abilities. Seats alternate so neither side
 * always has the first-move advantage.
 */
function simulate(difficulty: Difficulty, games: number): Stats {
  let wins = 0;
  let turnsInWins = 0;
  for (let game = 0; game < games; game++) {
    const rng = createRng(difficulty.length * 1_000_000 + game);
    const ai = createAdvancedAi(difficulty, rng);
    const outcome = playAdvancedGame(ai, rng, game % 2 === 0 ? 0 : 1);
    if (outcome.won) {
      wins++;
      turnsInWins += outcome.turns;
    }
  }
  return { wins, games, avgTurnsPerWin: turnsInWins / wins };
}

describe(`Admiral mode difficulty comparison over ${GAMES_PER_DIFFICULTY} full games each`, () => {
  const easy = simulate("easy", GAMES_PER_DIFFICULTY);
  const medium = simulate("medium", GAMES_PER_DIFFICULTY);
  const hard = simulate("hard", GAMES_PER_DIFFICULTY);

  console.log(
    `Admiral mode vs purely random opponent (${GAMES_PER_DIFFICULTY} games each):\n` +
      [
        ["easy", easy],
        ["medium", medium],
        ["hard", hard],
      ]
        .map(
          ([name, s]) =>
            `  ${String(name).padEnd(6)} wins: ${(s as Stats).wins}/${
              (s as Stats).games
            }, avg turns per win: ${(s as Stats).avgTurnsPerWin.toFixed(1)}`,
        )
        .join("\n"),
  );

  it("hard wins faster (fewer turns per win) than medium", () => {
    expect(hard.avgTurnsPerWin).toBeLessThan(medium.avgTurnsPerWin);
  });

  it("medium wins faster (fewer turns per win) than easy", () => {
    expect(medium.avgTurnsPerWin).toBeLessThan(easy.avgTurnsPerWin);
  });

  it("medium and hard beat a random opponent far more often than easy does", () => {
    expect(easy.wins).toBeGreaterThan(0);
    expect(medium.wins).toBeGreaterThan(easy.wins);
    expect(hard.wins).toBeGreaterThan(easy.wins);
    expect(medium.wins / medium.games).toBeGreaterThan(0.95);
    expect(hard.wins / hard.games).toBeGreaterThan(0.95);
  });
});
