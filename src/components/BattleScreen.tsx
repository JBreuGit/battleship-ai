"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiPlayer, Difficulty, createAi } from "@/game/ai";
import { Board, coordKey } from "@/game/board";
import { randomFleet } from "@/game/placement";
import { createRng } from "@/game/rng";
import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  FireOutcome,
  ShipPlacement,
} from "@/game/types";
import { BoardShell } from "./BoardShell";
import { SoundControls } from "./useSound";

type EnemyCell = "fog" | "miss" | "hit" | "sunk";
type PlayerCell = "water" | "ship" | "miss" | "hit" | "sunk";
type Side = "player" | "enemy";

export interface Session {
  playerBoard: Board;
  enemyBoard: Board;
  ai: AiPlayer;
}

/** Build a battle session from the player's fleet; call from an event handler. */
export function createSession(
  fleet: ShipPlacement[],
  difficulty: Difficulty,
): Session {
  const rng = createRng(Math.floor(Math.random() * 2 ** 32));
  return {
    playerBoard: new Board(fleet),
    enemyBoard: new Board(randomFleet(rng)),
    ai: createAi(difficulty, rng),
  };
}

interface ShotFx {
  board: Side;
  cell: Coordinate;
  outcome: FireOutcome;
  seq: number;
}

export interface BattleScreenProps {
  session: Session;
  difficulty: Difficulty;
  sound: SoundControls;
  onPlayAgain: () => void;
}

function makeGrid<T>(fill: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => fill),
  );
}

const AI_TURN_DELAY = 1000;
const GAME_OVER_DELAY = 1400;

export function BattleScreen({
  session,
  difficulty,
  sound,
  onPlayAgain,
}: BattleScreenProps) {
  const [enemyGrid, setEnemyGrid] = useState<EnemyCell[][]>(() =>
    makeGrid<EnemyCell>("fog"),
  );
  const [playerGrid, setPlayerGrid] = useState<PlayerCell[][]>(() => {
    const grid = makeGrid<PlayerCell>("water");
    for (const cell of session.playerBoard.occupiedCells()) {
      grid[cell.y][cell.x] = "ship";
    }
    return grid;
  });
  const [turn, setTurn] = useState<Side>("player");
  const [busy, setBusy] = useState(false);
  const [playerShots, setPlayerShots] = useState(0);
  const [enemyShots, setEnemyShots] = useState(0);
  const [enemySunk, setEnemySunk] = useState<number[]>([]);
  const [playerSunk, setPlayerSunk] = useState<number[]>([]);
  const [fx, setFx] = useState<ShotFx | null>(null);
  const [shake, setShake] = useState<{ board: Side; seq: number } | null>(
    null,
  );
  const [winner, setWinner] = useState<Side | null>(null);

  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shotsRef = useRef({ player: 0, enemy: 0 });

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );

  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

  const soundFor = useCallback(
    (outcome: FireOutcome) =>
      outcome === "miss" ? "miss" : outcome === "hit" ? "hit" : "sunk",
    [],
  );

  const aiTurn = useCallback(() => {
    const { ai, playerBoard } = session;
    const target = ai.nextShot();
    const result = playerBoard.fire(target);
    ai.notify(target, result);
    shotsRef.current.enemy += 1;
    setEnemyShots(shotsRef.current.enemy);

    setPlayerGrid((prev) => {
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
    seqRef.current += 1;
    setFx({
      board: "player",
      cell: target,
      outcome: result.outcome,
      seq: seqRef.current,
    });
    sound.play(soundFor(result.outcome));
    if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
      setPlayerSunk((prev) => [...prev, (result.sunkShip ?? []).length]);
      setShake({ board: "player", seq: seqRef.current });
    }

    if (result.outcome === "fleet-sunk") {
      later(GAME_OVER_DELAY, () => {
        setWinner("enemy");
        sound.play("defeat");
      });
      return;
    }
    later(600, () => {
      setTurn("player");
      setBusy(false);
    });
  }, [later, session, sound, soundFor]);

  const handleFire = useCallback(
    (cell: Coordinate) => {
      if (busy || winner || turn !== "player") {
        return;
      }
      const { enemyBoard } = session;
      if (enemyBoard.hasBeenFiredAt(cell)) {
        return;
      }
      const result = enemyBoard.fire(cell);
      shotsRef.current.player += 1;
      setPlayerShots(shotsRef.current.player);

      setEnemyGrid((prev) => {
        const next = prev.map((row) => [...row]);
        if (result.outcome === "miss") {
          next[cell.y][cell.x] = "miss";
        } else if (result.outcome === "hit") {
          next[cell.y][cell.x] = "hit";
        } else {
          for (const c of result.sunkShip ?? [cell]) {
            next[c.y][c.x] = "sunk";
          }
        }
        return next;
      });
      seqRef.current += 1;
      setFx({
        board: "enemy",
        cell,
        outcome: result.outcome,
        seq: seqRef.current,
      });
      sound.play(soundFor(result.outcome));
      if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
        setEnemySunk((prev) => [...prev, (result.sunkShip ?? []).length]);
        setShake({ board: "enemy", seq: seqRef.current });
      }

      if (result.outcome === "fleet-sunk") {
        setBusy(true);
        later(GAME_OVER_DELAY, () => {
          setWinner("player");
          sound.play("victory");
        });
        return;
      }
      setBusy(true);
      later(AI_TURN_DELAY / 2, () => setTurn("enemy"));
      later(AI_TURN_DELAY, aiTurn);
    },
    [aiTurn, busy, later, session, sound, soundFor, turn, winner],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6">
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
            ? "Your turn — fire at the enemy grid"
            : "Enemy is firing…"}
      </div>

      <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
        <BoardShell
          title="Enemy waters"
          subtitle={`${difficulty} AI · your shots: ${playerShots}`}
          tone="navy"
        >
          <div
            key={shake?.board === "enemy" ? shake.seq : "steady"}
            className={`grid grid-cols-10 rounded-sm border border-navy-line bg-navy-800 ${
              shake?.board === "enemy" ? "animate-board-shake" : ""
            }`}
          >
            {enemyGrid.flatMap((row, y) =>
              row.map((state, x) => {
                const isFx =
                  fx?.board === "enemy" && fx.cell.x === x && fx.cell.y === y;
                const clickable = state === "fog" && !busy && !winner;
                return (
                  <button
                    key={coordKey({ x, y })}
                    type="button"
                    aria-label={`Fire at ${String.fromCharCode(65 + x)}${y + 1}`}
                    disabled={!clickable}
                    onClick={() => handleFire({ x, y })}
                    className={`relative aspect-square border border-navy-line/60 ${
                      state === "fog"
                        ? clickable
                          ? "cursor-crosshair bg-navy-800 hover:bg-navy-700"
                          : "bg-navy-800"
                        : state === "sunk"
                          ? "bg-ember-700"
                          : "bg-navy-900"
                    }`}
                  >
                    <CellMark state={state} />
                    {isFx && <ShotOverlay key={fx.seq} outcome={fx.outcome} />}
                  </button>
                );
              }),
            )}
          </div>
        </BoardShell>

        <div className="flex flex-row gap-4 lg:flex-col lg:pt-10">
          <FleetStatus label="Enemy fleet" sunk={enemySunk} />
          <FleetStatus label="Your fleet" sunk={playerSunk} />
        </div>

        <BoardShell
          title="Your grid"
          subtitle={`enemy shots: ${enemyShots}`}
          tone="paper"
        >
          <div
            key={shake?.board === "player" ? shake.seq : "steady"}
            className={`grid grid-cols-10 rounded-sm border border-paper-line bg-paper-200 ${
              shake?.board === "player" ? "animate-board-shake" : ""
            }`}
          >
            {playerGrid.flatMap((row, y) =>
              row.map((state, x) => {
                const isFx =
                  fx?.board === "player" && fx.cell.x === x && fx.cell.y === y;
                return (
                  <div
                    key={coordKey({ x, y })}
                    className={`relative aspect-square border border-paper-line/50 ${
                      state === "ship"
                        ? "bg-navy-700"
                        : state === "hit"
                          ? "bg-navy-700"
                          : state === "sunk"
                            ? "bg-ember-700"
                            : "bg-paper-200"
                    }`}
                  >
                    <CellMark state={state} />
                    {isFx && <ShotOverlay key={fx.seq} outcome={fx.outcome} />}
                  </div>
                );
              }),
            )}
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

