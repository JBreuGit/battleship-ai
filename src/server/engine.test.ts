import { describe, expect, it } from "vitest";
import { coordKey } from "@/game/board";
import {
  ABILITY_UNLOCK_LEVELS,
  ShipClassId,
  WeaponTier,
  createCampaignState,
} from "@/game/campaign";
import { randomFleet } from "@/game/placement";
import { PlayerAction, StartRequest, WireEvent } from "@/game/protocol";
import { createRng } from "@/game/rng";
import { Coordinate } from "@/game/types";
import {
  ENEMY,
  GameRecord,
  GameRequestError,
  MAX_ACTIONS,
  MAX_RECORD_AGE_MS,
  PLAYER,
  act,
  createRecord,
  parseAction,
  parseGameRecord,
  parseStartRequest,
  publicState,
  replay,
} from "./engine";
import { seedOf } from "@/test/fakeGameServer";

const fleet = randomFleet(createRng(7));

function start(overrides: Partial<StartRequest> = {}): GameRecord {
  return createRecord(
    { mode: "classic", difficulty: "easy", fleet, ...overrides },
    "game-1",
    seedOf(12345),
  );
}

const tiers = (t: WeaponTier): Record<ShipClassId, WeaponTier> => ({
  0: t,
  1: t,
  2: t,
  3: t,
  4: t,
});

function campaign(level: number, tier: WeaponTier = 1): GameRecord {
  return createRecord(
    { mode: "campaign", difficulty: "easy", fleet, campaignToken: "sealed" },
    "game-1",
    seedOf(12345),
    { ...createCampaignState(), level, upgrades: tiers(tier) },
  );
}

/** Cells of the hidden enemy fleet — test-only, read straight off the engine. */
function enemyCells(record: GameRecord): Set<string> {
  return new Set(replay(record).game.board(ENEMY).occupiedCells().map(coordKey));
}

function allCells(): Coordinate[] {
  const cells: Coordinate[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

const expectIllegal = (fn: () => unknown, code = "illegal-action") => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GameRequestError);
    expect((error as GameRequestError).code).toBe(code);
    return;
  }
  throw new Error("expected a GameRequestError");
};

describe("parseStartRequest", () => {
  it("accepts a valid classic request", () => {
    const parsed = parseStartRequest({ mode: "classic", difficulty: "hard", fleet });
    expect(parsed).toEqual({ mode: "classic", difficulty: "hard", fleet });
  });

  it("rejects unknown modes, difficulties and malformed bodies", () => {
    expectIllegal(() => parseStartRequest(null), "bad-request");
    expectIllegal(
      () => parseStartRequest({ mode: "god", difficulty: "easy", fleet }),
      "bad-request",
    );
    expectIllegal(
      () => parseStartRequest({ mode: "classic", difficulty: "trivial", fleet }),
      "bad-request",
    );
  });

  it("rejects fleets that break placement rules", () => {
    const touching = [
      { bow: { x: 0, y: 0 }, length: 5, orientation: "horizontal" },
      { bow: { x: 0, y: 1 }, length: 4, orientation: "horizontal" },
      { bow: { x: 0, y: 3 }, length: 3, orientation: "horizontal" },
      { bow: { x: 0, y: 5 }, length: 3, orientation: "horizontal" },
      { bow: { x: 0, y: 7 }, length: 2, orientation: "horizontal" },
    ];
    expectIllegal(
      () => parseStartRequest({ mode: "classic", difficulty: "easy", fleet: touching }),
      "invalid-fleet",
    );
    expectIllegal(
      () =>
        parseStartRequest({
          mode: "classic",
          difficulty: "easy",
          fleet: [{ bow: { x: 99, y: 0 }, length: 5, orientation: "horizontal" }],
        }),
      "invalid-fleet",
    );
    expectIllegal(
      () => parseStartRequest({ mode: "classic", difficulty: "easy", fleet: "x" }),
      "invalid-fleet",
    );
  });

  it("requires a sealed campaign save for campaign battles", () => {
    expectIllegal(
      () => parseStartRequest({ mode: "campaign", difficulty: "easy", fleet }),
      "bad-request",
    );
    expectIllegal(
      () =>
        parseStartRequest({
          mode: "campaign",
          difficulty: "easy",
          fleet,
          level: 20,
          upgrades: tiers(4),
        }),
      "bad-request",
    );
    const ok = parseStartRequest({
      mode: "campaign",
      difficulty: "easy",
      fleet,
      campaignToken: "sealed",
    });
    expect(ok.campaignToken).toBe("sealed");
    expectIllegal(
      () => createRecord(ok, "id", seedOf(1)),
      "bad-request",
    );
  });
});

