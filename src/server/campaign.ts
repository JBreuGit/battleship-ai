import "server-only";
import {
  CampaignState,
  SHIP_CLASS_IDS,
  ShipClassId,
  applyUpgrade,
  createCampaignState,
  deserializeCampaign,
  serializeCampaign,
} from "@/game/campaign";
import { CampaignRequest, CampaignResponse } from "@/game/protocol";
import { GameRequestError } from "./engine";
import { TokenError, openToken, sealToken } from "./token";

/**
 * Battle Commander saves are sealed server-side. The browser stores the
 * sealed token (plus a readable copy for display) but every change — an
 * upgrade, a win, a loss — is computed here from the verified token, so a
 * player cannot edit their level, rank, or weapon tiers.
 */

interface CampaignRecord {
  v: 1;
  kind: "campaign";
  state: string;
}

export function sealCampaign(state: CampaignState): string {
  const record: CampaignRecord = {
    v: 1,
    kind: "campaign",
    state: serializeCampaign(state),
  };
  return sealToken(record);
}

export function openCampaign(token: unknown): CampaignState {
  const opened = openToken(token) as Partial<CampaignRecord> | null;
  if (
    !opened ||
    opened.v !== 1 ||
    opened.kind !== "campaign" ||
    typeof opened.state !== "string"
  ) {
    throw new TokenError("Invalid campaign save");
  }
  const state = deserializeCampaign(opened.state);
  if (!state) {
    throw new TokenError("Invalid campaign save");
  }
  return state;
}

export function campaignResponse(state: CampaignState): CampaignResponse {
  return { token: sealCampaign(state), state };
}

export function parseCampaignRequest(body: unknown): CampaignRequest {
  if (typeof body !== "object" || body === null) {
    throw new GameRequestError("bad-request", "Expected a JSON object");
  }
  const { op, token, ship } = body as Record<string, unknown>;
  switch (op) {
    case "load":
      return { op, token: typeof token === "string" ? token : null };
    case "upgrade":
      if (typeof token !== "string") {
        throw new GameRequestError("bad-request", "Missing campaign save");
      }
      if (
        typeof ship !== "number" ||
        !SHIP_CLASS_IDS.includes(ship as ShipClassId)
      ) {
        throw new GameRequestError("bad-request", "Unknown ship class");
      }
      return { op, token, ship: ship as ShipClassId };
    case "reset":
      return { op };
    default:
      throw new GameRequestError("bad-request", "Unknown campaign operation");
  }
}

/** Apply a campaign save operation; throws TokenError / GameRequestError. */
export function runCampaignRequest(request: CampaignRequest): CampaignResponse {
  switch (request.op) {
    case "load":
      return campaignResponse(
        request.token === null
          ? createCampaignState()
          : openCampaign(request.token),
      );
    case "upgrade": {
      const state = openCampaign(request.token);
      const next = applyUpgrade(state, request.ship);
      if (next === state) {
        throw new GameRequestError(
          "illegal-action",
          "No upgrade point to spend on that ship",
        );
      }
      return campaignResponse(next);
    }
    case "reset":
      return campaignResponse(createCampaignState());
  }
}
