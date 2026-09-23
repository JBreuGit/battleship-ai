import { describe, expect, it } from "vitest";
import { createCampaignState } from "./campaign";
import {
  isActResponse,
  isCampaignResponse,
  isCoordinate,
  isPublicState,
  isStartResponse,
  isWireEvent,
  isWireShotResult,
  type ActResponse,
  type PublicState,
  type WireEvent,
} from "./protocol";

const state: PublicState = {
  turn: 0,
  winner: null,
  shotsRemaining: 1,
  shotsFired: [3, 2],
  uses: { recon: 2, barrage: 1, sonar: 2, "rapid-fire": 2 },
  abilityAvailable: {
    recon: true,
    barrage: true,
    sonar: false,
    "rapid-fire": true,
  },
  stealth: [true, false],
  usedSpecials: [1],
  actionIndex: 5,
};

const events: WireEvent[] = [
  { kind: "shot", target: { x: 0, y: 0 }, result: { outcome: "miss" } },
  { kind: "shot", target: { x: 1, y: 0 }, result: { outcome: "evaded" } },
  {
    kind: "shot",
    target: { x: 2, y: 0 },
    result: {
      outcome: "sunk",
      sunkShip: [
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
      shipId: 4,
    },
  },
  { kind: "rapid-fire" },
  {
    kind: "recon",
    center: { x: 5, y: 5 },
    report: { cells: [{ x: 4, y: 4 }], contacts: [] },
  },
  {
    kind: "sonar",
    center: { x: 5, y: 5 },
    report: { cells: [{ x: 4, y: 4 }], contacts: 2, revealedOwnCell: null },
  },
  {
    kind: "sonar",
    center: { x: 5, y: 5 },
    report: { cells: [], contacts: 0, revealedOwnCell: { x: 9, y: 9 } },
  },
  {
    kind: "barrage",
    center: { x: 5, y: 5 },
    report: {
      shots: [{ target: { x: 5, y: 5 }, result: { outcome: "hit" } }],
      skipped: [{ x: 5, y: 6 }],
    },
  },
];

const ok: ActResponse = { token: "t1", you: events, enemy: [], state };

describe("wire guards", () => {
  it("accept every legitimate event and state shape", () => {
    expect(isPublicState(state)).toBe(true);
    for (const event of events) {
      expect(isWireEvent(event)).toBe(true);
    }
    expect(isActResponse(ok)).toBe(true);
    expect(isStartResponse({ token: "t", state })).toBe(true);
    expect(
      isActResponse({
        ...ok,
        campaign: {
          token: "c",
          state: createCampaignState(),
          won: true,
          promotedTo: { title: "Lieutenant", fromLevel: 2 },
          upgradePointEarned: false,
        },
      }),
    ).toBe(true);
    expect(
      isCampaignResponse({ token: "c", state: createCampaignState() }),
    ).toBe(true);
  });

  it("reject coordinates and shot results outside the rules", () => {
    for (const bad of [
      null,
      {},
      { x: 0 },
      { x: -1, y: 0 },
      { x: 10, y: 0 },
      { x: 1.5, y: 0 },
      { x: "1", y: 0 },
    ]) {
      expect(isCoordinate(bad)).toBe(false);
    }
    for (const bad of [
      null,
      {},
      { outcome: "boom" },
      { outcome: "sunk", sunkShip: [null] },
      { outcome: "sunk", sunkShip: [{ x: 0, y: 0 }], shipId: 9 },
      { outcome: "evaded", shipId: 1 },
    ]) {
      expect(isWireShotResult(bad)).toBe(false);
    }
  });

  it("reject malformed events nested anywhere in a reply", () => {
    const junkEvents: unknown[] = [
      null,
      "shot",
      { kind: "torpedo" },
      { kind: "shot", target: { x: 0, y: 0 } },
      { kind: "shot", target: { x: 0, y: 11 }, result: { outcome: "miss" } },
      { kind: "recon", center: { x: 1, y: 1 }, report: { cells: [1], contacts: [] } },
      {
        kind: "sonar",
        center: { x: 1, y: 1 },
        report: { cells: [], contacts: -1, revealedOwnCell: null },
      },
      {
        kind: "sonar",
        center: { x: 1, y: 1 },
        report: { cells: [], contacts: 0, revealedOwnCell: undefined },
      },
      {
        kind: "barrage",
        center: { x: 1, y: 1 },
        report: { shots: [{ target: { x: 1, y: 1 } }], skipped: [] },
      },
    ];
    for (const junk of junkEvents) {
      expect(isWireEvent(junk)).toBe(false);
      expect(isActResponse({ ...ok, you: [junk] })).toBe(false);
      expect(isActResponse({ ...ok, enemy: [events[0], junk] })).toBe(false);
    }
  });

  it("reject public state with missing or out-of-range fields", () => {
    const variants: Partial<Record<keyof PublicState, unknown>>[] = [
      { turn: 2 },
      { winner: "0" },
      { shotsRemaining: -1 },
      { shotsFired: [1] },
      { shotsFired: [1, "2"] },
      { uses: { recon: 1 } },
      { uses: { ...state.uses, sonar: "2" } },
      { abilityAvailable: { ...state.abilityAvailable, recon: 1 } },
      { stealth: [true] },
      { usedSpecials: [7] },
      { usedSpecials: [null] },
      { actionIndex: 1.5 },
    ];
    for (const variant of variants) {
      expect(isPublicState({ ...state, ...variant })).toBe(false);
      expect(isActResponse({ ...ok, state: { ...state, ...variant } })).toBe(
        false,
      );
    }
  });

  it("reject campaign payloads the armory cannot render", () => {
    for (const bad of [
      { token: "c", state: { level: 1 } },
      { token: "c", state: { ...createCampaignState(), level: 99 } },
      { token: "c", state: { ...createCampaignState(), version: 2 } },
      { token: "", state: createCampaignState() },
    ]) {
      expect(isCampaignResponse(bad)).toBe(false);
    }
    const base = {
      token: "c",
      state: createCampaignState(),
      won: false,
      promotedTo: null,
      upgradePointEarned: false,
    };
    for (const bad of [
      { ...base, won: "yes" },
      { ...base, promotedTo: { title: 5 } },
      { ...base, upgradePointEarned: undefined },
    ]) {
      expect(isActResponse({ ...ok, campaign: bad })).toBe(false);
    }
    expect(isActResponse({ ...ok, campaign: base })).toBe(true);
  });
});
