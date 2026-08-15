import { Difficulty, createAi } from "./ai";
import { createRng } from "./rng";
import { playGame } from "./simulate";

const GAMES_PER_DIFFICULTY = 200;

interface Stats {
  wins: number;
  games: number;
  /** Average number of shots the AI fired in the games it won. */
  avgShotsPerWin: number;
}

/**
 * Play full games of the given difficulty against a purely random opponent
 * (the easy AI fires uniformly at random). Seats alternate so neither side
 * always has the first-move advantage.
 */
function simulate(difficulty: Difficulty, games: number): Stats {
  let wins = 0;
  let shotsInWins = 0;
  for (let game = 0; game < games; game++) {
    const rng = createRng(difficulty.length * 100_000 + game);
    const ai = createAi(difficulty, rng);
    const randomOpponent = createAi("easy", rng);

    const aiPlaysFirst = game % 2 === 0;
    const outcome = aiPlaysFirst
      ? playGame(ai, randomOpponent, rng)
      : playGame(randomOpponent, ai, rng);
    const aiSeat = aiPlaysFirst ? "a" : "b";
    if (outcome.winner === aiSeat) {
      wins++;
      shotsInWins += aiSeat === "a" ? outcome.aShots : outcome.bShots;
    }
  }
  return { wins, games, avgShotsPerWin: shotsInWins / wins };
}

describe(`difficulty comparison over ${GAMES_PER_DIFFICULTY} full games each`, () => {
  const easy = simulate("easy", GAMES_PER_DIFFICULTY);
  const medium = simulate("medium", GAMES_PER_DIFFICULTY);
  const hard = simulate("hard", GAMES_PER_DIFFICULTY);

  // eslint-disable-next-line no-console
  console.log(
    `Simulation vs purely random opponent (${GAMES_PER_DIFFICULTY} games each):\n` +
      [
        ["easy", easy],
        ["medium", medium],
        ["hard", hard],
      ]
        .map(
          ([name, s]) =>
            `  ${String(name).padEnd(6)} wins: ${(s as Stats).wins}/${
              (s as Stats).games
            }, avg shots per win: ${(s as Stats).avgShotsPerWin.toFixed(1)}`,
        )
        .join("\n"),
  );

  it("hard wins faster (fewer shots per win) than medium", () => {
    expect(hard.avgShotsPerWin).toBeLessThan(medium.avgShotsPerWin);
  });

  it("medium wins faster (fewer shots per win) than easy", () => {
    expect(medium.avgShotsPerWin).toBeLessThan(easy.avgShotsPerWin);
  });

  it("medium and hard beat a random opponent far more often than easy does", () => {
    expect(easy.wins).toBeGreaterThan(0);
    expect(medium.wins).toBeGreaterThan(easy.wins);
    expect(hard.wins).toBeGreaterThan(easy.wins);
    // Easy is itself random, so it should win roughly half its games.
    expect(easy.wins / easy.games).toBeGreaterThan(0.3);
    expect(easy.wins / easy.games).toBeLessThan(0.7);
    // The hunting AIs should almost never lose to a random opponent.
    expect(medium.wins / medium.games).toBeGreaterThan(0.95);
    expect(hard.wins / hard.games).toBeGreaterThan(0.95);
  });

  it("hard is noticeably more efficient than medium (>= 15% fewer shots)", () => {
    expect(hard.avgShotsPerWin).toBeLessThan(medium.avgShotsPerWin * 0.85);
  });
});
