import { Board, coordKey, isOnBoard } from "./board";
import { Rng, pick } from "./rng";
import { Coordinate, FireResult, ShipPlacement } from "./types";

export type PlayerId = 0 | 1;

/** Ship classes in fleet order (lengths 5, 4, 3, 3, 2). */
export const SHIP_CLASSES = [
  "carrier",
  "battleship",
  "cruiser",
  "submarine",
  "destroyer",
] as const;

export type ShipClass = (typeof SHIP_CLASSES)[number];

const SHIP_INDEX: Record<ShipClass, number> = {
  carrier: 0,
  battleship: 1,
  cruiser: 2,
  submarine: 3,
  destroyer: 4,
};

/**
 * Active abilities. Each is tied to a ship class and only usable while
 * that ship is afloat. The submarine's "silent running" is passive and
 * handled inside shot resolution.
 */
export type AbilityKind = "recon" | "barrage" | "sonar" | "rapid-fire";

export const ABILITY_SHIP: Record<AbilityKind, ShipClass> = {
  recon: "carrier",
  barrage: "battleship",
  sonar: "cruiser",
  "rapid-fire": "destroyer",
};

export const INITIAL_USES: Record<AbilityKind, number> = {
  recon: 2,
  barrage: 1,
  sonar: 2,
  "rapid-fire": 2,
};

/**
 * A player's ability kit for one engagement. Admiral mode grants the
 * full kit to both sides; Battle Commander hands out partial kits that
 * grow with campaign level.
 */
export interface AbilityLoadout {
  uses: Record<AbilityKind, number>;
  /** Whether the submarine starts with silent running armed. */
  stealth: boolean;
}

export function fullLoadout(): AbilityLoadout {
  return { uses: { ...INITIAL_USES }, stealth: true };
}

/**
 * A shot in Admiral mode can additionally be "evaded": the submarine's
 * silent running absorbed what would have been a hit. The square takes no
 * damage and stays targetable — firing at it again will hit.
 */
export type ShotResult = FireResult | { outcome: "evaded" };

export interface ReconReport {
  /** The on-board cells of the scanned 3x3 area. */
  cells: Coordinate[];
  /** The exact positions of ship cells photographed within the area. */
  contacts: Coordinate[];
}

export interface SonarReport {
  /** The on-board cells of the pinged 5x5 area. */
  cells: Coordinate[];
  /** How many ship cells echo within the area (positions not revealed). */
  contacts: number;
  /**
   * The pinger's own occupied, not-yet-hit cell revealed to the opponent
   * in return, or null if every own ship cell has already been fired at.
   */
  revealedOwnCell: Coordinate | null;
}

export interface BarrageReport {
  /** Per-cell outcomes, in firing order. Stops early if the fleet is sunk. */
  shots: { target: Coordinate; result: ShotResult }[];
  /** Pattern cells skipped because they were off-board or already fired at. */
  skipped: Coordinate[];
}

export type AdvancedRuleViolation =
  | "not-your-turn"
  | "game-over"
  | "no-uses-left"
  | "ship-sunk"
  | "already-acted"
  | "off-board"
  | "already-fired";

export class AdvancedRuleError extends Error {
  constructor(public readonly reason: AdvancedRuleViolation) {
    super(`Admiral mode rule violation: ${reason}`);
    this.name = "AdvancedRuleError";
  }
}

const BARRAGE_PATTERN = [
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

/** The on-board cells a barrage centered on `center` would cover. */
export function barrageCells(center: Coordinate): Coordinate[] {
  return BARRAGE_PATTERN.map(({ dx, dy }) => ({
    x: center.x + dx,
    y: center.y + dy,
  })).filter(isOnBoard);
}

/** The on-board cells of the 3x3 recon area centered on `center`. */
export function scanArea(center: Coordinate): Coordinate[] {
  return areaAround(center, 1);
}

/** The on-board cells of the 5x5 sonar area centered on `center`. */
export function sonarArea(center: Coordinate): Coordinate[] {
  return areaAround(center, 2);
}

function areaAround(center: Coordinate, radius: number): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cell = { x: center.x + dx, y: center.y + dy };
      if (isOnBoard(cell)) {
        cells.push(cell);
      }
    }
  }
  return cells;
}

