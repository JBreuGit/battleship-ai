import "server-only";
import { recordLoss, recordWin } from "@/game/campaign";
import {
  ActResponse,
  ApiError,
  ApiErrorCode,
  CampaignResponse,
  CampaignUpdate,
  StartResponse,
} from "@/game/protocol";
import {
  openCampaign,
  parseCampaignRequest,
  runCampaignRequest,
  sealCampaign,
} from "./campaign";
import {
  GameRecord,
  GameRequestError,
  act,
  createRecord,
  parseAction,
  parseStartRequest,
  publicState,
  replay,
} from "./engine";
import { ReplayGuard, defaultGuardStore, fingerprint } from "./replayGuard";
import { TokenError, newGameId, newSeed, openToken, sealToken } from "./token";

/**
 * Transport-agnostic handlers behind the `/api/game/*` route handlers.
 * Every response is either a protocol payload or an `ApiError`; nothing
 * about the hidden fleet (seed, record, engine internals) ever leaves.
 */

export interface ApiResult {
  status: number;
  body: StartResponse | ActResponse | CampaignResponse | ApiError;
}

const STATUS: Record<ApiErrorCode, number> = {
  "bad-request": 400,
  "invalid-fleet": 400,
  "invalid-token": 401,
  "stale-token": 409,
  "illegal-action": 422,
  "rate-limited": 429,
  "server-error": 500,
};

function fail(error: ApiErrorCode, message: string): ApiResult {
  return { status: STATUS[error], body: { error, message } };
}

export function handleStart(body: unknown): ApiResult {
  try {
    const request = parseStartRequest(body);
    const campaign =
      request.mode === "campaign"
        ? openCampaign(request.campaignToken)
        : undefined;
    const record = createRecord(request, newGameId(), newSeed(), campaign);
    const state = publicState(replay(record), record);
    return { status: 200, body: { token: sealToken(record), state } };
  } catch (error) {
    if (error instanceof GameRequestError) {
      return fail(error.code, error.message);
    }
    if (error instanceof TokenError) {
      return fail("invalid-token", error.message);
    }
    return fail("server-error", "Could not start the engagement");
  }
}

export function handleCampaign(body: unknown): ApiResult {
  try {
    return { status: 200, body: runCampaignRequest(parseCampaignRequest(body)) };
  } catch (error) {
    if (error instanceof GameRequestError) {
      return fail(error.code, error.message);
    }
    if (error instanceof TokenError) {
      return fail("invalid-token", error.message);
    }
    return fail("server-error", "Could not update the campaign");
  }
}

/** Advance the campaign save once a campaign battle has been decided. */
function settleCampaign(
  record: GameRecord,
  winner: number | null,
): CampaignUpdate | undefined {
  if (record.mode !== "campaign" || !record.campaign || winner === null) {
    return undefined;
  }
  if (winner === 0) {
    const outcome = recordWin(record.campaign);
    return {
      token: sealCampaign(outcome.state),
      state: outcome.state,
      won: true,
      promotedTo: outcome.promotedTo,
      upgradePointEarned: outcome.upgradePointEarned,
    };
  }
  const state = recordLoss(record.campaign);
  return {
    token: sealCampaign(state),
    state,
    won: false,
    promotedTo: null,
    upgradePointEarned: false,
  };
}

function isGameRecord(value: unknown): value is GameRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as GameRecord).v === 1 &&
    (value as GameRecord).kind === "game" &&
    typeof (value as GameRecord).id === "string" &&
    Array.isArray((value as GameRecord).actions)
  );
}

export async function handleAct(
  body: unknown,
  guard: ReplayGuard = new ReplayGuard(defaultGuardStore()),
): Promise<ApiResult> {
  if (typeof body !== "object" || body === null) {
    return fail("bad-request", "Expected a JSON object");
  }
  const { token, action: rawAction } = body as Record<string, unknown>;

  let record: GameRecord;
  try {
    const opened = openToken(token);
    if (!isGameRecord(opened)) {
      throw new TokenError();
    }
    record = opened;
  } catch (error) {
    return fail(
      "invalid-token",
      error instanceof TokenError ? error.message : "Invalid game token",
    );
  }

  let action;
  try {
    action = parseAction(rawAction);
  } catch (error) {
    if (error instanceof GameRequestError) {
      return fail(error.code, error.message);
    }
    return fail("bad-request", "Malformed action");
  }

  const index = record.actions.length;
  const claim = await guard.claim(record.id, index, fingerprint(action));
  switch (claim.kind) {
    case "stale":
      return fail("stale-token", "That game token has already been used");
    case "pending":
      return fail("stale-token", "That action is still being processed");
    case "replay":
      return { status: 200, body: JSON.parse(claim.response) as ActResponse };
    case "fresh":
      break;
  }

  try {
    const outcome = act(record, action);
    const campaign = settleCampaign(record, outcome.state.winner);
    const response: ActResponse = {
      token: sealToken(outcome.record),
      you: outcome.you,
      enemy: outcome.enemy,
      state: outcome.state,
      ...(campaign ? { campaign } : {}),
    };
    await guard.complete(record.id, index, JSON.stringify(response));
    return { status: 200, body: response };
  } catch (error) {
    await guard.release(record.id, index);
    if (error instanceof GameRequestError) {
      return fail(error.code, error.message);
    }
    return fail("server-error", "Could not resolve the action");
  }
}
