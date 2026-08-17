"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AiPlayer, Difficulty, createAi } from "@/game/ai";
import { ShipClassId, WeaponTier, weaponTierInfo } from "@/game/campaign";
import { createCampaignAi } from "@/game/campaignAi";
import { Board, coordKey, isOnBoard, shipCells } from "@/game/board";
import { randomFleet } from "@/game/placement";
import { createRng } from "@/game/rng";
import {
  BOARD_SIZE,
  Coordinate,
  FLEET_LENGTHS,
  FireOutcome,
  FireResult,
  Orientation,
  ShipPlacement,
} from "@/game/types";
import { BoardShell } from "./BoardShell";
import { GameOverModal } from "./GameOverModal";
import { PLAYERS, PlayerId } from "./PlayerBadge";
import { CALLSIGNS, Scoreboard } from "./PlayerAvatar";
import { ShipId, ShipOverlay, ShipSprite } from "./ShipSprite";
import {
  DamageSmoke,
  ExplosionEffect,
  SHIP_NAMES,
  SplashEffect,
  SunkBanner,
  SunkCallout,
  SunkExplosions,
  WreckSmoke,
} from "./ShotEffects";
import { PlayVariant, SoundControls } from "./useSoundManager";

type EnemyCell = "fog" | "miss" | "hit" | "sunk";
export type PlayerCell = "water" | "ship" | "miss" | "hit" | "sunk";
export type Side = "player" | "enemy";

export interface Session {
  fleet: ShipPlacement[];
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
    fleet,
    playerBoard: new Board(fleet),
    enemyBoard: new Board(randomFleet(rng)),
    ai: createAi(difficulty, rng),
  };
}

/** Build a campaign battle session against the level-scaled Devin AI. */
export function createCampaignSession(
  fleet: ShipPlacement[],
  level: number,
): Session {
  const rng = createRng(Math.floor(Math.random() * 2 ** 32));
  return {
    fleet,
    playerBoard: new Board(fleet),
    enemyBoard: new Board(randomFleet(rng)),
    ai: createCampaignAi(level, rng),
  };
}

export function placementFromCells(cells: Coordinate[]): ShipPlacement {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const orientation: Orientation =
    sorted.length > 1 && sorted[1].x !== sorted[0].x
      ? "horizontal"
      : "vertical";
  return { bow: sorted[0], length: sorted.length, orientation };
}

/** A sunk ship: its fleet index (for the right hull art) and footprint. */
export interface Wreck {
  shipId: ShipId;
  placement: ShipPlacement;
}

interface ShotFx {
  board: Side;
  cell: Coordinate;
  outcome: FireOutcome;
  seq: number;
}

interface SunkFx {
  board: Side;
  cells: Coordinate[];
  seq: number;
}

/** Campaign context for a battle: level, fleet weapon tiers, and outcome sink. */
export interface CampaignBattleConfig {
  level: number;
  upgrades: Record<ShipClassId, WeaponTier>;
  onResult: (won: boolean) => void;
}

/** Beefier cannon-fire renditions per weapon tier (tier 1 = stock sound). */
const FIRE_VARIANTS: Record<WeaponTier, PlayVariant | undefined> = {
  1: undefined,
  2: { rate: 1.12, layers: 2 },
  3: { rate: 0.72, gainMul: 1.2, layers: 2 },
  4: { rate: 0.88, gainMul: 1.15, layers: 3 },
};

export interface BattleScreenProps {
  session: Session;
  difficulty: Difficulty;
  sound: SoundControls;
  onPlayAgain: () => void;
  campaign?: CampaignBattleConfig;
  /** Label for the game-over button (defaults to "Play again"). */
  playAgainLabel?: string;
}