describe("parseAction", () => {
  it("rejects off-board and malformed coordinates", () => {
    expectIllegal(() => parseAction({ type: "fire", target: { x: 10, y: 0 } }), "bad-request");
    expectIllegal(() => parseAction({ type: "fire", target: { x: 1.5, y: 0 } }), "bad-request");
    expectIllegal(() => parseAction({ type: "fire", target: "0,0" }), "bad-request");
    expectIllegal(() => parseAction({ type: "nuke" }), "bad-request");
    expectIllegal(() => parseAction({ type: "heavy", ship: 7, cell: { x: 0, y: 0 } }), "bad-request");
  });

  it("strips unknown fields", () => {
    expect(
      parseAction({ type: "fire", target: { x: 2, y: 3, hit: true }, forge: "win" }),
    ).toEqual({ type: "fire", target: { x: 2, y: 3 } });
  });
});

describe("parseGameRecord", () => {
  const id = "a".repeat(22);
  const valid = () =>
    JSON.parse(JSON.stringify(start({ mode: "admiral" }))) as Record<string, unknown>;
  const withId = (record: GameRecord): GameRecord => ({ ...record, id });

  it("round-trips records the server itself issued", () => {
    const now = Date.now();
    const classic = withId(start());
    expect(parseGameRecord(JSON.parse(JSON.stringify(classic)), now)).toEqual(classic);
    const played = withId(act(campaign(9, 3), { type: "fire", target: { x: 0, y: 0 } }).record);
    expect(parseGameRecord(JSON.parse(JSON.stringify(played)), now)).toEqual(played);
  });

  it("rejects structurally invalid or forged records", () => {
    const base = { ...valid(), id };
    const now = Date.now();
    expect(parseGameRecord(base, now)).not.toBeNull();
    const broken: Record<string, unknown>[] = [
      { ...base, v: 2 },
      { ...base, kind: "campaign" },
      { ...base, id: "short" },
      { ...base, id: "a".repeat(65) },
      { ...base, seed: 12345 },
      { ...base, seed: "z".repeat(64) },
      { ...base, issued: "now" },
      { ...base, mode: "god" },
      { ...base, difficulty: "trivial" },
      { ...base, fleet: [] },
      { ...base, actions: "none" },
      { ...base, actions: [{ type: "nuke" }] },
      { ...base, actions: [{ type: "fire", target: { x: 10, y: 0 } }] },
      { ...base, actions: new Array(MAX_ACTIONS + 1).fill({ type: "fire", target: { x: 0, y: 0 } }) },
      // A non-campaign record must not smuggle a campaign save in.
      { ...base, campaign: createCampaignState() },
      // A campaign record must carry a valid save.
      { ...base, mode: "campaign" },
      { ...base, mode: "campaign", campaign: { ...createCampaignState(), level: 99 } },
    ];
    for (const record of broken) {
      expect(parseGameRecord(record, now)).toBeNull();
    }
    expect(parseGameRecord(null, now)).toBeNull();
    expect(parseGameRecord("token", now)).toBeNull();
  });

  it("expires stale records and refuses ones issued in the future", () => {
    const now = Date.now();
    const base = { ...valid(), id, issued: now };
    expect(parseGameRecord(base, now + MAX_RECORD_AGE_MS - 1)).not.toBeNull();
    expect(parseGameRecord(base, now + MAX_RECORD_AGE_MS + 1)).toBeNull();
    expect(parseGameRecord({ ...base, issued: now + 120_000 }, now)).toBeNull();
  });
});

