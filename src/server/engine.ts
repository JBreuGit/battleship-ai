import {
  AbilityKind,
  AdvancedGame,
  AdvancedRuleError,
  BarrageReport,
  PlayerId,
  SHIP_CLASSES,
  ShotResult,
} from "@/game/advanced";
import {
  AdvancedAiPlayer,
  TurnEvent,
  createAdvancedAi,
} from "@/game/advancedAi";
import { AiPlayer, Difficulty, createAi } from "@/game/ai";
import { Board, isOnBoard } from "@/game/board";
import {
  CAMPAIGN_LEVELS,
  MAX_WEAPON_TIER,
  SHIP_CLASS_IDS,
  ShipClassId,
  WeaponTier,
  campaignLoadout,
} from "@/game/campaign";
import { createCampaignAdmiralAi } from "@/game/campaignAi";
import { randomFleet } from "@/game/placement";
import {
  GameMode,
  PlayerAction,
  PublicState,
  StartRequest,
  WireBarrageReport,
  WireEvent,
  WireShotResult,
} from "@/game/protocol";
import { Rng, createRng } from "@/game/rng";
import {
  BOARD_SIZE,
  Coordinate,
  FireResult,
  InvalidPlacementError,
  ShipPlacement,
} from "@/game/types";

/**
 * Server-side rules engine.
 *
 * A match is fully described by an immutable `GameRecord`: the seed, the
 * setup, and the ordered list of player actions accepted so far. The
 * server never stores live objects between requests — it replays the
 * record from scratch to rebuild the enemy fleet and AI, applies the new
 * action, and hands the client only the resulting fog-of-war events.
 * Because the record travels inside an authenticated token, a client can
 * neither read the hidden fleet nor forge outcomes.
 */

export const PLAYER: PlayerId = 0;
export const ENEMY: PlayerId = 1;
const SUBMARINE_ID = SHIP_CLASSES.indexOf("submarine");
const MAX_ACTIONS = 400;

export interface GameRecord {
  v: 1;
  id: string;
  seed: number;
  mode: GameMode;
  difficulty: Difficulty;
  level?: number;
  upgrades?: Record<ShipClassId, WeaponTier>;
  fleet: ShipPlacement[];
  actions: PlayerAction[];
}

