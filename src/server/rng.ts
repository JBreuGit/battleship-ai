import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Rng } from "@/game/rng";

/**
 * Deterministic random stream for server-side matches.
 *
 * Every hidden decision in a match — the enemy fleet, every AI shot — is
 * derived from the seed, so the seed space must be far too large to search:
 * a small (e.g. 32-bit) seed could be brute-forced offline from the first
 * few observed AI shots and the whole enemy fleet recovered. This stream is
 * SHA-256 in counter mode over a 256-bit seed; replaying the same seed
 * yields the same match, but the seed cannot be inferred from the output.
 */

const SEED_BYTES = 32;
const SEED_PATTERN = /^[0-9a-f]{64}$/;
/** Floats per 32-byte digest (53 bits of each 8-byte word). */
const PER_BLOCK = 4;

export function isSeed(value: unknown): value is string {
  return typeof value === "string" && SEED_PATTERN.test(value);
}

export function newSeed(): string {
  return randomBytes(SEED_BYTES).toString("hex");
}

export function createSecureRng(seed: string): Rng {
  if (!isSeed(seed)) {
    throw new Error("Invalid seed");
  }
  const key = Buffer.from(seed, "hex");
  const counter = Buffer.alloc(8);
  let block = Buffer.alloc(0);
  let used = PER_BLOCK;
  let n = 0;
  return () => {
    if (used === PER_BLOCK) {
      counter.writeUInt32BE(n++, 4);
      block = createHash("sha256").update(key).update(counter).digest();
      used = 0;
    }
    const offset = used * 8;
    used += 1;
    const hi = block.readUInt32BE(offset) >>> 11;
    const lo = block.readUInt32BE(offset + 4);
    return (hi * 2 ** 32 + lo) / 2 ** 53;
  };
}
