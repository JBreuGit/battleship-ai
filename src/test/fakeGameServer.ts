import { AdvancedGame } from "@/game/advanced";
import { AdvancedAiPlayer } from "@/game/advancedAi";
import {
  CampaignState,
  applyUpgrade,
  campaignLoadout,
  createCampaignState,
  recordLoss,
  recordWin,
} from "@/game/campaign";
import { GameApiError, RemoteGame } from "@/game/client";
import {
  ActResponse,
  CampaignRequest,
  CampaignResponse,
  CampaignUpdate,
  PlayerAction,
  StartRequest,
} from "@/game/protocol";
import { randomFleet } from "@/game/placement";
import { ShipPlacement } from "@/game/types";
import {
  GameRecord,
  LiveGame,
  applyLive,
  createRecord,
  publicState,
  replay,
} from "@/server/engine";
import { createSecureRng } from "@/server/rng";

/** A valid 256-bit match seed derived from a small test number. */
export function seedOf(n: number): string {
  return n.toString(16).padStart(64, "0");
}

/**
 * In-process stand-in for the game API used by component tests. It runs the
 * real server engine, so components see exactly the wire format production
 * does, while tests keep full control over the enemy fleet and AI.
 */
export interface FakeServerOptions {
  /** Enemy fleet to use instead of the seeded random one. */
  enemyFleet?: ShipPlacement[];
  /** Scripted AI to use instead of the difficulty-based one. */
  ai?: AdvancedAiPlayer;
  seed?: string;
}

interface Match {
  record: GameRecord;
  live: LiveGame;
}

export function createFakeServer(options: FakeServerOptions = {}) {
  const matches = new Map<string, Match>();
  let nextId = 1;

  const buildLive = (record: GameRecord): LiveGame => {
    if (!options.enemyFleet && !options.ai) {
      return replay(record);
    }
    const rng = createSecureRng(record.seed);
    const seeded = replay(record);
    const enemyFleet =
      options.enemyFleet ?? randomFleet(createSecureRng(record.seed));
    const loadout =
      record.mode === "campaign"
        ? campaignLoadout(record.campaign?.level ?? 1)
        : record.mode === "classic"
          ? {
              uses: { recon: 0, barrage: 0, sonar: 0, "rapid-fire": 0 },
              stealth: false,
            }
          : undefined;
    return {
      game: new AdvancedGame(
        [record.fleet, enemyFleet],
        rng,
        loadout ? [loadout, loadout] : undefined,
      ),
      ai: options.ai ?? seeded.ai,
      usedSpecials: [],
    };
  };

  const startGame = async (request: StartRequest): Promise<RemoteGame> => {
    const id = `match-${nextId++}`;
    const campaign =
      request.mode === "campaign"
        ? openCampaign(request.campaignToken)
        : undefined;
    const record = createRecord(
      request,
      id,
      options.seed ?? seedOf(1),
      campaign,
    );
    const live = buildLive(record);
    matches.set(id, { record, live });
    return {
      mode: request.mode,
      fleet: request.fleet,
      token: `${id}:0`,
      state: publicState(live, record),
    };
  };

  const sendAction = async (
    game: RemoteGame,
    action: PlayerAction,
  ): Promise<{ game: RemoteGame; response: ActResponse }> => {
    const [id, index] = game.token.split(":");
    const match = matches.get(id);
    if (!match) {
      throw new GameApiError("invalid-token", "Unknown match", 400);
    }
    if (Number(index) !== match.record.actions.length) {
      throw new GameApiError("stale-token", "Stale token", 409);
    }
    const outcome = applyLive(match.live, match.record, action);
    match.record = outcome.record;
    const response: ActResponse = {
      token: `${id}:${outcome.record.actions.length}`,
      you: outcome.you,
      enemy: outcome.enemy,
      state: outcome.state,
    };
    const settled = settle(outcome.record, outcome.state.winner);
    if (settled) {
      response.campaign = settled;
    }
    return {
      game: { ...game, token: response.token, state: response.state },
      response,
    };
  };

  const campaignRequest = async (
    request: CampaignRequest,
  ): Promise<CampaignResponse> => {
    switch (request.op) {
      case "load":
        return sealed(
          request.token === null
            ? createCampaignState()
            : openCampaign(request.token),
        );
      case "upgrade":
        return sealed(applyUpgrade(openCampaign(request.token), request.ship));
      case "reset":
        return sealed(createCampaignState());
    }
  };

  /** The live match for assertions the client must never be able to make. */
  const liveOf = (game: RemoteGame): LiveGame => {
    const match = matches.get(game.token.split(":")[0]);
    if (!match) {
      throw new Error("Unknown match");
    }
    return match.live;
  };

  return { startGame, sendAction, campaignRequest, liveOf };
}

const CAMPAIGN_PREFIX = "campaign:";

function sealed(state: CampaignState): CampaignResponse {
  return { token: CAMPAIGN_PREFIX + JSON.stringify(state), state };
}

function openCampaign(token: string | undefined): CampaignState {
  if (typeof token !== "string" || !token.startsWith(CAMPAIGN_PREFIX)) {
    throw new GameApiError("invalid-token", "Bad campaign token", 400);
  }
  return JSON.parse(token.slice(CAMPAIGN_PREFIX.length)) as CampaignState;
}

function settle(
  record: GameRecord,
  winner: number | null,
): CampaignUpdate | undefined {
  if (record.mode !== "campaign" || !record.campaign || winner === null) {
    return undefined;
  }
  if (winner === 0) {
    const outcome = recordWin(record.campaign);
    return {
      ...sealed(outcome.state),
      won: true,
      promotedTo: outcome.promotedTo,
      upgradePointEarned: outcome.upgradePointEarned,
    };
  }
  return {
    ...sealed(recordLoss(record.campaign)),
    won: false,
    promotedTo: null,
    upgradePointEarned: false,
  };
}
