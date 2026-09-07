import { act, fireEvent, render, screen } from "@testing-library/react";
import { AdvancedGame } from "@/game/advanced";
import { AdvancedAiPlayer, TurnEvent } from "@/game/advancedAi";
import { coordKey, shipCells } from "@/game/board";
import { RemoteGame } from "@/game/client";
import { Coordinate, ShipPlacement } from "@/game/types";
import { createFakeServer } from "@/test/fakeGameServer";
import { AdmiralBattleScreen } from "./AdmiralBattleScreen";
import { BattleScreen, FleetStatus } from "./BattleScreen";
import { SoundControls } from "./useSoundManager";

const client = vi.hoisted(() => ({
  sendAction: vi.fn(),
}));

vi.mock("@/game/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/game/client")>()),
  sendAction: client.sendAction,
}));

/** A legal fleet: rows 0/2/4/6/8, bows at the left edge. */
function testFleet(): ShipPlacement[] {
  return [
    { bow: { x: 0, y: 0 }, length: 5, orientation: "horizontal" },
    { bow: { x: 0, y: 2 }, length: 4, orientation: "horizontal" },
    { bow: { x: 0, y: 4 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 6 }, length: 3, orientation: "horizontal" },
    { bow: { x: 0, y: 8 }, length: 2, orientation: "horizontal" },
  ];
}

function fleetCells(fleet: ShipPlacement[]): Coordinate[] {
  return fleet.flatMap(shipCells);
}

/** Columns 6-9 hold no ships in the test fleet. */
function waterCells(): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 6; x < 10; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/** A scripted AI that fires plain shots at a fixed list of squares. */
class ScriptedAi implements AdvancedAiPlayer {
  readonly difficulty = "easy" as const;
  readonly targets: Coordinate[] = [];
  private index = 0;
  constructor(private readonly script: Coordinate[]) {}
  takeTurn(game: AdvancedGame, me: 0 | 1): TurnEvent[] {
    const target = this.script[this.index++];
    this.targets.push(target);
    const result = game.fireShot(me, target);
    return [{ kind: "shot", target, result }];
  }
  noteRevealedEnemyCell(): void {}
}

const silentSound: SoundControls = {
  enabled: false,
  toggle: () => {},
  play: () => {},
  voice: () => {},
};

/** Start a match on the fake server with a scripted enemy; wires sendAction. */
async function startMatch(
  mode: "classic" | "admiral",
  ai: ScriptedAi,
): Promise<{ game: RemoteGame; server: ReturnType<typeof createFakeServer> }> {
  const server = createFakeServer({ enemyFleet: testFleet(), ai });
  client.sendAction.mockImplementation(server.sendAction);
  const game = await server.startGame({
    mode,
    difficulty: "easy",
    fleet: testFleet(),
  });
  return { game, server };
}

function fireButton(cell: Coordinate): HTMLElement {
  return screen.getByRole("button", {
    name: `Fire at ${String.fromCharCode(65 + cell.x)}${cell.y + 1}`,
  });
}

/** Click a square, let the (async) server reply land, then run the timers. */
async function clickAndSettle(cell: Coordinate, settleMs: number) {
  fireEvent.click(fireButton(cell));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(settleMs);
  });
}

