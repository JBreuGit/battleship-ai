"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AbilityKind,
  AdvancedGame,
  ShotResult,
  barrageCells,
  scanArea,
  sonarArea,
} from "@/game/advanced";
import { AdvancedAiPlayer, TurnEvent, createAdvancedAi } from "@/game/advancedAi";
import { Difficulty } from "@/game/ai";
import { coordKey } from "@/game/board";
import { randomFleet } from "@/game/placement";
import { createRng } from "@/game/rng";
import { Coordinate, FLEET_LENGTHS, ShipPlacement } from "@/game/types";
import {
  CellMark,
  FleetStatus,
  ShotOverlay,
  Side,
  makeGrid,
  placementFromCells,
  wreckShipId,
} from "./BattleScreen";
import { BoardShell } from "./BoardShell";
import { ShipId, ShipOverlay } from "./ShipSprite";
import { SoundControls } from "./useSound";

type EnemyCell =
  | "fog"
  | "miss"
  | "hit"
  | "sunk"
  | "cleared"
  | "suspect"
  | "revealed"
  | "evaded";
type PlayerCell = "water" | "ship" | "miss" | "hit" | "sunk";
type TargetedAbility = "recon" | "sonar" | "barrage";

export interface AdmiralSession {
  fleet: ShipPlacement[];
  game: AdvancedGame;
  ai: AdvancedAiPlayer;
}

const PLAYER = 0 as const;
const ENEMY = 1 as const;

/** Build an Admiral-mode session from the player's fleet. */
export function createAdmiralSession(
  fleet: ShipPlacement[],
  difficulty: Difficulty,
): AdmiralSession {
  const rng = createRng(Math.floor(Math.random() * 2 ** 32));
  return {
    fleet,
    game: new AdvancedGame([fleet, randomFleet(rng)], rng),
    ai: createAdvancedAi(difficulty, rng),
  };
}

interface ShotFx {
  board: Side;
  cell: Coordinate;
  outcome: ShotResult["outcome"];
  seq: number;
}

interface ScanFx {
  board: Side;
  cells: Coordinate[];
  kind: "recon" | "sonar";
  seq: number;
}

const ABILITY_INFO: {
  kind: AbilityKind;
  label: string;
  ship: string;
  blurb: string;
}[] = [
  {
    kind: "recon",
    label: "Recon flight",
    ship: "Carrier",
    blurb: "Photograph 3×3 — reveals exact ship cells",
  },
  {
    kind: "barrage",
    label: "Main-gun barrage",
    ship: "Battleship",
    blurb: "Fire a 5-shell cross",
  },
  {
    kind: "sonar",
    label: "Active sonar",
    ship: "Cruiser",
    blurb: "Ping 5×5 — counts contacts, exposes one of your cells",
  },
  {
    kind: "rapid-fire",
    label: "Rapid fire",
    ship: "Destroyer",
    blurb: "Two shots this turn",
  },
];

const SHELL_FLIGHT = 420;
const BARRAGE_STEP = 480;
const AI_TURN_DELAY = 1000;
const AI_EVENT_STEP = 1100;
const GAME_OVER_DELAY = 1600;

export interface AdmiralBattleScreenProps {
  session: AdmiralSession;
  difficulty: Difficulty;
  sound: SoundControls;
  onPlayAgain: () => void;
}

