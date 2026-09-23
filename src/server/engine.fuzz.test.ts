import { describe, expect, it } from "vitest";
import { Difficulty } from "@/game/ai";
import { coordKey } from "@/game/board";
import {
  CampaignState,
  ShipClassId,
  WeaponTier,
  createCampaignState,
} from "@/game/campaign";
import { randomFleet } from "@/game/placement";
import { GameMode, PlayerAction, PublicState } from "@/game/protocol";
import { Rng, createRng } from "@/game/rng";
import { BOARD_SIZE } from "@/game/types";
import {
  GameRecord,
  GameRequestError,
  act,
  createRecord,
  publicState,
  replay,
} from "./engine";
import { seedOf } from "@/test/fakeGameServer";

/**
 * Plays whole matches through the server engine with a random-but-mostly-
 * legal player in every mode, difficulty, and campaign level. Any exception
 * other than a rejected illegal action would strand a live game (the replay
 * is deterministic, so the client could never get past it).
 */

const GAMES_PER_CONFIG = 6;
const MAX_STEPS = 3000;

interface Config {
  mode: GameMode;
  difficulty: Difficulty;
  level?: number;
}

const configs: Config[] = [];
for (const difficulty of ["easy", "medium", "hard"] as const) {
  configs.push({ mode: "classic", difficulty }, { mode: "admiral", difficulty });
}
for (let level = 1; level <= 20; level++) {
  configs.push({ mode: "campaign", difficulty: "hard", level });
}

function randomTier(rng: Rng): WeaponTier {
  return (1 + Math.floor(rng() * 4)) as WeaponTier;
}

function randomCampaign(rng: Rng, level: number): CampaignState {
  return {
    ...createCampaignState(),
    level,
    upgrades: {
      0: randomTier(rng),
      1: randomTier(rng),
      2: randomTier(rng),
      3: randomTier(rng),
      4: randomTier(rng),
    },
  };
}

function randomCell(rng: Rng) {
  return {
    x: Math.floor(rng() * BOARD_SIZE),
    y: Math.floor(rng() * BOARD_SIZE),
  };
}

function randomAction(
  rng: Rng,
  fired: Set<string>,
  state: PublicState,
  record: GameRecord,
): PlayerAction {
  const roll = rng();
  if (roll < 0.08 && state.abilityAvailable["rapid-fire"]) {
    return { type: "rapid-fire" };
  }
  if (roll < 0.14 && state.abilityAvailable.recon) {
    return { type: "recon", center: randomCell(rng) };
  }
  if (roll < 0.2 && state.abilityAvailable.sonar) {
    return { type: "sonar", center: randomCell(rng) };
  }
  if (roll < 0.26 && state.abilityAvailable.barrage) {
    return { type: "barrage", center: randomCell(rng) };
  }
  if (roll < 0.4 && record.campaign) {
    const ship = Math.floor(rng() * 5) as ShipClassId;
    const tier = record.campaign.upgrades[ship];
    if (!state.usedSpecials.includes(ship)) {
      if (tier === 2) {
        return { type: "boost", ship };
      }
      if (tier === 3) {
        return { type: "heavy", ship, cell: randomCell(rng) };
      }
      if (tier === 4) {
        return { type: "guided", ship };
      }
    }
  }
  for (;;) {
    const target = randomCell(rng);
    if (!fired.has(coordKey(target))) {
      return { type: "fire", target };
    }
  }
}

function playOne(rng: Rng, config: Config, id: string): number {
  const campaign = config.level ? randomCampaign(rng, config.level) : undefined;
  let record = createRecord(
    {
      mode: config.mode,
      difficulty: config.difficulty,
      fleet: randomFleet(rng),
      ...(campaign ? { campaignToken: "sealed" } : {}),
    },
    id,
    seedOf(Math.floor(rng() * 2 ** 32)),
    campaign,
  );
  let state = publicState(replay(record), record);
  const fired = new Set<string>();
  let steps = 0;
  while (state.winner === null) {
    if (++steps > MAX_STEPS) {
      throw new Error(`Runaway game: ${JSON.stringify(config)}`);
    }
    const action = randomAction(rng, fired, state, record);
    let outcome;
    try {
      outcome = act(record, action);
    } catch (error) {
      if (
        error instanceof GameRequestError &&
        error.code === "illegal-action"
      ) {
        continue;
      }
      throw new Error(
        `Engine crashed in ${JSON.stringify(config)} on ${JSON.stringify(action)}: ${String(error)}`,
      );
    }
    record = outcome.record;
    state = outcome.state;
    for (const event of outcome.you) {
      if (event.kind === "shot") {
        if (event.result.outcome === "evaded") {
          fired.delete(coordKey(event.target));
        } else {
          fired.add(coordKey(event.target));
        }
      } else if (event.kind === "barrage") {
        for (const shot of event.report.shots) {
          if (shot.result.outcome !== "evaded") {
            fired.add(coordKey(shot.target));
          }
        }
      }
    }
  }
  expect(replay(record).game.winner).toBe(state.winner);
  return record.actions.length;
}

describe("server engine fuzz", () => {
  it.each(configs)("survives random matches: %j", (config) => {
    const rng = createRng(
      (config.level ?? 0) * 1000 +
        ["classic", "admiral", "campaign"].indexOf(config.mode) * 100 +
        ["easy", "medium", "hard"].indexOf(config.difficulty),
    );
    for (let g = 0; g < GAMES_PER_CONFIG; g++) {
      const actions = playOne(rng, config, `fuzz-${g}`);
      expect(actions).toBeGreaterThan(0);
      expect(actions).toBeLessThan(400);
    }
  });
});
