import { act, fireEvent, render, screen } from "@testing-library/react";
import { AiPlayer } from "@/game/ai";
import { AdvancedGame } from "@/game/advanced";
import { AdvancedAiPlayer, TurnEvent } from "@/game/advancedAi";
import { Board, coordKey, shipCells } from "@/game/board";
import { createRng } from "@/game/rng";
import { Coordinate, FireResult, ShipPlacement } from "@/game/types";
import { AdmiralBattleScreen, AdmiralSession } from "./AdmiralBattleScreen";
import { BattleScreen, FleetStatus, Session } from "./BattleScreen";
import { SoundControls } from "./useSoundManager";

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

/** A scripted classic AI that fires a fixed list of squares in order. */
class ScriptedAi implements AiPlayer {
  readonly difficulty = "easy" as const;
  readonly targets: Coordinate[] = [];
  private index = 0;
  constructor(private readonly script: Coordinate[]) {}
  nextShot(): Coordinate {
    const target = this.script[this.index++];
    this.targets.push(target);
    return target;
  }
  notify(_target: Coordinate, _result: FireResult): void {}
}

const silentSound: SoundControls = {
  enabled: false,
  toggle: () => {},
  play: () => {},
};

function fireButton(cell: Coordinate): HTMLElement {
  return screen.getByRole("button", {
    name: `Fire at ${String.fromCharCode(65 + cell.x)}${cell.y + 1}`,
  });
}

function clickAndSettle(cell: Coordinate, settleMs: number): void {
  fireEvent.click(fireButton(cell));
  act(() => {
    vi.advanceTimersByTime(settleMs);
  });
}

describe("full classic games", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("plays a full game the human wins, with strict turn alternation", { timeout: 30_000 }, () => {
    const fleet = testFleet();
    const ai = new ScriptedAi(waterCells());
    const session: Session = {
      fleet,
      playerBoard: new Board(fleet),
      enemyBoard: new Board(testFleet()),
      ai,
    };
    const onPlayAgain = vi.fn();
    render(
      <BattleScreen
        session={session}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={onPlayAgain}
      />,
    );

    const targets = fleetCells(fleet);
    targets.forEach((cell, i) => {
      clickAndSettle(cell, 2000);
      const expectedEnemyShots = Math.min(i + 1, targets.length - 1);
      expect(
        screen.getByText(`enemy shots: ${expectedEnemyShots}`),
      ).toBeInTheDocument();
    });

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

  it("plays a full game the computer wins", { timeout: 30_000 }, () => {
    const fleet = testFleet();
    const ai = new ScriptedAi(fleetCells(fleet));
    const session: Session = {
      fleet,
      playerBoard: new Board(fleet),
      enemyBoard: new Board(testFleet()),
      ai,
    };
    render(
      <BattleScreen
        session={session}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );

    // The player fires only at water while the AI dismantles the fleet.
    for (const cell of waterCells().slice(0, 17)) {
      clickAndSettle(cell, 3000);
      if (screen.queryByText("Defeat")) {
        break;
      }
    }

    expect(screen.getByText("Defeat")).toBeInTheDocument();
    const keys = ai.targets.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ai.targets).toHaveLength(17);
    expect(session.playerBoard.allSunk()).toBe(true);
    expect(session.enemyBoard.allSunk()).toBe(false);
  });

  it("ignores clicks while the enemy turn is resolving", () => {
    const fleet = testFleet();
    const session: Session = {
      fleet,
      playerBoard: new Board(fleet),
      enemyBoard: new Board(testFleet()),
      ai: new ScriptedAi(waterCells()),
    };
    render(
      <BattleScreen
        session={session}
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
    expect(screen.getByText(/your shots: 1/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText(/your shots: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/enemy shots: 1/i)).toBeInTheDocument();
  });
});

/** A scripted Admiral AI that fires plain shots at a fixed list of squares. */
class ScriptedAdmiralAi implements AdvancedAiPlayer {
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
  });

  it("plays to a human victory through the enemy submarine's evasion", { timeout: 30_000 }, () => {
    const fleet = testFleet();
    const ai = new ScriptedAdmiralAi(waterCells());
    const session: AdmiralSession = {
      fleet,
      game: new AdvancedGame([fleet, testFleet()], createRng(7)),
      ai,
    };
    render(
      <AdmiralBattleScreen
        session={session}
        difficulty="easy"
        sound={silentSound}
        onPlayAgain={() => {}}
      />,
    );

    // The first shot on the enemy submarine is evaded; the square stays
    // targetable, so sinking the whole fleet takes 18 shots.
    const subFirstCell = { x: 0, y: 6 };
    const targets = [subFirstCell, ...fleetCells(fleet)];
    for (const cell of targets) {
      clickAndSettle(cell, 6000);
    }
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Victory")).toBeInTheDocument();
    expect(session.game.winner).toBe(0);
    expect(session.game.shotsFired(0)).toBe(18);
    expect(session.game.shotsFired(1)).toBe(17);
    const keys = ai.targets.map(coordKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