/**
 * Admiral mode: classic Battleship plus one limited-use ability per ship
 * class, symmetric for both players.
 *
 * - Carrier — recon flight: photographs a 3x3 area, revealing the exact
 *   positions of ship cells inside it (no damage).
 * - Battleship — main-gun barrage: fire a 5-cell cross in one action.
 * - Cruiser — active sonar: counts ship cells in a 5x5 area (positions
 *   not revealed), but one of your own ship cells is revealed to the
 *   opponent. Pinged cells also defeat the enemy submarine's silent
 *   running.
 * - Submarine — silent running (passive): the first shot that would hit
 *   the submarine is evaded — no damage, and the square stays targetable.
 *   Does not trigger on cells the attacker has sonar-pinged.
 * - Destroyer — rapid fire: two normal shots in a single turn.
 *
 * Abilities are usable only while the owning ship is afloat; sinking a
 * ship forfeits its remaining uses. Using an ability consumes the turn.
 */
export class AdvancedGame {
  private readonly boards: [Board, Board];
  private readonly uses: [
    Record<AbilityKind, number>,
    Record<AbilityKind, number>,
  ];
  private readonly stealth: [boolean, boolean];
  /** Opponent cells each player has sonar-pinged. */
  private readonly pinged: [Set<string>, Set<string>];
  private readonly shotCounts: [number, number] = [0, 0];
  private turn: PlayerId = 0;
  private pendingShots = 1;
  private actedThisTurn = false;
  private gameWinner: PlayerId | null = null;

  constructor(
    fleets: [ShipPlacement[], ShipPlacement[]],
    private readonly rng: Rng,
    loadouts: [AbilityLoadout, AbilityLoadout] = [fullLoadout(), fullLoadout()],
  ) {
    this.boards = [new Board(fleets[0]), new Board(fleets[1])];
    this.uses = [{ ...loadouts[0].uses }, { ...loadouts[1].uses }];
    this.stealth = [loadouts[0].stealth, loadouts[1].stealth];
    this.pinged = [new Set(), new Set()];
  }

  get currentTurn(): PlayerId {
    return this.turn;
  }

  get winner(): PlayerId | null {
    return this.gameWinner;
  }

  /** Shots remaining in the current turn (2 while rapid fire is active). */
  get shotsRemaining(): number {
    return this.pendingShots;
  }

  board(player: PlayerId): Board {
    return this.boards[player];
  }

  usesLeft(player: PlayerId, kind: AbilityKind): number {
    return this.uses[player][kind];
  }

  stealthAvailable(player: PlayerId): boolean {
    return this.stealth[player];
  }

  shotsFired(player: PlayerId): number {
    return this.shotCounts[player];
  }

  shipAfloat(player: PlayerId, ship: ShipClass): boolean {
    return !this.boards[player].isShipSunk(SHIP_INDEX[ship]);
  }

  abilityAvailable(player: PlayerId, kind: AbilityKind): boolean {
    return (
      this.gameWinner === null &&
      this.uses[player][kind] > 0 &&
      this.shipAfloat(player, ABILITY_SHIP[kind])
    );
  }

  /** Fire a single shot at the opponent's board. */
  fireShot(player: PlayerId, target: Coordinate): ShotResult {
    this.assertActive(player);
    const defender = this.opponent(player);
    const board = this.boards[defender];
    if (!isOnBoard(target)) {
      throw new AdvancedRuleError("off-board");
    }
    if (board.hasBeenFiredAt(target)) {
      throw new AdvancedRuleError("already-fired");
    }

    this.shotCounts[player] += 1;
    this.actedThisTurn = true;
    const result = this.resolveShot(player, target);
    this.pendingShots -= 1;
    if (this.gameWinner === null && this.pendingShots === 0) {
      this.endTurn();
    }
    return result;
  }

  /**
   * Grant extra shots this turn without consuming an ability use — the
   * hook for campaign weapon specials (e.g. the rapid-fire cannon).
   * Must be invoked before the turn's first shot.
   */
  boostShots(player: PlayerId, count: number): void {
    this.assertActive(player);
    if (this.actedThisTurn || this.pendingShots !== 1) {
      throw new AdvancedRuleError("already-acted");
    }
    this.pendingShots = Math.max(1, count);
  }

  /**
   * Fire a multi-cell salvo in one action without consuming an ability
   * use — the hook for campaign weapon specials (e.g. the heavy shell's
   * 2×2 blanket). Off-board and already-fired cells are skipped.
   */
  fireSalvo(player: PlayerId, targets: Coordinate[]): BarrageReport {
    this.assertActive(player);
    if (this.actedThisTurn || this.pendingShots !== 1) {
      throw new AdvancedRuleError("already-acted");
    }
    return this.salvo(player, targets);
  }

  /**
   * Destroyer — rapid fire: grants two shots this turn. Must be activated
   * before firing; the turn then ends after the second shot.
   */
  useRapidFire(player: PlayerId): void {
    this.assertAbility(player, "rapid-fire");
    this.uses[player]["rapid-fire"] -= 1;
    this.pendingShots = 2;
  }

