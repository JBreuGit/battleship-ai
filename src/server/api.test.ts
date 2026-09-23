import { describe, expect, it } from "vitest";
import { coordKey } from "@/game/board";
import { randomFleet } from "@/game/placement";
import { createCampaignState } from "@/game/campaign";
import {
  ActResponse,
  ApiError,
  CampaignResponse,
  StartResponse,
} from "@/game/protocol";
import { createRng } from "@/game/rng";
import { handleAct, handleCampaign, handleStart } from "./api";
import { sealCampaign } from "./campaign";
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

  it("accepts only the canonical base64url encoding", () => {
    const token = sealToken({ hello: "world" });
    expect(() => openToken(token + "=")).toThrow();
    expect(() => openToken(token + "A")).toThrow();
    expect(() => openToken(token.replace(/-/g, "+").replace(/_/g, "/") + "+")).toThrow();
    const raw = Buffer.from(token, "base64url");
    raw[0] = 2;
    expect(() => openToken(raw.toString("base64url"))).toThrow();
    expect(() => openToken("A".repeat(70 * 1024))).toThrow();
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

const guard = () => new ReplayGuard(new MemoryGuardStore());

describe("handleAct", () => {

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

  it("rejects sealed records that fail structural validation", async () => {
    const { token } = startClassic();
    const record = openToken(token) as Record<string, unknown>;
    const stale = sealToken({ ...record, issued: Date.now() - 48 * 60 * 60 * 1000 });
    const legacy = sealToken({ ...record, seed: 12345 });
    const bogus = sealToken({ ...record, actions: [{ type: "fire", target: { x: 10, y: 10 } }] });
    for (const bad of [stale, legacy, bogus]) {
      const result = await handleAct(
        { token: bad, action: { type: "fire", target: { x: 0, y: 0 } } },
        guard(),
      );
      expect(result.status).toBe(401);
    }
  });

  it("reports an in-flight identical action as pending rather than stale", async () => {
    const { token } = startClassic();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    class SlowStore extends MemoryGuardStore {
      async set(key: string, value: string, ttl: number) {
        await gate;
        await super.set(key, value, ttl);
      }
    }
    const g = new ReplayGuard(new SlowStore());
    const action = { type: "fire", target: { x: 1, y: 1 } };
    const first = handleAct({ token, action }, g);
    const second = await handleAct({ token, action }, g);
    expect(second.status).toBe(409);
    expect((second.body as ApiError).error).toBe("pending-action");
    finish();
    expect((await first).status).toBe(200);
    const third = await handleAct({ token, action }, g);
    expect(third.body).toEqual((await first).body);
  });

  it("does not crash on a corrupt replay cache entry", async () => {
    const { token } = startClassic();
    const store = new MemoryGuardStore();
    const g = new ReplayGuard(store);
    const action = { type: "fire", target: { x: 1, y: 1 } };
    await handleAct({ token, action }, g);
    const { id } = openToken(token) as { id: string };
    await store.set(`bs:v1:${id}:0:r`, "{not json", 60);
    const result = await handleAct({ token, action }, g);
    expect(result.status).toBe(500);
    expect((result.body as ApiError).error).toBe("server-error");
  });

  it("rejects a forged campaign level via the token", async () => {
    const { token } = startClassic();
    const record = openToken(token) as Record<string, unknown>;
    const forged = sealToken({ ...record, mode: "campaign", level: 20 });
    // Re-sealing with the real key is only possible server-side; even then the
    // record must be self-consistent — a classic record lacks a campaign save,
    // so the sealed payload is refused before any replay happens.
    const result = await handleAct({ token: forged, action: { type: "boost", ship: 4 } }, guard());
    expect(result.status).toBe(401);
    expect((result.body as ApiError).error).toBe("invalid-token");
  });
});

describe("campaign saves", () => {
  it("loads a fresh save without a token and round-trips a sealed one", () => {
    const fresh = handleCampaign({ op: "load", token: null });
    expect(fresh.status).toBe(200);
    const { token, state } = fresh.body as CampaignResponse;
    expect(state.level).toBe(1);
    const again = handleCampaign({ op: "load", token });
    expect((again.body as CampaignResponse).state).toEqual(state);
  });

  it("rejects plain JSON, tampered, and game tokens as campaign saves", () => {
    const plain = JSON.stringify({ ...createCampaignState(), level: 20 });
    expect(handleCampaign({ op: "load", token: plain }).status).toBe(401);
    const { token } = handleCampaign({ op: "load", token: null }).body as CampaignResponse;
    expect(handleCampaign({ op: "load", token: token.slice(0, -3) + "AAA" }).status).toBe(401);
    const game = startClassic().token;
    expect(handleCampaign({ op: "load", token: game }).status).toBe(401);
    expect(
      handleStart({ mode: "campaign", difficulty: "easy", fleet, campaignToken: plain }).status,
    ).toBe(401);
  });

  it("only spends upgrade points the save actually holds", () => {
    const broke = sealCampaign(createCampaignState());
    expect(handleCampaign({ op: "upgrade", token: broke, ship: 0 }).status).toBe(422);
    const rich = sealCampaign({ ...createCampaignState(), unspentUpgradePoints: 1 });
    const upgraded = handleCampaign({ op: "upgrade", token: rich, ship: 0 });
    expect(upgraded.status).toBe(200);
    const { state, token } = upgraded.body as CampaignResponse;
    expect(state.upgrades[0]).toBe(2);
    expect(state.unspentUpgradePoints).toBe(0);
    expect(handleCampaign({ op: "upgrade", token, ship: 1 }).status).toBe(422);
  });

  it("advances the save only when the server sees the battle won", async () => {
    const save = sealCampaign({ ...createCampaignState(), level: 3 });
    const started = handleStart({
      mode: "campaign",
      difficulty: "easy",
      fleet,
      campaignToken: save,
    });
    expect(started.status).toBe(200);
    let { token } = started.body as StartResponse;
    const g = new ReplayGuard(new MemoryGuardStore());
    let update: ActResponse["campaign"];
    outer: for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const result = await handleAct(
          { token, action: { type: "fire", target: { x, y } } },
          g,
        );
        const body = result.body as ActResponse;
        if (result.status !== 200) {
          throw new Error(JSON.stringify(result.body));
        }
        token = body.token;
        if (body.campaign) {
          update = body.campaign;
          break outer;
        }
        expect(body.campaign).toBeUndefined();
      }
    }
    expect(update).toBeDefined();
    if (update!.won) {
      expect(update!.state.level).toBe(4);
      expect(update!.upgradePointEarned).toBe(true);
    } else {
      expect(update!.state.level).toBe(3);
      expect(update!.state.records[3].losses).toBe(1);
    }
    const reloaded = handleCampaign({ op: "load", token: update!.token });
    expect((reloaded.body as CampaignResponse).state).toEqual(update!.state);
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
            const sunk =
              event.result.outcome === "evaded" ? [] : event.result.sunkShip ?? [];
            for (const cell of sunk) {
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