export function AdmiralBattleScreen({
  session,
  difficulty,
  sound,
  onPlayAgain,
}: AdmiralBattleScreenProps) {
  const { game, ai } = session;
  const [enemyGrid, setEnemyGrid] = useState<EnemyCell[][]>(() =>
    makeGrid<EnemyCell>("fog"),
  );
  const [playerGrid, setPlayerGrid] = useState<PlayerCell[][]>(() => {
    const grid = makeGrid<PlayerCell>("water");
    for (const cell of game.board(PLAYER).occupiedCells()) {
      grid[cell.y][cell.x] = "ship";
    }
    return grid;
  });
  const [turn, setTurn] = useState<Side>("player");
  const [busy, setBusy] = useState(false);
  const [enemySunk, setEnemySunk] = useState<number[]>([]);
  const [playerSunk, setPlayerSunk] = useState<number[]>([]);
  const [enemyWrecks, setEnemyWrecks] = useState<ShipPlacement[]>([]);
  const [playerWrecks, setPlayerWrecks] = useState<ShipPlacement[]>([]);
  const [exposedOwnCells, setExposedOwnCells] = useState<string[]>([]);
  const [fx, setFx] = useState<ShotFx | null>(null);
  const [scanFx, setScanFx] = useState<ScanFx | null>(null);
  const [shake, setShake] = useState<{ board: Side; seq: number } | null>(
    null,
  );
  const [winner, setWinner] = useState<Side | null>(null);
  const [notice, setNotice] = useState<string | null>(
    "Admiral mode — each ship carries one special ability.",
  );
  const [arming, setArming] = useState<TargetedAbility | null>(null);
  /** True once the player has committed to rapid fire for this turn. */
  const [abilityLock, setAbilityLock] = useState(false);
  const [hoverCell, setHoverCell] = useState<Coordinate | null>(null);
  // Bumped after engine mutations so ability counts and stealth re-render.
  const [, setTick] = useState(0);

  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );

  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const markEnemy = useCallback((cells: Coordinate[], state: EnemyCell) => {
    setEnemyGrid((prev) => {
      const next = prev.map((row) => [...row]);
      for (const cell of cells) {
        next[cell.y][cell.x] = state;
      }
      return next;
    });
  }, []);

  const markEnemyIntel = useCallback(
    (cells: Coordinate[], state: "cleared" | "suspect" | "revealed") => {
      setEnemyGrid((prev) => {
        const next = prev.map((row) => [...row]);
        for (const cell of cells) {
          if (next[cell.y][cell.x] === "fog") {
            next[cell.y][cell.x] = state;
          }
        }
        return next;
      });
    },
    [],
  );

  /** Apply a resolved shot to the target side's grid, fx, and fleet status. */
  const applyShot = useCallback(
    (board: Side, target: Coordinate, result: ShotResult) => {
      seqRef.current += 1;
      setFx({ board, cell: target, outcome: result.outcome, seq: seqRef.current });

      if (result.outcome === "evaded") {
        sound.play("evaded");
        if (board === "enemy") {
          markEnemy([target], "evaded");
          setNotice("Torpedo wake — the enemy submarine slipped away! Fire there again.");
        } else {
          setNotice("Your submarine evaded the shot — silent running expended.");
        }
        refresh();
        return;
      }

      sound.play(
        result.outcome === "miss"
          ? "miss"
          : result.outcome === "hit"
            ? "hit"
            : "sunk",
      );
      const setGrid = board === "enemy" ? null : setPlayerGrid;
      if (board === "enemy") {
        markEnemy(
          result.outcome === "miss" || result.outcome === "hit"
            ? [target]
            : (result.sunkShip ?? [target]),
          result.outcome === "miss"
            ? "miss"
            : result.outcome === "hit"
              ? "hit"
              : "sunk",
        );
      } else if (setGrid) {
        setGrid((prev) => {
          const next = prev.map((row) => [...row]);
          if (result.outcome === "miss") {
            next[target.y][target.x] = "miss";
          } else if (result.outcome === "hit") {
            next[target.y][target.x] = "hit";
          } else {
            for (const cell of result.sunkShip ?? [target]) {
              next[cell.y][cell.x] = "sunk";
            }
          }
          return next;
        });
      }

      if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
        const wreck = result.sunkShip
          ? placementFromCells(result.sunkShip)
          : null;
        const setSunk = board === "enemy" ? setEnemySunk : setPlayerSunk;
        const setWrecks = board === "enemy" ? setEnemyWrecks : setPlayerWrecks;
        setSunk((prev) => {
          const next = [...prev, (result.sunkShip ?? []).length];
          if (board === "enemy" && next.length === FLEET_LENGTHS.length - 1) {
            setNotice("Final enemy ship afloat — finish her!");
          }
          return next;
        });
        if (wreck) {
          setWrecks((prev) => [...prev, wreck]);
        }
        setShake({ board, seq: seqRef.current });
      }
      refresh();
    },
    [markEnemy, refresh, sound],
  );

  const finishGame = useCallback(
    (won: boolean) => {
      later(GAME_OVER_DELAY, () => {
        setWinner(won ? "player" : "enemy");
        sound.play(won ? "victory" : "defeat");
      });
    },
    [later, sound],
  );

  /** Replay the AI's turn events with staggered timing, then hand back. */
  const replayAiTurn = useCallback(
    (events: TurnEvent[]) => {
      let t = 0;
      for (const event of events) {
        if (event.kind === "shot") {
          const { target, result } = event;
          later(t, () => sound.play("fire"));
          later(t + SHELL_FLIGHT, () => applyShot("player", target, result));
          t += AI_EVENT_STEP;
        } else if (event.kind === "rapid-fire") {
          later(t, () =>
            setNotice("Enemy destroyer signals rapid fire — two shells incoming!"),
          );
          t += 500;
        } else if (event.kind === "recon") {
          const { report } = event;
          later(t, () => {
            sound.play("recon");
            seqRef.current += 1;
            setScanFx({
              board: "player",
              cells: report.cells,
              kind: "recon",
              seq: seqRef.current,
            });
            const n = report.contacts.length;
            setNotice(
              n > 0
                ? `Enemy recon aircraft overhead — ${n} of your ship cell${n > 1 ? "s" : ""} photographed!`
                : "Enemy recon aircraft overhead — they photographed open water.",
            );
            refresh();
          });
          t += AI_EVENT_STEP;
        } else if (event.kind === "sonar") {
          const { report } = event;
          later(t, () => {
            sound.play("sonar");
            seqRef.current += 1;
            setScanFx({
              board: "player",
              cells: report.cells,
              kind: "sonar",
              seq: seqRef.current,
            });
            if (report.revealedOwnCell) {
              const revealed = report.revealedOwnCell;
              markEnemy([revealed], "revealed");
              setNotice(
                "Enemy sonar ping — the echo exposed one of THEIR ships on your plot!",
              );
            } else {
              setNotice("Enemy sonar ping sweeps your waters.");
            }
            refresh();
          });
          t += AI_EVENT_STEP;
        } else {
          const { report } = event;
          later(t, () => {
            setNotice("Enemy battleship opens up — full broadside barrage!");
            sound.play("fire");
          });
          report.shots.forEach(({ target, result }, i) => {
            later(t + 300 + i * BARRAGE_STEP, () => {
              if (i > 0) {
                sound.play("fire");
              }
              applyShot("player", target, result);
            });
          });
          t += 300 + report.shots.length * BARRAGE_STEP + 400;
        }
      }
      later(t, () => {
        if (game.winner !== null) {
          finishGame(game.winner === PLAYER);
          return;
        }
        setTurn("player");
        setAbilityLock(false);
        setBusy(false);
      });
    },
    [applyShot, finishGame, game, later, markEnemy, refresh, sound],
  );

  const startAiTurn = useCallback(() => {
    setTurn("enemy");
    later(AI_TURN_DELAY, () => {
      const events = ai.takeTurn(game, ENEMY);
      replayAiTurn(events);
    });
  }, [ai, game, later, replayAiTurn]);

  /** After a player action resolves: continue rapid fire, end, or hand off. */
  const afterPlayerAction = useCallback(
    (extraDelay: number) => {
      later(extraDelay, () => {
        if (game.winner !== null) {
          finishGame(game.winner === PLAYER);
          return;
        }
        if (game.currentTurn === PLAYER) {
          setNotice(`Rapid fire — ${game.shotsRemaining} shot(s) remaining.`);
          setBusy(false);
          return;
        }
        startAiTurn();
      });
    },
    [finishGame, game, later, startAiTurn],
  );

  const handleFire = useCallback(
    (cell: Coordinate) => {
      const result = game.fireShot(PLAYER, cell);
      setBusy(true);
      setNotice(null);
      sound.play("fire");
      later(SHELL_FLIGHT, () => applyShot("enemy", cell, result));
      afterPlayerAction(SHELL_FLIGHT + 500);
    },
    [afterPlayerAction, applyShot, game, later, sound],
  );

  const handleAbilityTarget = useCallback(
    (kind: TargetedAbility, center: Coordinate) => {
      setArming(null);
      setBusy(true);
      if (kind === "recon") {
        const report = game.useRecon(PLAYER, center);
        sound.play("recon");
        seqRef.current += 1;
        setScanFx({
          board: "enemy",
          cells: report.cells,
          kind: "recon",
          seq: seqRef.current,
        });
        later(900, () => {
          markEnemyIntel(report.contacts, "revealed");
          markEnemyIntel(report.cells, "cleared");
          const n = report.contacts.length;
          setNotice(
            n > 0
              ? `Recon photos: ${n} enemy ship cell${n > 1 ? "s" : ""} revealed — marked ◎ on the plot!`
              : "Recon photos developed — the area is clear.",
          );
        });
        afterPlayerAction(1400);
      } else if (kind === "sonar") {
        const report = game.useSonar(PLAYER, center);
        sound.play("sonar");
        seqRef.current += 1;
        setScanFx({
          board: "enemy",
          cells: report.cells,
          kind: "sonar",
          seq: seqRef.current,
        });
        if (report.revealedOwnCell) {
          const revealed = report.revealedOwnCell;
          ai.noteRevealedEnemyCell(revealed);
          setExposedOwnCells((prev) => [...prev, coordKey(revealed)]);
        }
        later(900, () => {
          markEnemyIntel(report.cells, report.contacts > 0 ? "suspect" : "cleared");
          setNotice(
            (report.contacts > 0
              ? `Sonar: ${report.contacts} contact echo${report.contacts > 1 ? "es" : ""} somewhere in the 5×5 area!`
              : "Sonar: the 5×5 area is clear.") +
              (report.revealedOwnCell
                ? " Your ping echoed — one of your ships is exposed."
                : ""),
          );
        });
        afterPlayerAction(1400);
      } else {
        const report = game.useBarrage(PLAYER, center);
        setNotice("Main guns — full barrage!");
        sound.play("fire");
        report.shots.forEach(({ target, result }, i) => {
          later(300 + i * BARRAGE_STEP, () => {
            if (i > 0) {
              sound.play("fire");
            }
            applyShot("enemy", target, result);
          });
        });
        afterPlayerAction(300 + report.shots.length * BARRAGE_STEP + 500);
      }
      refresh();
    },
    [afterPlayerAction, ai, applyShot, game, later, markEnemyIntel, refresh, sound],
  );

  const handleCellClick = useCallback(
    (cell: Coordinate) => {
      if (busy || winner || turn !== "player") {
        return;
      }
      if (arming) {
        handleAbilityTarget(arming, cell);
        return;
      }
      if (game.board(ENEMY).hasBeenFiredAt(cell)) {
        return;
      }
      handleFire(cell);
    },
    [arming, busy, game, handleAbilityTarget, handleFire, turn, winner],
  );

  const handleAbilityButton = useCallback(
    (kind: AbilityKind) => {
      if (
        busy ||
        winner ||
        abilityLock ||
        turn !== "player" ||
        !game.abilityAvailable(PLAYER, kind)
      ) {
        return;
      }
      if (kind === "rapid-fire") {
        setArming(null);
        game.useRapidFire(PLAYER);
        setAbilityLock(true);
        setNotice("Rapid fire armed — two shots this turn!");
        refresh();
        return;
      }
      setArming((prev) => (prev === kind ? null : kind));
      setNotice(
        kind === "barrage"
          ? "Barrage armed — pick the center of the cross."
          : kind === "recon"
            ? "Recon armed — pick the center of the 3×3 photo run."
            : "Sonar armed — pick the center of the 5×5 ping.",
      );
    },
    [abilityLock, busy, game, refresh, turn, winner],
  );

  const previewCells = new Set<string>(
    arming && hoverCell
      ? (arming === "barrage"
          ? barrageCells(hoverCell)
          : arming === "sonar"
            ? sonarArea(hoverCell)
            : scanArea(hoverCell)
        ).map(coordKey)
      : [],
  );

  const playerShots = game.shotsFired(PLAYER);
  const enemyShots = game.shotsFired(ENEMY);
  const rapidFireActive =
    turn === "player" && !winner && game.shotsRemaining > 1;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div
        className={`flex items-center gap-3 rounded-full border px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] ${
          turn === "player" && !winner
            ? "border-accent-400/70 text-accent-300"
            : "border-navy-line text-foam-400/80"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            winner
              ? "bg-foam-400/50"
              : turn === "player"
                ? "bg-accent-400 animate-pulse-soft"
                : "bg-ember-500 animate-pulse-soft"
          }`}
        />
        {winner
          ? "Engagement over"
          : turn === "player"
            ? rapidFireActive
              ? `Rapid fire — ${game.shotsRemaining} shots this turn`
              : "Your turn — fire, or use a ship's ability"
            : "Enemy is maneuvering…"}
      </div>

      <p
        aria-live="polite"
        className="min-h-[1.25rem] max-w-2xl text-center font-mono text-[11px] uppercase tracking-[0.15em] text-foam-300/90"
      >
        {notice ?? ""}
      </p>

      <AbilityBar
        game={game}
        arming={arming}
        disabled={busy || !!winner || abilityLock || turn !== "player"}
        onUse={handleAbilityButton}
      />

      <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
        <BoardShell
          title="Enemy waters"
          subtitle={`${difficulty} AI · your shots: ${playerShots}`}
          tone="navy"
        >
          <div
            key={shake?.board === "enemy" ? shake.seq : "steady"}
            className={`relative ${
              shake?.board === "enemy" ? "animate-board-shake" : ""
            }`}
          >
            <div
              className="grid grid-cols-10 rounded-sm border border-navy-line bg-navy-800"
              onPointerLeave={() => setHoverCell(null)}
            >
              {enemyGrid.flatMap((row, y) =>
                row.map((state, x) => {
                  const isFx =
                    fx?.board === "enemy" && fx.cell.x === x && fx.cell.y === y;
                  const inScan =
                    scanFx?.board === "enemy" &&
                    scanFx.cells.some((c) => c.x === x && c.y === y);
                  const fired = state === "miss" || state === "hit" || state === "sunk";
                  const clickable =
                    !busy && !winner && turn === "player" && (arming !== null || !fired);
                  const inPreview = previewCells.has(coordKey({ x, y }));
                  return (
                    <button
                      key={coordKey({ x, y })}
                      type="button"
                      aria-label={`Fire at ${String.fromCharCode(65 + x)}${y + 1}`}
                      disabled={!clickable}
                      onClick={() => handleCellClick({ x, y })}
                      onPointerEnter={() => setHoverCell({ x, y })}
                      className={`relative aspect-square border border-navy-line/60 ${
                        state === "sunk"
                          ? "bg-ember-700"
                          : state === "suspect"
                            ? "bg-accent-500/25"
                            : state === "cleared"
                              ? "bg-navy-900/80"
                              : state === "revealed"
                                ? "bg-ember-500/30"
                                : fired
                                  ? "bg-navy-900"
                                  : clickable
                                    ? "cursor-crosshair bg-navy-800 hover:bg-navy-700"
                                    : "bg-navy-800"
                      }`}
                    >
                      {inPreview && (
                        <span className="pointer-events-none absolute inset-0 z-40 border-2 border-accent-400 bg-accent-400/25" />
                      )}
                      <CellMark state={state} />
                      {state === "revealed" && (
                        <span className="absolute inset-0 z-20 flex items-center justify-center font-mono text-[10px] font-bold text-ember-400">
                          ◎
                        </span>
                      )}
                      {state === "evaded" && (
                        <span className="absolute inset-0 z-20 flex items-center justify-center font-mono text-[10px] font-bold text-foam-300">
                          ≈
                        </span>
                      )}
                      {isFx && fx.outcome !== "evaded" && (
                        <ShotOverlay key={fx.seq} outcome={fx.outcome} />
                      )}
                      {isFx && fx.outcome === "evaded" && (
                        <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                          <span className="animate-splash-ring h-full w-full rounded-full border-2 border-foam-300" />
                        </span>
                      )}
                      {inScan && (
                        <span
                          key={`scan-${scanFx.seq}`}
                          className={`animate-scan-pulse pointer-events-none absolute inset-0 z-30 ${
                            scanFx.kind === "sonar"
                              ? "bg-foam-300/45"
                              : "bg-accent-300/40"
                          }`}
                        />
                      )}
                    </button>
                  );
                }),
              )}
            </div>
            {enemyWrecks.map((wreck, i) => (
              <ShipOverlay
                key={i}
                shipId={wreckShipId(enemyWrecks, i)}
                placement={wreck}
                variant="sunk"
                className="pointer-events-none z-10 animate-fade-in opacity-90"
              />
            ))}
          </div>
        </BoardShell>

        <div className="flex flex-row gap-4 lg:flex-col lg:pt-10">
          <FleetStatus label="Enemy fleet" sunk={enemySunk} />
          <FleetStatus label="Your fleet" sunk={playerSunk} />
          <StealthStatus game={game} />
        </div>

        <BoardShell
          title="Your grid"
          subtitle={`enemy shots: ${enemyShots}`}
          tone="paper"
        >
          <div
            key={shake?.board === "player" ? shake.seq : "steady"}
            className={`relative ${
              shake?.board === "player" ? "animate-board-shake" : ""
            }`}
          >
            <div className="grid grid-cols-10 rounded-sm border border-paper-line bg-paper-200">
              {playerGrid.flatMap((row, y) =>
                row.map((state, x) => {
                  const isFx =
                    fx?.board === "player" &&
                    fx.cell.x === x &&
                    fx.cell.y === y;
                  const inScan =
                    scanFx?.board === "player" &&
                    scanFx.cells.some((c) => c.x === x && c.y === y);
                  const exposed = exposedOwnCells.includes(coordKey({ x, y }));
                  return (
                    <div
                      key={coordKey({ x, y })}
                      className="relative aspect-square border border-paper-line/50 bg-paper-200"
                    >
                      {exposed && state !== "hit" && state !== "sunk" && (
                        <span className="absolute inset-0 z-20 border-2 border-ember-500/80" />
                      )}
                      <CellMark state={state} />
                      {isFx && fx.outcome !== "evaded" && (
                        <ShotOverlay key={fx.seq} outcome={fx.outcome} />
                      )}
                      {isFx && fx.outcome === "evaded" && (
                        <span className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                          <span className="animate-splash-ring h-full w-full rounded-full border-2 border-foam-400" />
                        </span>
                      )}
                      {inScan && (
                        <span
                          key={`scan-${scanFx.seq}`}
                          className={`animate-scan-pulse pointer-events-none absolute inset-0 z-30 ${
                            scanFx.kind === "sonar"
                              ? "bg-foam-400/50"
                              : "bg-accent-400/45"
                          }`}
                        />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
            {session.fleet.map((placement, shipId) => (
              <ShipOverlay
                key={shipId}
                shipId={shipId as ShipId}
                placement={placement}
                className="pointer-events-none z-10"
              />
            ))}
            {playerWrecks.map((wreck, i) => (
              <ShipOverlay
                key={`wreck-${i}`}
                shipId={wreckShipId(playerWrecks, i)}
                placement={wreck}
                variant="sunk"
                className="pointer-events-none z-10 animate-fade-in"
              />
            ))}
          </div>
        </BoardShell>
      </div>

      {winner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/85 p-4 backdrop-blur-sm">
          <div className="animate-fade-in w-full max-w-sm rounded-lg border border-navy-line bg-navy-900 p-8 text-center shadow-[0_0_60px_rgba(255,150,51,0.15)]">
            <p
              className={`font-mono text-3xl font-bold uppercase tracking-[0.3em] ${
                winner === "player" ? "text-accent-400" : "text-ember-500"
              }`}
            >
              {winner === "player" ? "Victory" : "Defeat"}
            </p>
            <p className="mt-2 text-sm text-foam-400/80">
              {winner === "player"
                ? "Enemy fleet destroyed."
                : "Your fleet has been destroyed."}
            </p>
            <dl className="mt-6 grid grid-cols-2 gap-3 font-mono text-xs uppercase tracking-widest">
              <div className="rounded border border-navy-line bg-navy-800 p-3">
                <dt className="text-foam-400/60">Your shots</dt>
                <dd className="mt-1 text-xl text-accent-300">{playerShots}</dd>
              </div>
              <div className="rounded border border-navy-line bg-navy-800 p-3">
                <dt className="text-foam-400/60">Enemy shots</dt>
                <dd className="mt-1 text-xl text-accent-300">{enemyShots}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={onPlayAgain}
              className="mt-8 w-full rounded-md border border-accent-500 bg-accent-500/15 px-4 py-3 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-accent-300 transition-colors hover:bg-accent-500/30"
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AbilityBar({
  game,
  arming,
  disabled,
  onUse,
}: {
  game: AdvancedGame;
  arming: TargetedAbility | null;
  disabled: boolean;
  onUse: (kind: AbilityKind) => void;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-wrap items-stretch justify-center gap-2">
      {ABILITY_INFO.map(({ kind, label, ship, blurb }) => {
        const uses = game.usesLeft(PLAYER, kind);
        const available = !disabled && game.abilityAvailable(PLAYER, kind);
        const armed = arming === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={!available}
            onClick={() => onUse(kind)}
            aria-pressed={armed}
            className={`min-w-[9.5rem] flex-1 rounded border px-3 py-2 text-left transition-colors sm:flex-none ${
              armed
                ? "border-accent-400 bg-accent-500/20 text-accent-300"
                : available
                  ? "border-navy-line bg-navy-800 text-foam-300 hover:border-accent-400/60 hover:text-accent-300"
                  : "cursor-not-allowed border-navy-line bg-navy-900 text-foam-400/40"
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-widest">
                {label}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-80">
                ×{uses}
              </span>
            </span>
            <span className="mt-0.5 block text-[10px] opacity-70">
              {ship} — {blurb}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StealthStatus({ game }: { game: AdvancedGame }) {
  return (
    <div className="rounded-md border border-navy-line bg-navy-900/80 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-foam-400/70">
        Silent running
      </p>
      <ul className="flex flex-col gap-1 font-mono text-[10px] uppercase tracking-widest">
        <li className={game.stealthAvailable(PLAYER) ? "text-foam-300" : "text-foam-400/40"}>
          Your sub: {game.stealthAvailable(PLAYER) ? "ready" : "expended"}
        </li>
        <li className={game.stealthAvailable(ENEMY) ? "text-foam-300" : "text-foam-400/40"}>
          Enemy sub: {game.stealthAvailable(ENEMY) ? "ready" : "expended"}
        </li>
      </ul>
    </div>
  );
}
