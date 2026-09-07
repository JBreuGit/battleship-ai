"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AbilityKind,
  barrageCells,
  scanArea,
  sonarArea,
} from "@/game/advanced";
import { Difficulty } from "@/game/ai";
import { coordKey, shipCells } from "@/game/board";
import {
  ABILITY_UNLOCK_LEVELS,
  STEALTH_UNLOCK_LEVEL,
  ShipClassId,
  WeaponTier,
  weaponTierInfo,
} from "@/game/campaign";
import { RemoteGame, sendAction } from "@/game/client";
import {
  ActResponse,
  CampaignUpdate,
  PlayerAction,
  PublicState,
  WireBarrageReport,
  WireEvent,
  WireShotResult,
} from "@/game/protocol";
import { BOARD_SIZE, Coordinate, FLEET_LENGTHS } from "@/game/types";
import {
  CellMark,
  ConnectionNotice,
  FleetStatus,
  PlayerCell,
  ShotOverlay,
  Side,
  Wreck,
  damagedCells,
  damagedSegments,
  describeApiError,
  isFatalApiError,
  makeGrid,
  placementFromCells,
} from "./BattleScreen";
import { BoardShell } from "./BoardShell";
import { GameOverModal } from "./GameOverModal";
import { PLAYERS } from "./PlayerBadge";
import { CALLSIGNS, Scoreboard } from "./PlayerAvatar";
import { ShipId, ShipOverlay } from "./ShipSprite";
import {
  DamageSmoke,
  SHIP_NAMES,
  SunkBanner,
  SunkCallout,
  SunkExplosions,
  WreckSmoke,
} from "./ShotEffects";
import { PlayVariant, SoundControls } from "./useSoundManager";

type EnemyCell =
  | "fog"
  | "miss"
  | "hit"
  | "sunk"
  | "cleared"
  | "suspect"
  | "revealed"
  | "evaded";
type TargetedAbility = "recon" | "sonar" | "barrage";

/**
 * The browser's whole knowledge of an Admiral / Battle Commander match: the
 * player's fleet, the server's opaque token, and the public state it last
 * reported. Both fleets' hidden positions and the AI live server-side.
 */
export type AdmiralSession = RemoteGame;

const PLAYER = 0 as const;
const ENEMY = 1 as const;

/** Campaign context for a battle: level, fleet weapon tiers, and outcome sink. */
export interface CampaignBattleConfig {
  level: number;
  upgrades: Record<ShipClassId, WeaponTier>;
  /** Receives the server-settled campaign save once the battle is decided. */
  onResult: (update: CampaignUpdate) => void;
}

/** Beefier cannon-fire renditions per weapon tier (tier 1 = stock sound). */
const FIRE_VARIANTS: Record<WeaponTier, PlayVariant | undefined> = {
  1: undefined,
  2: { rate: 1.12, layers: 2 },
  3: { rate: 0.72, gainMul: 1.2, layers: 2 },
  4: { rate: 0.88, gainMul: 1.15, layers: 3 },
};

/** The 2×2 heavy-shell cells anchored at (clamped) `cell`. */
function heavyShellCells(cell: Coordinate): Coordinate[] {
  const anchor = {
    x: Math.min(cell.x, BOARD_SIZE - 2),
    y: Math.min(cell.y, BOARD_SIZE - 2),
  };
  return [
    anchor,
    { x: anchor.x + 1, y: anchor.y },
    { x: anchor.x, y: anchor.y + 1 },
    { x: anchor.x + 1, y: anchor.y + 1 },
  ];
}

interface ShotFx {
  board: Side;
  cell: Coordinate;
  outcome: WireShotResult["outcome"];
  seq: number;
}

interface ScanFx {
  board: Side;
  cells: Coordinate[];
  kind: "recon" | "sonar";
  seq: number;
}

