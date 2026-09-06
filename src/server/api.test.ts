import { describe, expect, it } from "vitest";
import { coordKey } from "@/game/board";
import { randomFleet } from "@/game/placement";
import { ActResponse, ApiError, StartResponse } from "@/game/protocol";
import { createRng } from "@/game/rng";
import { handleAct, handleStart } from "./api";
import { MemoryGuardStore, ReplayGuard } from "./replayGuard";
import { openToken, sealToken } from "./token";

const fleet = randomFleet(createRng(3));

function startClassic() {
  const result = handleStart({ mode: "classic", difficulty: "easy", fleet });
  expect(result.status).toBe(200);
  return result.body as StartResponse;
}

describe("token", () => {
  it("round-trips and rejects tampering", () => {
    const token = sealToken({ hello: "world" });
    expect(openToken(token)).toEqual({ hello: "world" });
    const flipped = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
    expect(() => openToken(flipped)).toThrow();
    expect(() => openToken("")).toThrow();
    expect(() => openToken(42)).toThrow();
    expect(() => openToken("not-base64!!")).toThrow();
  });

  it("does not expose its contents", () => {
    const token = sealToken({ seed: 424242, fleet });
    expect(token).not.toContain("424242");
    expect(token).not.toContain("bow");
  });
});

describe("handleStart", () => {
  it("returns a sealed token and a fog-of-war state only", () => {
    const { token, state } = startClassic();
    expect(typeof token).toBe("string");
    expect(state.turn).toBe(0);
    expect(state.winner).toBeNull();
    expect(state.actionIndex).toBe(0);
    expect(JSON.stringify(state)).not.toMatch(/bow|seed|ships/);
  });

  it("rejects invalid fleets with a 400", () => {
    const result = handleStart({ mode: "classic", difficulty: "easy", fleet: [] });
    expect(result.status).toBe(400);
    expect((result.body as ApiError).error).toBe("invalid-fleet");
  });
});

describe("handleAct", () => {
  const guard = () => new ReplayGuard(new MemoryGuardStore());

  it("applies a shot and advances the token", async () => {
    const { token } = startClassic();
    const result = await handleAct(
      { token, action: { type: "fire", target: { x: 0, y: 0 } } },
      guard(),
    );
    expect(result.status).toBe(200);
    const body = result.body as ActResponse;
    expect(body.token).not.toBe(token);
    expect(body.state.actionIndex).toBe(1);
    expect(body.you[0]).toMatchObject({ kind: "shot", target: { x: 0, y: 0 } });
  });

  it("rejects altered, foreign and missing tokens", async () => {
    const { token } = startClassic();
    const altered = token.slice(0, 20) + "x" + token.slice(21);
    for (const bad of [altered, "", undefined, sealToken({ v: 2 })]) {
      const result = await handleAct(
        { token: bad, action: { type: "fire", target: { x: 0, y: 0 } } },
        guard(),
      );
      expect(result.status).toBe(401);
    }
  });

  it("rejects out-of-bounds and repeated shots", async () => {
    const { token } = startClassic();
    const g = guard();
    const oob = await handleAct(
      { token, action: { type: "fire", target: { x: -1, y: 0 } } },
      g,
    );
    expect(oob.status).toBe(400);
    const first = await handleAct(
      { token, action: { type: "fire", target: { x: 3, y: 3 } } },
      g,
    );
    const next = (first.body as ActResponse).token;
    const repeat = await handleAct(
      { token: next, action: { type: "fire", target: { x: 3, y: 3 } } },
      g,
    );
    expect(repeat.status).toBe(422);
    expect((repeat.body as ApiError).error).toBe("illegal-action");
  });

  it("treats an identical resend as an idempotent retry", async () => {
    const { token } = startClassic();
    const g = guard();
    const action = { type: "fire", target: { x: 1, y: 1 } };
    const a = await handleAct({ token, action }, g);
    const b = await handleAct({ token, action }, g);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
  });

  it("refuses to rewind: a used token cannot fire a different shot", async () => {
    const { token } = startClassic();
    const g = guard();
    await handleAct({ token, action: { type: "fire", target: { x: 1, y: 1 } } }, g);
    const probe = await handleAct(
      { token, action: { type: "fire", target: { x: 2, y: 2 } } },
      g,
    );
    expect(probe.status).toBe(409);
    expect((probe.body as ApiError).error).toBe("stale-token");
  });

  it("releases the claim when the action is illegal so a legal one can follow", async () => {
    const { token } = startClassic();
    const g = guard();
    const illegal = await handleAct({ token, action: { type: "rapid-fire" } }, g);
    expect(illegal.status).toBe(422);
    const legal = await handleAct(
      { token, action: { type: "fire", target: { x: 4, y: 4 } } },
      g,
    );
    expect(legal.status).toBe(200);
  });

  it("rejects a forged campaign level via the token", async () => {
    const { token } = startClassic();
    const record = openToken(token) as Record<string, unknown>;
    const forged = sealToken({ ...record, mode: "campaign", level: 20 });
    // Re-sealing with the real key is only possible server-side; even then the
    // record must be self-consistent — a classic record lacks upgrades.
    const result = await handleAct({ token: forged, action: { type: "boost", ship: 4 } }, guard());
    expect(result.status).toBe(422);
  });

  it("a full game through the API never reveals unrevealed enemy cells", async () => {
    let { token } = startClassic();
    const g = guard();
    const seen = new Set<string>();
    let winner: number | null = null;
    outer: for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const result = await handleAct(
          { token, action: { type: "fire", target: { x, y } } },
          g,
        );
        if (result.status !== 200) {
          throw new Error(JSON.stringify(result.body));
        }
        const body = result.body as ActResponse;
        token = body.token;
        for (const event of body.you) {
          if (event.kind === "shot") {
            seen.add(coordKey(event.target));
            for (const cell of event.result.sunkShip ?? []) {
              // Sunk footprints are only ever cells the player already hit.
              expect(seen.has(coordKey(cell))).toBe(true);
            }
          }
        }
        winner = body.state.winner;
        if (winner !== null) break outer;
      }
    }
    expect(winner).not.toBeNull();
  });
});