function CellMark({ state }: { state: EnemyCell | PlayerCell }) {
  if (state === "miss") {
    return (
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="h-[22%] w-[22%] rounded-full bg-foam-400/80" />
      </span>
    );
  }
  if (state === "hit" || state === "sunk") {
    return (
      <span
        className={`absolute inset-0 flex items-center justify-center font-bold ${
          state === "sunk" ? "text-navy-950" : "text-ember-500"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" aria-hidden>
          <path
            d="M5 5 L19 19 M19 5 L5 19"
            stroke="currentColor"
            strokeWidth="3.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  return null;
}

function ShotOverlay({ outcome }: { outcome: FireOutcome }) {
  if (outcome === "miss") {
    return (
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="animate-splash-ring h-full w-full rounded-full border-2 border-foam-300" />
      </span>
    );
  }
  const sunk = outcome !== "hit";
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className={`animate-hit-burst animate-hit-glow h-full w-full rounded-sm ${
          sunk ? "animate-sunk-flash bg-ember-500/70" : "bg-accent-500/60"
        }`}
      />
    </span>
  );
}

function FleetStatus({ label, sunk }: { label: string; sunk: number[] }) {
  const remaining = [...sunk];
  return (
    <div className="rounded-md border border-navy-line bg-navy-900/80 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-foam-400/70">
        {label}
      </p>
      <ul className="flex flex-col gap-1.5">
        {FLEET_LENGTHS.map((length, i) => {
          const sunkIndex = remaining.indexOf(length);
          const isSunk = sunkIndex !== -1;
          if (isSunk) {
            remaining.splice(sunkIndex, 1);
          }
          return (
            <li key={i} className="flex gap-[2px]">
              {Array.from({ length }, (_, j) => (
                <span
                  key={j}
                  className={`h-2 w-2 rounded-[1px] ${
                    isSunk ? "bg-ember-700" : "bg-foam-400/50"
                  }`}
                />
              ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