interface SunkFx {
  board: Side;
  cells: Coordinate[];
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

/** Time still to wait so an effect lands `total` ms after `startedAt`. */
function remaining(startedAt: number, total: number): number {
  return Math.max(0, total - (Date.now() - startedAt));
}

function firstShot(
  events: WireEvent[],
): { target: Coordinate; result: WireShotResult } | null {
  for (const event of events) {
    if (event.kind === "shot") {
      return event;
    }
  }
  return null;
}

function firstBarrage(events: WireEvent[]): WireBarrageReport | null {
  for (const event of events) {
    if (event.kind === "barrage") {
      return event.report;
    }
  }
  return null;
}

/**
 * The public state to show while the enemy's reply is still being played
 * back: the player's side of the response, the enemy's side as it was.
 */
function interimState(prev: PublicState, response: ActResponse): PublicState {
  if (response.enemy.length === 0) {
    return response.state;
  }
  return {
    ...response.state,
    winner: null,
    shotsFired: [response.state.shotsFired[0], prev.shotsFired[1]],
    stealth: [prev.stealth[0], response.state.stealth[1]],
  };
}

export interface AdmiralBattleScreenProps {
  session: AdmiralSession;
  difficulty: Difficulty;
  sound: SoundControls;
  onPlayAgain: () => void;
  campaign?: CampaignBattleConfig;
  /** Label for the game-over button (defaults to "Play again"). */
  playAgainLabel?: string;
}

export function AdmiralBattleScreen({
  session,
  difficulty,
  sound,
  onPlayAgain,
  campaign,
  playAgainLabel,
}: AdmiralBattleScreenProps) {
  const [pub, setPub] = useState<PublicState>(session.state);
  const [enemyGrid, setEnemyGrid] = useState<EnemyCell[][]>(() =>
    makeGrid<EnemyCell>("fog"),
  );
  const [playerGrid, setPlayerGrid] = useState<PlayerCell[][]>(() => {
    const grid = makeGrid<PlayerCell>("water");
    for (const cell of session.fleet.flatMap(shipCells)) {
      grid[cell.y][cell.x] = "ship";
    }
    return grid;
  });
  const [turn, setTurn] = useState<Side>("player");
  const [busy, setBusy] = useState(false);
  const [enemySunk, setEnemySunk] = useState<number[]>([]);
  const [playerSunk, setPlayerSunk] = useState<number[]>([]);
  const [enemyWrecks, setEnemyWrecks] = useState<Wreck[]>([]);
  const [playerWrecks, setPlayerWrecks] = useState<Wreck[]>([]);
  const [exposedOwnCells, setExposedOwnCells] = useState<string[]>([]);
  const [fx, setFx] = useState<ShotFx | null>(null);
  const [scanFx, setScanFx] = useState<ScanFx | null>(null);
  const [sunkFx, setSunkFx] = useState<SunkFx | null>(null);
  const [callout, setCallout] = useState<SunkCallout | null>(null);
  const [shake, setShake] = useState<{
    board: Side;
    kind: "hit" | "sunk";
    seq: number;
  } | null>(null);
  const [winner, setWinner] = useState<Side | null>(null);
  const [notice, setNotice] = useState<string | null>(
    campaign
      ? campaign.level >= ABILITY_UNLOCK_LEVELS["rapid-fire"]
        ? `Level ${campaign.level} — both fleets carry the abilities your rank has unlocked.`
        : `Level ${campaign.level} — ship abilities unlock as you rise through the ranks.`
      : "Admiral mode — each ship carries one special ability.",
  );
  const [arming, setArming] = useState<TargetedAbility | null>(null);
  /** Heavy-shell special armed and waiting for a target cell. */
  const [heavyArmed, setHeavyArmed] = useState<ShipClassId | null>(null);
  /** True once the player has committed to rapid fire for this turn. */
  const [abilityLock, setAbilityLock] = useState(false);
  const [hoverCell, setHoverCell] = useState<Coordinate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);

  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gameRef = useRef<RemoteGame>(session);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const timers = timersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);

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

  /** Apply a server-resolved shot to the target side's grid, fx, and fleet status. */
  const applyShot = useCallback(
    (board: Side, target: Coordinate, result: WireShotResult) => {
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
        return;
      }

      sound.play(
        result.outcome === "miss"
          ? "miss"
          : result.outcome === "hit"
            ? "hit"
            : "sunk",
      );
      if (result.outcome !== "miss") {
        sound.voice(
          board === "enemy" ? "navy" : "devin",
          result.outcome === "hit" ? "hit" : "sunk",
        );
      }
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
      } else {
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
      }

      if (result.outcome === "hit") {
        setShake({ board, kind: "hit", seq: seqRef.current });
      }
      if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
        const shipId = (result.shipId ?? 0) as ShipId;
        const setSunk = board === "enemy" ? setEnemySunk : setPlayerSunk;
        const setWrecks = board === "enemy" ? setEnemyWrecks : setPlayerWrecks;
        setSunk((prev) => {
          const next = [...prev, shipId];
          if (board === "enemy" && next.length === FLEET_LENGTHS.length - 1) {
            setNotice("Final enemy ship afloat — finish her!");
          }
          return next;
        });
        if (board === "player") {
          // A sunk ship loses its armed heavy shell.
          setHeavyArmed((prev) => (prev === shipId ? null : prev));
        }
        if (result.sunkShip) {
          const placement = placementFromCells(result.sunkShip);
          setWrecks((prev) => [...prev, { shipId, placement }]);
          setSunkFx({ board, cells: result.sunkShip, seq: seqRef.current });
        }
        setCallout({
          shipId,
          attacker: board === "enemy" ? "dutch" : "devin",
          seq: seqRef.current,
        });
        setShake({ board, kind: "sunk", seq: seqRef.current });
      }
    },
    [markEnemy, sound],
  );

  const finishGame = useCallback(
    (won: boolean, update: CampaignUpdate | undefined) => {
      later(GAME_OVER_DELAY, () => {
        setWinner(won ? "player" : "enemy");
        sound.play(won ? "victory" : "defeat");
        if (update) {
          campaign?.onResult(update);
        }
      });
    },
    [campaign, later, sound],
  );

  /** Replay the AI's server-resolved turn with staggered timing, then hand back. */
  const replayAiTurn = useCallback(
    (response: ActResponse) => {
      let t = 0;
      for (const event of response.enemy) {
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
        setPub(response.state);
        if (response.state.winner !== null) {
          finishGame(response.state.winner === PLAYER, response.campaign);
          return;
        }
        setTurn("player");
        setAbilityLock(false);
        setBusy(false);
        sound.play("turn");
      });
    },
    [applyShot, finishGame, later, markEnemy, sound],
  );

  const startAiTurn = useCallback(
    (response: ActResponse) => {
      setTurn("enemy");
      sound.play("turn");
      later(AI_TURN_DELAY, () => replayAiTurn(response));
    },
    [later, replayAiTurn, sound],
  );

  /** After a player action resolves: continue rapid fire, end, or hand off. */
  const afterPlayerAction = useCallback(
    (extraDelay: number, response: ActResponse) => {
      later(extraDelay, () => {
        if (response.enemy.length > 0) {
          startAiTurn(response);
          return;
        }
        if (response.state.winner !== null) {
          finishGame(response.state.winner === PLAYER, response.campaign);
          return;
        }
        setNotice(`Rapid fire — ${response.state.shotsRemaining} shot(s) remaining.`);
        setBusy(false);
      });
    },
    [finishGame, later, startAiTurn],
  );

  /**
   * Send one action to the server. `onOk` receives the response once the
   * token has advanced; failures surface as a notice and unlock the board.
   */
  const submit = useCallback(
    (action: PlayerAction, onOk: (response: ActResponse) => void) => {
      setBusy(true);
      setError(null);
      void sendAction(gameRef.current, action).then(
        ({ game, response }) => {
          if (!mountedRef.current) {
            return;
          }
          gameRef.current = game;
          setPub((prev) => interimState(prev, response));
          onOk(response);
        },
        (err: unknown) => {
          if (!mountedRef.current) {
            return;
          }
          setError(describeApiError(err));
          setFatal(isFatalApiError(err));
          setBusy(false);
        },
      );
    },
    [],
  );

  const handleFire = useCallback(
    (cell: Coordinate) => {
      const startedAt = Date.now();
      setNotice(null);
      sound.play("fire");
      submit({ type: "fire", target: cell }, (response) => {
        const wait = remaining(startedAt, SHELL_FLIGHT);
        const shot = firstShot(response.you);
        if (shot) {
          later(wait, () => applyShot("enemy", shot.target, shot.result));
        }
        afterPlayerAction(wait + 500, response);
      });
    },
    [afterPlayerAction, applyShot, later, sound, submit],
  );

  const handleAbilityTarget = useCallback(
    (kind: TargetedAbility, center: Coordinate) => {
      setArming(null);
      if (kind === "recon") {
        submit({ type: "recon", center }, (response) => {
          const event = response.you.find((e) => e.kind === "recon");
          if (event?.kind !== "recon") {
            return;
          }
          const { report } = event;
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
          afterPlayerAction(1400, response);
        });
      } else if (kind === "sonar") {
        submit({ type: "sonar", center }, (response) => {
          const event = response.you.find((e) => e.kind === "sonar");
          if (event?.kind !== "sonar") {
            return;
          }
          const { report } = event;
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
          afterPlayerAction(1400, response);
        });
      } else {
        const startedAt = Date.now();
        setNotice("Main guns — full barrage!");
        sound.play("fire");
        submit({ type: "barrage", center }, (response) => {
          const report = firstBarrage(response.you);
          if (!report) {
            return;
          }
          const wait = remaining(startedAt, 300);
          report.shots.forEach(({ target, result }, i) => {
            later(wait + i * BARRAGE_STEP, () => {
              if (i > 0) {
                sound.play("fire");
              }
              applyShot("enemy", target, result);
            });
          });
          afterPlayerAction(wait + report.shots.length * BARRAGE_STEP + 500, response);
        });
      }
    },
    [afterPlayerAction, applyShot, later, markEnemyIntel, sound, submit],
  );

  /** Heavy shell special: blanket the 2×2 area anchored at the click. */
  const handleHeavyShell = useCallback(
    (shipClass: ShipClassId, cell: Coordinate) => {
      const startedAt = Date.now();
      setHeavyArmed(null);
      setNotice("Heavy shell — blanket salvo!");
      sound.play("fire", FIRE_VARIANTS[3]);
      submit({ type: "heavy", ship: shipClass, cell }, (response) => {
        const report = firstBarrage(response.you);
        if (!report) {
          return;
        }
        const wait = remaining(startedAt, 300);
        report.shots.forEach(({ target, result }, i) => {
          later(wait + i * BARRAGE_STEP, () => {
            if (i > 0) {
              sound.play("fire", FIRE_VARIANTS[3]);
            }
            applyShot("enemy", target, result);
          });
        });
        afterPlayerAction(wait + report.shots.length * BARRAGE_STEP + 500, response);
      });
    },
    [afterPlayerAction, applyShot, later, sound, submit],
  );

  /** Guided shot special: the server picks an untouched enemy ship cell. */
  const handleGuidedShot = useCallback(
    (shipClass: ShipClassId) => {
      const startedAt = Date.now();
      setNotice("Guided shot — radar lock acquired!");
      sound.play("fire", FIRE_VARIANTS[4]);
      submit({ type: "guided", ship: shipClass }, (response) => {
        const wait = remaining(startedAt, SHELL_FLIGHT);
        const shot = firstShot(response.you);
        if (shot) {
          later(wait, () => applyShot("enemy", shot.target, shot.result));
        }
        afterPlayerAction(wait + 500, response);
      });
    },
    [afterPlayerAction, applyShot, later, sound, submit],
  );

  /** Arm or fire a ship class's once-per-battle weapon special. */
  const handleSpecial = useCallback(
    (shipClass: ShipClassId, tier: WeaponTier) => {
      if (busy || winner || fatal || turn !== "player" || abilityLock || arming) {
        return;
      }
      if (heavyArmed !== null && tier !== 3) {
        return;
      }
      if (tier === 2) {
        // Rapid-fire cannon: two shots this turn, no ability use spent.
        submit({ type: "boost", ship: shipClass }, () => {
          setAbilityLock(true);
          sound.play("fire", FIRE_VARIANTS[2]);
          setNotice("Rapid-fire cannon — two shots this turn!");
          setBusy(false);
        });
        return;
      }
      if (tier === 3) {
        setHeavyArmed((prev) => (prev === shipClass ? null : shipClass));
        sound.play("click");
        setNotice((prev) =>
          heavyArmed === shipClass
            ? prev === "Heavy shell armed — pick the corner of the 2×2 blanket."
              ? null
              : prev
            : "Heavy shell armed — pick the corner of the 2×2 blanket.",
        );
        return;
      }
      handleGuidedShot(shipClass);
    },
    [
      abilityLock,
      arming,
      busy,
      fatal,
      handleGuidedShot,
      heavyArmed,
      sound,
      submit,
      turn,
      winner,
    ],
  );

  const handleCellClick = useCallback(
    (cell: Coordinate) => {
      if (busy || winner || fatal || turn !== "player") {
        return;
      }
      if (arming) {
        handleAbilityTarget(arming, cell);
        return;
      }
      if (heavyArmed !== null) {
        handleHeavyShell(heavyArmed, cell);
        return;
      }
      const state = enemyGrid[cell.y][cell.x];
      if (state === "miss" || state === "hit" || state === "sunk") {
        return;
      }
      handleFire(cell);
    },
    [
      arming,
      busy,
      enemyGrid,
      fatal,
      handleAbilityTarget,
      handleFire,
      handleHeavyShell,
      heavyArmed,
      turn,
      winner,
    ],
  );

  const handleAbilityButton = useCallback(
    (kind: AbilityKind) => {
      if (
        busy ||
        winner ||
        fatal ||
        abilityLock ||
        heavyArmed !== null ||
        turn !== "player" ||
        !pub.abilityAvailable[kind]
      ) {
        return;
      }
      if (kind === "rapid-fire") {
        setArming(null);
        submit({ type: "rapid-fire" }, () => {
          setAbilityLock(true);
          setNotice("Rapid fire armed — two shots this turn!");
          setBusy(false);
        });
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
    [abilityLock, busy, fatal, heavyArmed, pub, submit, turn, winner],
  );

  const previewCells = new Set<string>(
    hoverCell
      ? arming
        ? (arming === "barrage"
            ? barrageCells(hoverCell)
            : arming === "sonar"
              ? sonarArea(hoverCell)
              : scanArea(hoverCell)
          ).map(coordKey)
        : heavyArmed !== null
          ? heavyShellCells(hoverCell).map(coordKey)
          : []
      : [],
  );

  const [playerShots, enemyShots] = pub.shotsFired;
  const usedSpecials = pub.usedSpecials;
  const rapidFireActive =
    turn === "player" && !winner && pub.shotsRemaining > 1;

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <Scoreboard
        activePlayer={winner ? null : turn === "player" ? "dutch" : "devin"}
        dutchSunk={playerSunk.length}
        devinSunk={enemySunk.length}
        message={
          winner
            ? "Engagement over"
            : turn === "player"
              ? rapidFireActive
                ? `Rapid fire — ${pub.shotsRemaining} shots this turn`
                : "Your turn — fire, or use a ship's ability"
              : `${PLAYERS.devin.name} is maneuvering…`
        }
        hitFlash={
          fx && fx.outcome !== "miss" && fx.outcome !== "evaded"
            ? {
                player: fx.board === "enemy" ? "dutch" : "devin",
                seq: fx.seq,
              }
            : null
        }
      />

      <p
        aria-live="polite"
        className="min-h-[1.25rem] max-w-2xl text-center text-xs font-medium text-foam-300"
      >
        {notice ?? ""}
      </p>

      {error && (
        <ConnectionNotice message={error} fatal={fatal} onRestart={onPlayAgain} />
      )}

      <AbilityBar
        state={pub}
        arming={arming}
        disabled={
          busy ||
          !!winner ||
          fatal ||
          abilityLock ||
          heavyArmed !== null ||
          turn !== "player"
        }
        onUse={handleAbilityButton}
        campaignLevel={campaign?.level}
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
              used ||
              sunkShip ||
              busy ||
              !!winner ||
              fatal ||
              abilityLock ||
              arming !== null ||
              (heavyArmed !== null && heavyArmed !== shipClass) ||
              turn !== "player";
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
            <div
              className="grid grid-cols-10 overflow-hidden rounded-xl bg-navy-950/70"
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
                    !busy &&
                    !winner &&
                    !fatal &&
                    turn === "player" &&
                    (arming !== null || heavyArmed !== null || !fired);
                  const inPreview = previewCells.has(coordKey({ x, y }));
                  return (
                    <button
                      key={coordKey({ x, y })}
                      type="button"
                      aria-label={`Fire at ${String.fromCharCode(65 + x)}${y + 1}`}
                      disabled={!clickable}
                      onClick={() => handleCellClick({ x, y })}
                      onPointerEnter={() => setHoverCell({ x, y })}
                      className={`relative aspect-square rounded-md shadow-[inset_0_0_0_1px_rgba(6,14,28,0.55),inset_0_2px_3px_rgba(6,14,28,0.35)] transition-all duration-150 ease-out ${
                        state === "sunk"
                          ? "cell-wreck-water"
                          : state === "hit"
                            ? "cell-scorched"
                            : state === "suspect"
                              ? "bg-amber-cta/30"
                              : state === "cleared"
                                ? "bg-navy-900/85"
                                : state === "revealed"
                                  ? "bg-coral-500/35"
                                  : fired
                                    ? "bg-navy-900"
                                    : clickable
                                    ? "water-cell cursor-crosshair hover:z-10 hover:scale-105 hover:brightness-125"
                                    : "water-cell"
                      }`}
                    >
                      {inPreview && (
                        <span className="pointer-events-none absolute inset-0 z-40 rounded-md border-2 border-amber-cta bg-amber-cta/25" />
                      )}
                      <CellMark state={state} />
                      {state === "revealed" && (
                        <span className="absolute inset-0 z-20 flex items-center justify-center text-[10px] font-bold text-coral-400">
                          ◎
                        </span>
                      )}
                      {state === "evaded" && (
                        <span className="absolute inset-0 z-20 flex items-center justify-center text-[10px] font-bold text-foam-200">
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
                          className={`animate-scan-pulse pointer-events-none absolute inset-0 z-30 rounded-md ${
                            scanFx.kind === "sonar"
                              ? "bg-lagoon-300/45"
                              : "bg-amber-cta/40"
                          }`}
                        />
                      )}
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
          <StealthStatus state={pub} campaignLevel={campaign?.level} />
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
                  const inScan =
                    scanFx?.board === "player" &&
                    scanFx.cells.some((c) => c.x === x && c.y === y);
                  const exposed = exposedOwnCells.includes(coordKey({ x, y }));
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
                      {exposed && state !== "hit" && state !== "sunk" && (
                        <span className="absolute inset-0 z-20 rounded-md border-2 border-coral-500/80" />
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
                          className={`animate-scan-pulse pointer-events-none absolute inset-0 z-30 rounded-md ${
                            scanFx.kind === "sonar"
                              ? "bg-lagoon-300/50"
                              : "bg-amber-cta/45"
                          }`}
                        />
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
            <DamageSmoke
              cells={damagedCells(session.fleet, playerSunk, playerGrid)}
            />
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

function AbilityBar({
  state,
  arming,
  disabled,
  onUse,
  campaignLevel,
}: {
  state: PublicState;
  arming: TargetedAbility | null;
  disabled: boolean;
  onUse: (kind: AbilityKind) => void;
  /** When set (Battle Commander), abilities below their level show as locked. */
  campaignLevel?: number;
}) {
  return (
    <div className="flex w-full max-w-3xl flex-wrap items-stretch justify-center gap-2">
      {ABILITY_INFO.map(({ kind, label, ship, blurb }) => {
        const locked =
          campaignLevel !== undefined &&
          campaignLevel < ABILITY_UNLOCK_LEVELS[kind];
        const uses = state.uses[kind];
        const available =
          !locked && !disabled && state.abilityAvailable[kind];
        const armed = arming === kind;
        return (
          <button
            key={kind}
            type="button"
            disabled={!available}
            onClick={() => onUse(kind)}
            aria-pressed={armed}
            className={`min-w-[9.5rem] flex-1 rounded-xl border px-3 py-2 text-left shadow-btn transition-all duration-200 ease-out sm:flex-none ${
              armed
                ? "border-amber-cta bg-amber-cta/20 text-amber-cta shadow-glow-amber"
                : available
                  ? "border-navy-line bg-navy-800 text-foam-300 hover:-translate-y-0.5 hover:border-cyan-cta/60 hover:text-cyan-cta active:scale-95"
                  : "cursor-not-allowed border-navy-line/60 bg-navy-900 text-foam-400/40"
            }`}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                {label}
              </span>
              <span className="rounded-full bg-navy-950/60 px-1.5 text-[10px] font-semibold">
                {locked ? "locked" : `×${uses}`}
              </span>
            </span>
            <span className="mt-0.5 block text-[10px] opacity-70">
              {locked
                ? `${ship} — unlocks at level ${ABILITY_UNLOCK_LEVELS[kind]}`
                : `${ship} — ${blurb}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StealthStatus({
  state,
  campaignLevel,
}: {
  state: PublicState;
  campaignLevel?: number;
}) {
  const locked =
    campaignLevel !== undefined && campaignLevel < STEALTH_UNLOCK_LEVEL;
  return (
    <div className="radar-panel animate-rise-in rounded-2xl border border-navy-line/70 bg-navy-900/85 p-3 shadow-panel">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-foam-400">
        Silent running
      </p>
      {locked ? (
        <p className="text-[10px] font-semibold uppercase tracking-wider text-foam-400/40">
          Unlocks at level {STEALTH_UNLOCK_LEVEL}
        </p>
      ) : (
        <ul className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider">
          <li className={state.stealth[PLAYER] ? "text-foam-300" : "text-foam-400/40"}>
            Your sub: {state.stealth[PLAYER] ? "ready" : "expended"}
          </li>
          <li className={state.stealth[ENEMY] ? "text-foam-300" : "text-foam-400/40"}>
            Enemy sub: {state.stealth[ENEMY] ? "ready" : "expended"}
          </li>
        </ul>
      )}
    </div>
  );
}
