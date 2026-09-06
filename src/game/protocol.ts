import type { Difficulty } from "./ai";
import type {
  AbilityKind,
  BarrageReport,
  PlayerId,
  ReconReport,
  ShotResult,
  SonarReport,
} from "./advanced";
import type { ShipClassId, WeaponTier } from "./campaign";
import type { Coordinate, ShipPlacement } from "./types";

/**
 * Wire protocol between the browser and the game server.
 *
 * The browser never holds the enemy fleet, the AI, or the rules engine:
 * it submits the player's fleet once, then sends one action at a time and
 * receives only the fog-of-war view a real opponent would grant — shot
 * outcomes, sunk-ship footprints, and ability reports.
 */

export type GameMode = "classic" | "admiral" | "campaign";

export interface StartRequest {
  mode: GameMode;
  /** Classic / Admiral AI difficulty; ignored for campaign battles. */
  difficulty: Difficulty;
  /** Campaign level 1..20; required for campaign battles. */
  level?: number;
  /** Campaign weapon tier per ship class; required for campaign battles. */
  upgrades?: Record<ShipClassId, WeaponTier>;
  fleet: ShipPlacement[];
}

/** One player action. The server validates every field against its state. */
export type PlayerAction =
  | { type: "fire"; target: Coordinate }
  | { type: "rapid-fire" }
  | { type: "recon"; center: Coordinate }
  | { type: "sonar"; center: Coordinate }
  | { type: "barrage"; center: Coordinate }
  /** Campaign tier-2 rapid-fire cannon: two shots this turn. */
  | { type: "boost"; ship: ShipClassId }
  /** Campaign tier-3 heavy shell: a 2×2 blanket anchored at `cell`. */
  | { type: "heavy"; ship: ShipClassId; cell: Coordinate }
  /** Campaign tier-4 guided shot: the server picks an untouched enemy ship cell. */
  | { type: "guided"; ship: ShipClassId };

/** A shot result plus, once a ship is sunk, its fleet index for the hull art. */
export type WireShotResult = ShotResult & { shipId?: number };

export interface WireBarrageReport {
  shots: { target: Coordinate; result: WireShotResult }[];
  skipped: BarrageReport["skipped"];
}

/** Everything one side did during its turn, in order, as the other side sees it. */
export type WireEvent =
  | { kind: "shot"; target: Coordinate; result: WireShotResult }
  | { kind: "recon"; center: Coordinate; report: ReconReport }
  | { kind: "sonar"; center: Coordinate; report: SonarReport }
  | { kind: "barrage"; center: Coordinate; report: WireBarrageReport }
  | { kind: "rapid-fire" };

/** The player's legitimate view of the match. Never includes enemy positions. */
export interface PublicState {
  turn: PlayerId;
  winner: PlayerId | null;
  shotsRemaining: number;
  shotsFired: [number, number];
  /** Remaining ability uses for the player. */
  uses: Record<AbilityKind, number>;
  /** Whether each ability can be used right now (uses left, ship afloat). */
  abilityAvailable: Record<AbilityKind, boolean>;
  /** Silent-running still armed for [player, enemy]. */
  stealth: [boolean, boolean];
  /** Campaign specials already spent this battle (one per ship class). */
  usedSpecials: ShipClassId[];
  /** Number of actions accepted so far; the next action must carry this token. */
  actionIndex: number;
}

export interface StartResponse {
  token: string;
  state: PublicState;
}

export interface ActRequest {
  token: string;
  action: PlayerAction;
}

export interface ActResponse {
  token: string;
  /** Events produced by the player's own action. */
  you: WireEvent[];
  /** Events of the enemy turn that followed (empty if the turn did not pass). */
  enemy: WireEvent[];
  state: PublicState;
}

export type ApiErrorCode =
  | "bad-request"
  | "invalid-fleet"
  | "invalid-token"
  | "stale-token"
  | "illegal-action"
  | "rate-limited"
  | "server-error";

export interface ApiError {
  error: ApiErrorCode;
  message: string;
}