  /**
   * Carrier — recon flight over a 3x3 area of the opponent's grid.
   * Aerial photography: reveals the exact ship cells within the area.
   */
  useRecon(player: PlayerId, center: Coordinate): ReconReport {
    this.assertAbility(player, "recon");
    if (!isOnBoard(center)) {
      throw new AdvancedRuleError("off-board");
    }
    this.uses[player].recon -= 1;
    const board = this.boards[this.opponent(player)];
    const cells = scanArea(center);
    const contacts = cells.filter((cell) => board.shipIdAt(cell) !== null);
    this.endTurn();
    return { cells, contacts };
  }

  /**
   * Cruiser — active sonar ping on a 5x5 area. Reports how many ship
   * cells echo inside it (without positions), marks the area as pinged
   * (defeating silent running there), and reveals one of the pinger's
   * own un-hit ship cells to the opponent.
   */
  useSonar(player: PlayerId, center: Coordinate): SonarReport {
    this.assertAbility(player, "sonar");
    if (!isOnBoard(center)) {
      throw new AdvancedRuleError("off-board");
    }
    this.uses[player].sonar -= 1;
    const enemyBoard = this.boards[this.opponent(player)];
    const cells = sonarArea(center);
    for (const cell of cells) {
      this.pinged[player].add(coordKey(cell));
    }
    const contacts = cells.filter(
      (cell) => enemyBoard.shipIdAt(cell) !== null,
    ).length;

    const ownBoard = this.boards[player];
    const exposable = ownBoard
      .occupiedCells()
      .filter((cell) => !ownBoard.hasBeenFiredAt(cell));
    const revealedOwnCell =
      exposable.length > 0 ? pick(this.rng, exposable) : null;

    this.endTurn();
    return { cells, contacts, revealedOwnCell };
  }

  /**
   * Battleship — main-gun barrage: a 5-cell cross fired in one action.
   * Off-board and already-fired cells are skipped.
   */
  useBarrage(player: PlayerId, center: Coordinate): BarrageReport {
    this.assertAbility(player, "barrage");
    if (!isOnBoard(center)) {
      throw new AdvancedRuleError("off-board");
    }
    this.uses[player].barrage -= 1;
    return this.salvo(
      player,
      BARRAGE_PATTERN.map(({ dx, dy }) => ({
        x: center.x + dx,
        y: center.y + dy,
      })),
    );
  }

  private salvo(player: PlayerId, targets: Coordinate[]): BarrageReport {
    const board = this.boards[this.opponent(player)];
    const shots: BarrageReport["shots"] = [];
    const skipped: Coordinate[] = [];
    this.actedThisTurn = true;
    for (const target of targets) {
      if (!isOnBoard(target) || board.hasBeenFiredAt(target)) {
        skipped.push(target);
        continue;
      }
      this.shotCounts[player] += 1;
      shots.push({ target, result: this.resolveShot(player, target) });
      if (this.gameWinner !== null) {
        break;
      }
    }
    if (this.gameWinner === null) {
      this.endTurn();
    }
    return { shots, skipped };
  }

  private resolveShot(player: PlayerId, target: Coordinate): ShotResult {
    const defender = this.opponent(player);
    const board = this.boards[defender];
    const shipId = board.shipIdAt(target);
    if (
      shipId === SHIP_INDEX.submarine &&
      this.stealth[defender] &&
      !this.pinged[player].has(coordKey(target))
    ) {
      this.stealth[defender] = false;
      return { outcome: "evaded" };
    }
    const result = board.fire(target);
    if (result.outcome === "fleet-sunk") {
      this.gameWinner = player;
    }
    return result;
  }

  private endTurn(): void {
    this.turn = this.opponent(this.turn);
    this.pendingShots = 1;
    this.actedThisTurn = false;
  }

  private opponent(player: PlayerId): PlayerId {
    return player === 0 ? 1 : 0;
  }

  private assertActive(player: PlayerId): void {
    if (this.gameWinner !== null) {
      throw new AdvancedRuleError("game-over");
    }
    if (player !== this.turn) {
      throw new AdvancedRuleError("not-your-turn");
    }
  }

  private assertAbility(player: PlayerId, kind: AbilityKind): void {
    this.assertActive(player);
    if (this.actedThisTurn || this.pendingShots !== 1) {
      throw new AdvancedRuleError("already-acted");
    }
    if (this.uses[player][kind] <= 0) {
      throw new AdvancedRuleError("no-uses-left");
    }
    if (!this.shipAfloat(player, ABILITY_SHIP[kind])) {
      throw new AdvancedRuleError("ship-sunk");
    }
  }
}