export function makeGrid<T>(fill: T): T[][] {
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
  campaign,
  playAgainLabel,
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
  const [enemyWrecks, setEnemyWrecks] = useState<Wreck[]>([]);
  const [playerWrecks, setPlayerWrecks] = useState<Wreck[]>([]);
  const [fx, setFx] = useState<ShotFx | null>(null);
  const [sunkFx, setSunkFx] = useState<SunkFx | null>(null);
  const [callout, setCallout] = useState<SunkCallout | null>(null);
  const [shake, setShake] = useState<{
    board: Side;
    kind: "hit" | "sunk";
    seq: number;
  } | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  /** Ship classes whose once-per-battle special has been fired. */
  const [usedSpecials, setUsedSpecials] = useState<ShipClassId[]>([]);
  /** Heavy-shell special armed and waiting for a target cell. */
  const [heavyArmed, setHeavyArmed] = useState<ShipClassId | null>(null);
  const extraShotRef = useRef(false);

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
    sound.play("fire");
    later(260, () => {
      sound.play(soundFor(result.outcome));
      if (result.outcome !== "miss") {
        sound.voice("devin", result.outcome === "hit" ? "hit" : "sunk");
      }
    });
    if (result.outcome === "hit") {
      setShake({ board: "player", kind: "hit", seq: seqRef.current });
    }
    if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
      const shipId = (playerBoard.shipIdAt(target) ?? 0) as ShipId;
      setPlayerSunk((prev) => [...prev, shipId]);
      if (result.sunkShip) {
        const placement = placementFromCells(result.sunkShip);
        setPlayerWrecks((prev) => [...prev, { shipId, placement }]);
        setSunkFx({
          board: "player",
          cells: result.sunkShip,
          seq: seqRef.current,
        });
      }
      setCallout({ shipId, attacker: "devin", seq: seqRef.current });
      setShake({ board: "player", kind: "sunk", seq: seqRef.current });
    }

    if (result.outcome === "fleet-sunk") {
      later(GAME_OVER_DELAY, () => {
        setWinner("enemy");
        sound.play("defeat");
        campaign?.onResult(false);
      });
      return;
    }
    later(600, () => {
      setTurn("player");
      setBusy(false);
      sound.play("turn");
    });
  }, [campaign, later, session, sound, soundFor]);

  /** Apply one player shot's result to the enemy grid, fx, and wreck state. */
  const applyPlayerShot = useCallback(
    (cell: Coordinate, result: FireResult) => {
      const { enemyBoard } = session;
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
      later(260, () => {
        sound.play(soundFor(result.outcome));
        if (result.outcome !== "miss") {
          sound.voice("navy", result.outcome === "hit" ? "hit" : "sunk");
        }
      });
      if (result.outcome === "hit") {
        setShake({ board: "enemy", kind: "hit", seq: seqRef.current });
      }
      if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
        const shipId = (enemyBoard.shipIdAt(cell) ?? 0) as ShipId;
        setEnemySunk((prev) => [...prev, shipId]);
        if (result.sunkShip) {
          const placement = placementFromCells(result.sunkShip);
          setEnemyWrecks((prev) => [...prev, { shipId, placement }]);
          setSunkFx({
            board: "enemy",
            cells: result.sunkShip,
            seq: seqRef.current,
          });
        }
        setCallout({ shipId, attacker: "dutch", seq: seqRef.current });
        setShake({ board: "enemy", kind: "sunk", seq: seqRef.current });
      }
    },
    [later, session, sound, soundFor],
  );

  /** Hand the turn over (or end the game) after the player's salvo. */
  const finishPlayerTurn = useCallback(
    (fleetSunk: boolean) => {
      if (fleetSunk) {
        setBusy(true);
        later(GAME_OVER_DELAY, () => {
          setWinner("player");
          sound.play("victory");
          campaign?.onResult(true);
        });
        return;
      }
      if (extraShotRef.current) {
        extraShotRef.current = false;
        return;
      }
      setBusy(true);
      later(AI_TURN_DELAY / 2, () => {
        setTurn("enemy");
        sound.play("turn");
      });
      later(AI_TURN_DELAY, aiTurn);
    },
    [aiTurn, campaign, later, sound],
  );

  const handleFire = useCallback(
    (cell: Coordinate) => {
      if (busy || winner || turn !== "player") {
        return;
      }
      const { enemyBoard } = session;
      if (enemyBoard.hasBeenFiredAt(cell)) {
        return;
      }

      if (heavyArmed !== null) {
        // Heavy shell: blanket the 2×2 area anchored at the clicked cell.
        setHeavyArmed(null);
        setUsedSpecials((prev) => [...prev, heavyArmed]);
        const anchor = {
          x: Math.min(cell.x, BOARD_SIZE - 2),
          y: Math.min(cell.y, BOARD_SIZE - 2),
        };
        const cells = [
          anchor,
          { x: anchor.x + 1, y: anchor.y },
          { x: anchor.x, y: anchor.y + 1 },
          { x: anchor.x + 1, y: anchor.y + 1 },
        ].filter((c) => isOnBoard(c) && !enemyBoard.hasBeenFiredAt(c));
        sound.play("fire", FIRE_VARIANTS[3]);
        let fleetSunk = false;
        for (const c of cells) {
          const result = enemyBoard.fire(c);
          applyPlayerShot(c, result);
          if (result.outcome === "fleet-sunk") {
            fleetSunk = true;
            break;
          }
        }
        finishPlayerTurn(fleetSunk);
        return;
      }

      const result = enemyBoard.fire(cell);
      sound.play("fire");
      applyPlayerShot(cell, result);
      finishPlayerTurn(result.outcome === "fleet-sunk");
    },
    [
      applyPlayerShot,
      busy,
      finishPlayerTurn,
      heavyArmed,
      session,
      sound,
      turn,
      winner,
    ],
  );

  /** Fire a ship class's once-per-battle special (campaign mode only). */
  const handleSpecial = useCallback(
    (shipClass: ShipClassId, tier: WeaponTier) => {
      if (busy || winner || turn !== "player" || !campaign) {
        return;
      }
      if (tier === 2) {
        // Rapid fire: the current turn's shot doesn't end the turn.
        setUsedSpecials((prev) => [...prev, shipClass]);
        extraShotRef.current = true;
        sound.play("fire", FIRE_VARIANTS[2]);
        return;
      }
      if (tier === 3) {
        setHeavyArmed((prev) => (prev === shipClass ? null : shipClass));
        sound.play("click");
        return;
      }
      // Guided shot: a guaranteed hit on a random untouched enemy ship cell.
      const { enemyBoard } = session;
      const targets = enemyBoard
        .occupiedCells()
        .filter((c) => !enemyBoard.hasBeenFiredAt(c));
      if (targets.length === 0) {
        return;
      }
      setUsedSpecials((prev) => [...prev, shipClass]);
      const cell = targets[Math.floor(Math.random() * targets.length)];
      const result = enemyBoard.fire(cell);
      sound.play("fire", FIRE_VARIANTS[4]);
      applyPlayerShot(cell, result);
      finishPlayerTurn(result.outcome === "fleet-sunk");
    },
    [
      applyPlayerShot,
      busy,
      campaign,
      finishPlayerTurn,
      session,
      sound,
      turn,
      winner,
    ],
  );

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Scoreboard
        activePlayer={winner ? null : turn === "player" ? "dutch" : "devin"}
        dutchSunk={playerSunk.length}
        devinSunk={enemySunk.length}
        message={
          winner
            ? "Engagement over"
            : turn === "player"
              ? enemySunk.length === FLEET_LENGTHS.length - 1
                ? "Final enemy ship afloat — finish her!"
                : "Your turn — fire at Devin AI's grid"
              : `${PLAYERS.devin.name} is firing…`
        }
        hitFlash={
          fx && fx.outcome !== "miss"
            ? {
                player: fx.board === "enemy" ? "dutch" : "devin",
                seq: fx.seq,
              }
            : null
        }
      />

      {campaign && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-foam-400">
            Armaments
          </span>
          {([0, 1, 2, 3, 4] as const).map((shipClass) => {
            const tier = campaign.upgrades[shipClass];
            if (tier < 2) {
              return null;
            }
            const used = usedSpecials.includes(shipClass);
            const sunkShip = playerSunk.includes(shipClass);
            const disabled =
              used || sunkShip || busy || !!winner || turn !== "player";
            const armed = heavyArmed === shipClass;
            return (
              <button
                key={shipClass}
                type="button"
                disabled={disabled}
                onClick={() => handleSpecial(shipClass, tier)}
                title={weaponTierInfo(tier).description}
                className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider shadow-btn transition-all duration-150 ease-out active:scale-95 ${
                  armed
                    ? "animate-pulse-soft border-amber-cta bg-navy-700 text-amber-cta"
                    : disabled
                      ? "cursor-not-allowed border-navy-line/60 bg-navy-900 text-foam-400/40"
                      : "border-amber-cta/50 bg-navy-800 text-amber-cta hover:-translate-y-0.5"
                }`}
              >
                {SHIP_NAMES[shipClass]} · {weaponTierInfo(tier).name}
                {used ? " ✓" : armed ? " — pick a target" : ""}
              </button>
            );
          })}
        </div>
      )}

      <div
        className={`flex w-full flex-col items-center gap-6 transition-[filter] duration-700 lg:flex-row lg:items-start lg:justify-center lg:gap-10 ${
          winner === "enemy" ? "grayscale" : ""
        }`}
      >
        <BoardShell
          title={`${PLAYERS.devin.name} waters`}
          subtitle={
            campaign
              ? `level ${campaign.level} AI · your shots: ${playerShots}`
              : `${difficulty} AI · your shots: ${playerShots}`
          }
          tone="navy"
          entranceDelayMs={80}
        >
          <div className="relative">
          <div
            key={shake?.board === "enemy" ? shake.seq : "steady"}
            className={`relative ${
              shake?.board === "enemy"
                ? shake.kind === "sunk"
                  ? "animate-board-shake"
                  : "animate-board-shake-soft"
                : ""
            }`}
          >
            <div className="grid grid-cols-10 overflow-hidden rounded-xl bg-navy-950/70">
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
                    className={`relative aspect-square rounded-md shadow-[inset_0_0_0_1px_rgba(6,14,28,0.55),inset_0_2px_3px_rgba(6,14,28,0.35)] transition-all duration-150 ease-out ${
                      state === "fog"
                        ? clickable
                          ? "water-cell cursor-crosshair hover:z-10 hover:scale-105 hover:brightness-125"
                          : "water-cell"
                        : state === "sunk"
                          ? "cell-wreck-water"
                          : state === "hit"
                            ? "cell-scorched"
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
            {enemyWrecks.map((wreck) => (
              <ShipOverlay
                key={wreck.shipId}
                shipId={wreck.shipId}
                placement={wreck.placement}
                variant="sunk"
                player="devin"
                className="pointer-events-none z-10 animate-wreck-settle"
                style={
                  {
                    "--list": wreck.shipId % 2 ? "-2.2deg" : "2.4deg",
                  } as CSSProperties
                }
              />
            ))}
            {enemyWrecks.map((wreck) => (
              <WreckSmoke
                key={`smoke-${wreck.shipId}`}
                placement={wreck.placement}
              />
            ))}
          </div>
          {sunkFx?.board === "enemy" && (
            <SunkExplosions key={`sunkfx-${sunkFx.seq}`} cells={sunkFx.cells} />
          )}
          {callout && sunkFx?.board === "enemy" && (
            <SunkBanner callout={callout} />
          )}
          </div>
        </BoardShell>

        <div className="animate-rise-in flex flex-row gap-4 [animation-delay:200ms] lg:flex-col lg:pt-10">
          <FleetStatus
            label={`${PLAYERS.devin.name} fleet`}
            sunk={enemySunk}
            player="devin"
          />
          <FleetStatus label={`${PLAYERS.dutch.name} fleet`} sunk={playerSunk} />
        </div>

        <BoardShell
          title={`${CALLSIGNS.dutch}'s grid`}
          subtitle={`enemy shots: ${enemyShots}`}
          tone="paper"
          entranceDelayMs={320}
        >
          <div className="relative">
          <div
            key={shake?.board === "player" ? shake.seq : "steady"}
            className={`relative ${
              shake?.board === "player"
                ? shake.kind === "sunk"
                  ? "animate-board-shake"
                  : "animate-board-shake-soft"
                : ""
            }`}
          >
            <div className="grid grid-cols-10 overflow-hidden rounded-xl bg-navy-950/70">
              {playerGrid.flatMap((row, y) =>
                row.map((state, x) => {
                  const isFx =
                    fx?.board === "player" &&
                    fx.cell.x === x &&
                    fx.cell.y === y;
                  return (
                    <div
                      key={coordKey({ x, y })}
                      className={`relative aspect-square rounded-md shadow-[inset_0_0_0_1px_rgba(6,14,28,0.55),inset_0_2px_3px_rgba(6,14,28,0.35)] ${
                        state === "sunk"
                          ? "cell-wreck-water"
                          : state === "hit"
                            ? "cell-scorched"
                            : "water-cell-light"
                      }`}
                    >
                      <CellMark state={state} />
                      {isFx && (
                        <ShotOverlay key={fx.seq} outcome={fx.outcome} />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
            {session.fleet.map((placement, shipId) =>
              playerSunk.includes(shipId) ? null : (
                <ShipOverlay
                  key={shipId}
                  shipId={shipId as ShipId}
                  placement={placement}
                  hits={damagedSegments(placement, playerGrid)}
                  weaponTier={campaign?.upgrades[shipId as ShipClassId]}
                  className="pointer-events-none z-10 animate-ship-bob"
                  style={{
                    animationDelay: `${shipId * 0.55}s`,
                    animationDuration: `${3.3 + shipId * 0.4}s`,
                  }}
                />
              ),
            )}
            <DamageSmoke cells={damagedCells(session.fleet, playerSunk, playerGrid)} />
            {playerWrecks.map((wreck) => (
              <ShipOverlay
                key={`wreck-${wreck.shipId}`}
                shipId={wreck.shipId}
                placement={wreck.placement}
                variant="sunk"
                className="pointer-events-none z-10 animate-wreck-settle"
                style={
                  {
                    "--list": wreck.shipId % 2 ? "-2.2deg" : "2.4deg",
                  } as CSSProperties
                }
              />
            ))}
            {playerWrecks.map((wreck) => (
              <WreckSmoke
                key={`smoke-${wreck.shipId}`}
                placement={wreck.placement}
              />
            ))}
          </div>
          {sunkFx?.board === "player" && (
            <SunkExplosions key={`sunkfx-${sunkFx.seq}`} cells={sunkFx.cells} />
          )}
          {callout && sunkFx?.board === "player" && (
            <SunkBanner callout={callout} />
          )}
          </div>
        </BoardShell>
      </div>

      {winner && (
        <GameOverModal
          winner={winner}
          playerShots={playerShots}
          enemyShots={enemyShots}
          onPlayAgain={onPlayAgain}
          actionLabel={playAgainLabel}
        />
      )}
    </div>
  );
}

/** Hit (not sunk) segment indices along a ship, from the owner's grid. */
export function damagedSegments(
  placement: ShipPlacement,
  grid: PlayerCell[][],
): number[] {
  return shipCells(placement).flatMap((cell, i) =>
    grid[cell.y][cell.x] === "hit" ? [i] : [],
  );
}

/** Board cells of live (unsunk) ships that have taken a hit. */
export function damagedCells(
  fleet: ShipPlacement[],
  sunk: number[],
  grid: PlayerCell[][],
): Coordinate[] {
  return fleet.flatMap((placement, shipId) =>
    sunk.includes(shipId)
      ? []
      : shipCells(placement).filter((cell) => grid[cell.y][cell.x] === "hit"),
  );
}

export function CellMark({ state }: { state: string }) {
  if (state === "miss") {
    return (
      <span className="absolute inset-0 z-20 flex items-center justify-center">
        <span className="h-[24%] w-[24%] rounded-full bg-foam-200/70" />
      </span>
    );
  }
  if (state === "hit" || state === "sunk") {
    return (
      <span
        className={`absolute inset-0 z-20 flex items-center justify-center font-bold ${
          state === "sunk" ? "text-coral-600/45" : "text-coral-400"
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

export function ShotOverlay({ outcome }: { outcome: FireOutcome }) {
  if (outcome === "miss") {
    return <SplashEffect />;
  }
  return (
    <span className="pointer-events-none absolute inset-0 z-30">
      <span className="animate-hit-glow absolute inset-0 rounded-md" />
      <ExplosionEffect />
    </span>
  );
}

/** Fleet readout; `sunk` holds the fleet indices of sunk ships. */
export function FleetStatus({
  label,
  sunk,
  player = "dutch",
}: {
  label: string;
  sunk: number[];
  player?: PlayerId;
}) {
  return (
    <div className="radar-panel animate-rise-in rounded-2xl border border-navy-line/70 bg-navy-900/85 p-3 shadow-panel">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foam-400">
        {label}
      </p>
      <ul className="flex flex-col gap-1">
        {FLEET_LENGTHS.map((length, i) => {
          const isSunk = sunk.includes(i);
          return (
            <li
              key={i}
              className={isSunk ? "opacity-70 grayscale-[0.3] transition-all duration-300" : "transition-all duration-300"}
              style={{ width: `${length * 0.9}rem`, height: "1.1rem" }}
            >
              <ShipSprite
                shipId={i as ShipId}
                variant={isSunk ? "sunk" : "fleet"}
                player={player}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