describe("full classic games", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    client.sendAction.mockReset();
  });

  it("plays a full game the human wins, with strict turn alternation", { timeout: 30_000 }, async () => {
    const ai = new ScriptedAi(waterCells());
    const { game } = await startMatch("classic", ai);
    const onPlayAgain = vi.fn();
    render(
      <BattleScreen
        session={game}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={onPlayAgain}
      />,
    );

    const targets = fleetCells(testFleet());
    for (const [i, cell] of targets.entries()) {
      await clickAndSettle(cell, 2000);
      const expectedEnemyShots = Math.min(i + 1, targets.length - 1);
      expect(
        screen.getByText(`enemy shots: ${expectedEnemyShots}`),
      ).toBeInTheDocument();
    }

    expect(screen.getByText("Victory")).toBeInTheDocument();
    // Exactly one shot per side per round — no extra turns for anyone.
    expect(screen.getByText("17")).toBeInTheDocument(); // your shots
    expect(screen.getByText("16")).toBeInTheDocument(); // enemy shots
    // The AI never fired at the same square twice.
    const keys = ai.targets.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);

    fireEvent.click(screen.getByRole("button", { name: /play again/i }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it("plays a full game the computer wins", { timeout: 30_000 }, async () => {
    const ai = new ScriptedAi(fleetCells(testFleet()));
    const { game, server } = await startMatch("classic", ai);
    render(
      <BattleScreen
        session={game}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );

    // The player fires only at water while the AI dismantles the fleet.
    for (const cell of waterCells().slice(0, 17)) {
      await clickAndSettle(cell, 3000);
      if (screen.queryByText("Defeat")) {
        break;
      }
    }

    expect(screen.getByText("Defeat")).toBeInTheDocument();
    const keys = ai.targets.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ai.targets).toHaveLength(17);
    const live = server.liveOf(game);
    expect(live.game.board(0).allSunk()).toBe(true);
    expect(live.game.board(1).allSunk()).toBe(false);
  });

  it("ignores clicks while the enemy turn is resolving", async () => {
    const { game } = await startMatch("classic", new ScriptedAi(waterCells()));
    render(
      <BattleScreen
        session={game}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );

    fireEvent.click(fireButton({ x: 9, y: 9 }));
    // Rapid extra clicks before the AI's reply lands must all be ignored.
    fireEvent.click(fireButton({ x: 8, y: 9 }));
    fireEvent.click(fireButton({ x: 7, y: 9 }));
    fireEvent.click(fireButton({ x: 9, y: 9 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(client.sendAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/your shots: 1/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByText(/your shots: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy shots: 1/i)).toBeInTheDocument();
    expect(client.sendAction).toHaveBeenCalledTimes(1);
  });

  it("never hands the browser the enemy fleet", async () => {
    const { game } = await startMatch("classic", new ScriptedAi(waterCells()));
    render(
      <BattleScreen
        session={game}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );
    await clickAndSettle({ x: 9, y: 9 }, 2000);

    // Everything the component ever received: the session and each reply.
    const seen = JSON.stringify([
      game,
      ...(await Promise.all(client.sendAction.mock.results.map((r) => r.value))),
    ]);
    // Only the player's own fleet (echoed back in each `game`) and the two
    // resolved shots carry coordinates; there is no enemy placement, board,
    // AI, or seed anywhere in what the browser holds.
    const messages = 1 + client.sendAction.mock.results.length;
    expect(seen.match(/"bow"/g)).toHaveLength(5 * messages);
    for (const forbidden of ["enemyBoard", "seed", "ships", '"ai"', "hits"]) {
      expect(seen).not.toContain(forbidden);
    }
    expect(seen).toContain('"outcome":"miss"');
  });
});

describe("fleet status readout", () => {
  it("crosses off exactly the ship that sank, not another of the same length", () => {
    // Fleet index 3 is the submarine — one of the two length-3 ships.
    render(<FleetStatus label="Your fleet" sunk={[3]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[2].className).not.toContain("opacity-70");
    expect(rows[3].className).toContain("opacity-70");
  });
});

describe("full Admiral game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    client.sendAction.mockReset();
  });

  it("plays to a human victory through the enemy submarine's evasion", { timeout: 30_000 }, async () => {
    const ai = new ScriptedAi(waterCells());
    const { game, server } = await startMatch("admiral", ai);
    render(
      <AdmiralBattleScreen
        session={game}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );

    // The first shot on the enemy submarine is evaded; the square stays
    // targetable, so sinking the whole fleet takes 18 shots.
    const subFirstCell = { x: 0, y: 6 };
    const targets = [subFirstCell, ...fleetCells(testFleet())];
    for (const cell of targets) {
      await clickAndSettle(cell, 6000);
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(screen.getByText("Victory")).toBeInTheDocument();
    const live = server.liveOf(game);
    expect(live.game.winner).toBe(0);
    expect(live.game.shotsFired(0)).toBe(18);
    expect(live.game.shotsFired(1)).toBe(17);
    const keys = ai.targets.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