export class GameRequestError extends Error {
  constructor(
    public readonly code: "bad-request" | "invalid-fleet" | "illegal-action",
    message: string,
  ) {
    super(message);
    this.name = "GameRequestError";
  }
}

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
const MODES: readonly GameMode[] = ["classic", "admiral", "campaign"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCoordinate(value: unknown): value is Coordinate {
  return (
    isRecord(value) &&
    Number.isInteger(value.x) &&
    Number.isInteger(value.y) &&
    isOnBoard({ x: value.x as number, y: value.y as number })
  );
}

function isShipClassId(value: unknown): value is ShipClassId {
  return (
    typeof value === "number" && SHIP_CLASS_IDS.includes(value as ShipClassId)
  );
}

function parsePlacement(value: unknown): ShipPlacement {
  if (
    !isRecord(value) ||
    !isCoordinate(value.bow) ||
    !Number.isInteger(value.length) ||
    (value.orientation !== "horizontal" && value.orientation !== "vertical")
  ) {
    throw new GameRequestError("invalid-fleet", "Malformed ship placement");
  }
  return {
    bow: { x: value.bow.x, y: value.bow.y },
    length: value.length as number,
    orientation: value.orientation,
  };
}

/** Validate an untrusted start request; throws GameRequestError. */
export function parseStartRequest(body: unknown): StartRequest {
  if (!isRecord(body)) {
    throw new GameRequestError("bad-request", "Expected a JSON object");
  }
  const { mode, difficulty, fleet } = body;
  if (!MODES.includes(mode as GameMode)) {
    throw new GameRequestError("bad-request", "Unknown game mode");
  }
  if (!DIFFICULTIES.includes(difficulty as Difficulty)) {
    throw new GameRequestError("bad-request", "Unknown difficulty");
  }
  if (!Array.isArray(fleet)) {
    throw new GameRequestError("invalid-fleet", "Fleet must be an array");
  }
  const placements = fleet.map(parsePlacement);
  try {
    new Board(placements);
  } catch (error) {
    if (error instanceof InvalidPlacementError) {
      throw new GameRequestError("invalid-fleet", error.message);
    }
    throw error;
  }

  const request: StartRequest = {
    mode: mode as GameMode,
    difficulty: difficulty as Difficulty,
    fleet: placements,
  };
  if (request.mode === "campaign") {
    const { level, upgrades } = body;
    if (
      !Number.isInteger(level) ||
      (level as number) < 1 ||
      (level as number) > CAMPAIGN_LEVELS
    ) {
      throw new GameRequestError("bad-request", "Invalid campaign level");
    }
    if (!isRecord(upgrades)) {
      throw new GameRequestError("bad-request", "Missing weapon upgrades");
    }
    const tiers = {} as Record<ShipClassId, WeaponTier>;
    for (const id of SHIP_CLASS_IDS) {
      const tier = upgrades[String(id)];
      if (
        !Number.isInteger(tier) ||
        (tier as number) < 1 ||
        (tier as number) > MAX_WEAPON_TIER
      ) {
        throw new GameRequestError("bad-request", "Invalid weapon tier");
      }
      tiers[id] = tier as WeaponTier;
    }
    request.level = level as number;
    request.upgrades = tiers;
  }
  return request;
}

/** Validate an untrusted action; throws GameRequestError. */
export function parseAction(value: unknown): PlayerAction {
  if (!isRecord(value)) {
    throw new GameRequestError("bad-request", "Expected an action object");
  }
  switch (value.type) {
    case "fire":
      if (!isCoordinate(value.target)) {
        throw new GameRequestError("bad-request", "Target is off the board");
      }
      return { type: "fire", target: { x: value.target.x, y: value.target.y } };
    case "recon":
    case "sonar":
    case "barrage":
      if (!isCoordinate(value.center)) {
        throw new GameRequestError("bad-request", "Center is off the board");
      }
      return {
        type: value.type,
        center: { x: value.center.x, y: value.center.y },
      };
    case "rapid-fire":
      return { type: "rapid-fire" };
    case "boost":
    case "guided":
      if (!isShipClassId(value.ship)) {
        throw new GameRequestError("bad-request", "Unknown ship class");
      }
      return { type: value.type, ship: value.ship };
    case "heavy":
      if (!isShipClassId(value.ship) || !isCoordinate(value.cell)) {
        throw new GameRequestError("bad-request", "Malformed heavy shell");
      }
      return {
        type: "heavy",
        ship: value.ship,
        cell: { x: value.cell.x, y: value.cell.y },
      };
    default:
      throw new GameRequestError("bad-request", "Unknown action type");
  }
}

export function createRecord(
  request: StartRequest,
  id: string,
  seed: number,
): GameRecord {
  return {
    v: 1,
    id,
    seed: seed >>> 0,
    mode: request.mode,
    difficulty: request.difficulty,
    ...(request.mode === "campaign"
      ? { level: request.level, upgrades: request.upgrades }
      : {}),
    fleet: request.fleet,
    actions: [],
  };
}

/** Live objects rebuilt from a record; never leaves the server. */
export interface LiveGame {
  game: AdvancedGame;
  ai: AdvancedAiPlayer;
  usedSpecials: ShipClassId[];
}

/** Runs a classic Easy/Medium/Hard AI inside the Admiral engine (no abilities). */
class ClassicAiAdapter implements AdvancedAiPlayer {
  readonly difficulty: Difficulty;
  constructor(private readonly ai: AiPlayer) {
    this.difficulty = ai.difficulty;
  }
  takeTurn(game: AdvancedGame, me: PlayerId): TurnEvent[] {
    const target = this.ai.nextShot();
    const result = game.fireShot(me, target);
    if (result.outcome !== "evaded") {
      this.ai.notify(target, result as FireResult);
    }
    return [{ kind: "shot", target, result }];
  }
  noteRevealedEnemyCell(): void {}
}

function buildLive(record: GameRecord): LiveGame {
  const rng: Rng = createRng(record.seed);
  const enemyFleet = randomFleet(rng);
  if (record.mode === "campaign") {
    const level = record.level ?? 1;
    const loadout = campaignLoadout(level);
    return {
      game: new AdvancedGame([record.fleet, enemyFleet], rng, [
        loadout,
        loadout,
      ]),
      ai: createCampaignAdmiralAi(level, rng),
      usedSpecials: [],
    };
  }
  if (record.mode === "classic") {
    const noAbilities = {
      uses: { recon: 0, barrage: 0, sonar: 0, "rapid-fire": 0 },
      stealth: false,
    };
    return {
      game: new AdvancedGame([record.fleet, enemyFleet], rng, [
        noAbilities,
        noAbilities,
      ]),
      ai: new ClassicAiAdapter(createAi(record.difficulty, rng)),
      usedSpecials: [],
    };
  }
  return {
    game: new AdvancedGame([record.fleet, enemyFleet], rng),
    ai: createAdvancedAi(record.difficulty, rng),
    usedSpecials: [],
  };
}

/** Rebuild the live match by replaying every accepted action. */
export function replay(record: GameRecord): LiveGame {
  const live = buildLive(record);
  for (const action of record.actions) {
    applyToLive(live, record, action);
  }
  return live;
}

/** The 2×2 heavy-shell cells anchored at (clamped) `cell`. */
export function heavyShellCells(cell: Coordinate): Coordinate[] {
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

function illegal(message: string): GameRequestError {
  return new GameRequestError("illegal-action", message);
}

function requireSpecial(
  live: LiveGame,
  record: GameRecord,
  ship: ShipClassId,
  tier: WeaponTier,
): void {
  if (record.mode !== "campaign" || !record.upgrades) {
    throw illegal("Weapon specials are only available in Battle Commander");
  }
  if (record.upgrades[ship] !== tier) {
    throw illegal("That ship does not carry this weapon tier");
  }
  if (live.usedSpecials.includes(ship)) {
    throw illegal("That ship's special has already been fired this battle");
  }
  if (!live.game.shipAfloat(PLAYER, SHIP_CLASSES[ship])) {
    throw illegal("That ship has been sunk");
  }
}

interface Applied {
  you: TurnEvent[];
  enemy: TurnEvent[];
}

/** Apply one player action to the live game, then run the AI's reply. */
function applyToLive(
  live: LiveGame,
  record: GameRecord,
  action: PlayerAction,
): Applied {
  const { game, ai } = live;
  if (game.winner !== null) {
    throw illegal("The engagement is over");
  }
  if (game.currentTurn !== PLAYER) {
    throw illegal("It is not your turn");
  }

  const you: TurnEvent[] = [];
  try {
    switch (action.type) {
      case "fire": {
        const result = game.fireShot(PLAYER, action.target);
        you.push({ kind: "shot", target: action.target, result });
        break;
      }
      case "rapid-fire":
        game.useRapidFire(PLAYER);
        you.push({ kind: "rapid-fire" });
        break;
      case "recon": {
        const report = game.useRecon(PLAYER, action.center);
        you.push({ kind: "recon", center: action.center, report });
        break;
      }
      case "sonar": {
        const report = game.useSonar(PLAYER, action.center);
        if (report.revealedOwnCell) {
          ai.noteRevealedEnemyCell(report.revealedOwnCell);
        }
        you.push({ kind: "sonar", center: action.center, report });
        break;
      }
      case "barrage": {
        const report = game.useBarrage(PLAYER, action.center);
        you.push({ kind: "barrage", center: action.center, report });
        break;
      }
      case "boost":
        requireSpecial(live, record, action.ship, 2);
        game.boostShots(PLAYER, 2);
        live.usedSpecials.push(action.ship);
        break;
      case "heavy": {
        requireSpecial(live, record, action.ship, 3);
        const report = game.fireSalvo(PLAYER, heavyShellCells(action.cell));
        live.usedSpecials.push(action.ship);
        you.push({ kind: "barrage", center: action.cell, report });
        break;
      }
      case "guided": {
        requireSpecial(live, record, action.ship, 4);
        if (game.shotsRemaining !== 1) {
          throw illegal("Guided shot cannot be combined with rapid fire");
        }
        const target = guidedTarget(live);
        if (!target) {
          throw illegal("No untouched enemy ship cells remain");
        }
        const result = game.fireShot(PLAYER, target);
        live.usedSpecials.push(action.ship);
        you.push({ kind: "shot", target, result });
        break;
      }
    }
  } catch (error) {
    if (error instanceof AdvancedRuleError) {
      throw illegal(describeViolation(error));
    }
    throw error;
  }

  const enemy =
    game.winner === null && game.currentTurn === ENEMY
      ? ai.takeTurn(game, ENEMY)
      : [];
  return { you, enemy };
}

/** A guaranteed hit: an untouched enemy ship cell, avoiding a stealthed sub. */
function guidedTarget(live: LiveGame): Coordinate | null {
  const board = live.game.board(ENEMY);
  const untouched = board
    .occupiedCells()
    .filter((cell) => !board.hasBeenFiredAt(cell));
  if (untouched.length === 0) {
    return null;
  }
  const safe = live.game.stealthAvailable(ENEMY)
    ? untouched.filter((cell) => board.shipIdAt(cell) !== SUBMARINE_ID)
    : untouched;
  const pool = safe.length > 0 ? safe : untouched;
  // Deterministic under replay: derive the pick from the game's own state.
  const index =
    (live.game.shotsFired(PLAYER) * 31 + live.game.shotsFired(ENEMY) * 17) %
    pool.length;
  return pool[index];
}

function describeViolation(error: AdvancedRuleError): string {
  switch (error.reason) {
    case "not-your-turn":
      return "It is not your turn";
    case "game-over":
      return "The engagement is over";
    case "no-uses-left":
      return "No uses of that ability remain";
    case "ship-sunk":
      return "That ability's ship has been sunk";
    case "already-acted":
      return "That action must be taken before firing this turn";
    case "off-board":
      return "Target is off the board";
    case "already-fired":
      return "That square has already been fired at";
  }
}

export interface ActOutcome {
  record: GameRecord;
  you: WireEvent[];
  enemy: WireEvent[];
  state: PublicState;
}

/**
 * Validate and apply `action` to the match described by `record`.
 * Returns the new record plus everything the client is allowed to learn.
 */
export function act(record: GameRecord, action: PlayerAction): ActOutcome {
  if (record.actions.length >= MAX_ACTIONS) {
    throw illegal("Action limit reached");
  }
  const live = replay(record);
  const { you, enemy } = applyToLive(live, record, action);
  const next: GameRecord = { ...record, actions: [...record.actions, action] };
  return {
    record: next,
    you: you.map((event) => toWire(event, live.game.board(ENEMY))),
    enemy: enemy.map((event) => toWire(event, live.game.board(PLAYER))),
    state: publicState(live, next),
  };
}

/** Project the live match onto what the player may legitimately see. */
export function publicState(live: LiveGame, record: GameRecord): PublicState {
  const { game } = live;
  const kinds: AbilityKind[] = ["recon", "barrage", "sonar", "rapid-fire"];
  const uses = {} as Record<AbilityKind, number>;
  const abilityAvailable = {} as Record<AbilityKind, boolean>;
  for (const kind of kinds) {
    uses[kind] = game.usesLeft(PLAYER, kind);
    abilityAvailable[kind] = game.abilityAvailable(PLAYER, kind);
  }
  return {
    turn: game.currentTurn,
    winner: game.winner,
    shotsRemaining: game.shotsRemaining,
    shotsFired: [game.shotsFired(PLAYER), game.shotsFired(ENEMY)],
    uses,
    abilityAvailable,
    stealth: [game.stealthAvailable(PLAYER), game.stealthAvailable(ENEMY)],
    usedSpecials: [...live.usedSpecials],
    actionIndex: record.actions.length,
  };
}

/** Tag sunk results with the ship's fleet index so the client can draw it. */
function annotate(result: ShotResult, board: Board): WireShotResult {
  if (result.outcome === "sunk" || result.outcome === "fleet-sunk") {
    const cell = result.sunkShip?.[0];
    const shipId = cell ? board.shipIdAt(cell) : null;
    return shipId === null ? result : { ...result, shipId };
  }
  return result;
}

function annotateReport(
  report: BarrageReport,
  board: Board,
): WireBarrageReport {
  return {
    shots: report.shots.map(({ target, result }) => ({
      target,
      result: annotate(result, board),
    })),
    skipped: report.skipped,
  };
}

/** `board` is the board the events were fired at. */
function toWire(event: TurnEvent, board: Board): WireEvent {
  switch (event.kind) {
    case "shot":
      return { ...event, result: annotate(event.result, board) };
    case "barrage":
      return { ...event, report: annotateReport(event.report, board) };
    default:
      return event;
  }
}
