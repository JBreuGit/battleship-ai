import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GameApiError,
  RemoteGame,
  isUncertainApiError,
  sendAction,
} from "./client";
import type { PublicState } from "./protocol";

const state = { turn: 0, winner: null, actionIndex: 0 } as unknown as PublicState;
const game: RemoteGame = { mode: "classic", fleet: [], token: "t0", state };
const action = { type: "fire", target: { x: 1, y: 2 } } as const;
const ok = { token: "t1", you: [], enemy: [], state: { ...state, actionIndex: 1 } };

const reply = (status: number, body: unknown) =>
  new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("sendAction", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resends the identical action while the server reports it as pending", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(409, { error: "pending-action", message: "wait" }))
      .mockResolvedValueOnce(reply(503, undefined))
      .mockResolvedValueOnce(reply(200, ok));
    const pending = sendAction(game, action);
    await vi.runAllTimersAsync();
    const { game: next, response } = await pending;
    expect(response.token).toBe("t1");
    expect(next.token).toBe("t1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const bodies = fetchMock.mock.calls.map(([, init]) => init?.body);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0] as string)).toEqual({ token: "t0", action });
  });

  it("does not retry definitive rejections", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(409, { error: "stale-token", message: "used" }),
    );
    const failed = sendAction(game, action);
    const settled = failed.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await settled;
    expect(error).toBeInstanceOf(GameApiError);
    expect((error as GameApiError).code).toBe("stale-token");
    expect(isUncertainApiError(error)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an unreadable success reply as uncertain and gives up after the retries", async () => {
    fetchMock.mockResolvedValue(new Response("null", { status: 200 }));
    const failed = sendAction(game, action);
    const settled = failed.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await settled;
    expect((error as GameApiError).code).toBe("server-error");
    expect(isUncertainApiError(error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("classifies network failures as uncertain", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const failed = sendAction(game, action);
    const settled = failed.catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await settled;
    expect((error as GameApiError).code).toBe("network");
    expect(isUncertainApiError(error)).toBe(true);
  });
});
