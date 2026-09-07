import type {
  ActResponse,
  ApiError,
  ApiErrorCode,
  CampaignRequest,
  CampaignResponse,
  GameMode,
  PlayerAction,
  PublicState,
  StartRequest,
  StartResponse,
} from "./protocol";
import type { ShipPlacement } from "./types";

/**
 * Browser-side client for the game server. This is all the browser knows
 * about a match: the player's own fleet, the opaque token, and the public
 * state the server last reported.
 */

export class GameApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode | "network",
    message: string,
    public readonly status = 0,
  ) {
    super(message);
    this.name = "GameApiError";
  }
}

export interface RemoteGame {
  mode: GameMode;
  fleet: ShipPlacement[];
  token: string;
  state: PublicState;
}

const RETRIES = 2;

async function post<T>(url: string, body: unknown): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (response.ok) {
      return payload as T;
    }
    const apiError = payload as Partial<ApiError> | null;
    if (response.status >= 500 || response.status === 429) {
      lastError = new GameApiError(
        apiError?.error ?? "server-error",
        apiError?.message ?? "The game server is unavailable",
        response.status,
      );
      continue;
    }
    throw new GameApiError(
      apiError?.error ?? "bad-request",
      apiError?.message ?? "The game server rejected the request",
      response.status,
    );
  }
  if (lastError instanceof GameApiError) {
    throw lastError;
  }
  throw new GameApiError("network", "Could not reach the game server");
}

export async function startGame(request: StartRequest): Promise<RemoteGame> {
  const response = await post<StartResponse>("/api/game/start", request);
  return {
    mode: request.mode,
    fleet: request.fleet,
    token: response.token,
    state: response.state,
  };
}

/** Submit one action; the returned game carries the advanced token/state. */
export async function sendAction(
  game: RemoteGame,
  action: PlayerAction,
): Promise<{ game: RemoteGame; response: ActResponse }> {
  const response = await post<ActResponse>("/api/game/act", {
    token: game.token,
    action,
  });
  return {
    game: { ...game, token: response.token, state: response.state },
    response,
  };
}

export async function campaignRequest(
  request: CampaignRequest,
): Promise<CampaignResponse> {
  return post<CampaignResponse>("/api/campaign", request);
}