describe("act", () => {
  it("resolves shots against the hidden fleet and runs the AI reply", () => {
    const record = start();
    const hidden = enemyCells(record);
    const target = allCells().find((c) => hidden.has(coordKey(c)))!;
    const outcome = act(record, { type: "fire", target });
    expect(outcome.you).toHaveLength(1);
    const shot = outcome.you[0];
    expect(shot.kind).toBe("shot");
    if (shot.kind === "shot") {
      expect(["hit", "sunk", "fleet-sunk"]).toContain(shot.result.outcome);
    }
    expect(outcome.enemy.length).toBeGreaterThanOrEqual(1);
    expect(outcome.state.turn).toBe(PLAYER);
    expect(outcome.state.actionIndex).toBe(1);
    expect(outcome.record.actions).toEqual([{ type: "fire", target }]);
  });

  it("misses are misses regardless of what the client claims", () => {
    const record = start();
    const hidden = enemyCells(record);
    const target = allCells().find((c) => !hidden.has(coordKey(c)))!;
    const forged = { type: "fire", target, result: { outcome: "sunk" } } as PlayerAction;
    const outcome = act(record, forged);
    expect(outcome.you[0]).toMatchObject({ kind: "shot", result: { outcome: "miss" } });
  });

  it("rejects firing at a square twice", () => {
    const record = start();
    const target = { x: 0, y: 0 };
    const next = act(record, { type: "fire", target }).record;
    expectIllegal(() => act(next, { type: "fire", target }));
  });

  it("rejects Admiral abilities in classic mode and specials outside campaign", () => {
    const record = start();
    expectIllegal(() => act(record, { type: "rapid-fire" }));
    expectIllegal(() => act(record, { type: "recon", center: { x: 4, y: 4 } }));
    expectIllegal(() => act(record, { type: "boost", ship: 4 }));
    expectIllegal(() => act(record, { type: "guided", ship: 0 }));
  });

  it("rejects locked campaign abilities and allows unlocked ones", () => {
    const locked = campaign(ABILITY_UNLOCK_LEVELS["rapid-fire"] - 1);
    expectIllegal(() => act(locked, { type: "rapid-fire" }));
    expect(publicState(replay(locked), locked).abilityAvailable["rapid-fire"]).toBe(false);

    const unlocked = campaign(ABILITY_UNLOCK_LEVELS["rapid-fire"]);
    const outcome = act(unlocked, { type: "rapid-fire" });
    expect(outcome.you).toEqual([{ kind: "rapid-fire" }]);
    expect(outcome.state.shotsRemaining).toBe(2);
    expect(outcome.enemy).toEqual([]);
    expect(outcome.state.uses["rapid-fire"]).toBe(1);
  });

  it("rejects weapon specials the ship does not carry, and double use", () => {
    const record = campaign(5, 2);
    expectIllegal(() => act(record, { type: "heavy", ship: 1, cell: { x: 0, y: 0 } }));
    expectIllegal(() => act(record, { type: "guided", ship: 1 }));
    const boosted = act(record, { type: "boost", ship: 1 });
    expect(boosted.state.shotsRemaining).toBe(2);
    expect(boosted.state.usedSpecials).toEqual([1]);
    expectIllegal(() => act(boosted.record, { type: "boost", ship: 1 }));
    expectIllegal(() => act(boosted.record, { type: "boost", ship: 2 }), "illegal-action");
  });

  it("heavy shell blankets a 2x2 and guided shot always hits", () => {
    const heavy = act(campaign(9, 3), { type: "heavy", ship: 0, cell: { x: 9, y: 9 } });
    const salvo = heavy.you[0];
    expect(salvo.kind).toBe("barrage");
    if (salvo.kind === "barrage") {
      expect(salvo.report.shots.map((s) => coordKey(s.target)).sort()).toEqual(
        ["8,8", "9,8", "8,9", "9,9"].sort(),
      );
    }

    const record = campaign(12, 4);
    const hidden = enemyCells(record);
    const guided = act(record, { type: "guided", ship: 2 });
    const shot = guided.you[0];
    expect(shot.kind).toBe("shot");
    if (shot.kind === "shot") {
      expect(hidden.has(coordKey(shot.target))).toBe(true);
      expect(shot.result.outcome).not.toBe("miss");
    }
  });

  it("is deterministic under replay", () => {
    let record = start({ difficulty: "hard" });
    const transcript: WireEvent[][] = [];
    for (const target of allCells().slice(0, 12)) {
      const outcome = act(record, { type: "fire", target });
      transcript.push([...outcome.you, ...outcome.enemy]);
      record = outcome.record;
      if (outcome.state.winner !== null) break;
    }
    // Replaying the final record must reproduce the same AI shots.
    const live = replay(record);
    expect(live.game.shotsFired(PLAYER)).toBe(record.actions.length);
    const again = act({ ...record, actions: record.actions.slice(0, -1) }, record.actions.at(-1)!);
    expect([...again.you, ...again.enemy]).toEqual(transcript.at(-1));
  });

  it("plays a full classic game to a winner and then refuses more actions", () => {
    let record = start({ difficulty: "easy" });
    const hidden = enemyCells(record);
    const targets = allCells().filter((c) => hidden.has(coordKey(c)));
    let winner = null;
    for (const target of targets) {
      const outcome = act(record, { type: "fire", target });
      record = outcome.record;
      winner = outcome.state.winner;
      if (winner !== null) break;
    }
    expect(winner).not.toBeNull();
    expectIllegal(() => act(record, { type: "fire", target: { x: 0, y: 0 } }));
  });

  it("never leaks unrevealed enemy coordinates in events or state", () => {
    const record = start({ difficulty: "medium" });
    const outcome = act(record, { type: "fire", target: { x: 5, y: 5 } });
    const serialized = JSON.stringify({
      you: outcome.you,
      enemy: outcome.enemy,
      state: outcome.state,
    });
    expect(serialized).not.toContain("seed");
    expect(serialized).not.toContain("occupied");
    expect(Object.keys(outcome.state).sort()).toEqual(
      [
        "turn",
        "winner",
        "shotsRemaining",
        "shotsFired",
        "uses",
        "abilityAvailable",
        "stealth",
        "usedSpecials",
        "actionIndex",
      ].sort(),
    );
    // Any enemy coordinate present must be one the player fired at.
    for (const event of outcome.you) {
      if (event.kind === "shot" && event.result.outcome === "miss") {
        expect(coordKey(event.target)).toBe("5,5");
      }
    }
  });
});
