import { describe, expect, it } from "vitest";
import { createSecureRng, isSeed, newSeed } from "./rng";

describe("secure match seed", () => {
  it("issues 256-bit hex seeds that never repeat", () => {
    const seeds = new Set(Array.from({ length: 50 }, newSeed));
    expect(seeds.size).toBe(50);
    for (const seed of seeds) {
      expect(isSeed(seed)).toBe(true);
      expect(seed).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("rejects anything that is not a full lowercase hex seed", () => {
    for (const bad of [42, "", "abc", "A".repeat(64), "g".repeat(64), null, {}]) {
      expect(isSeed(bad)).toBe(false);
    }
    expect(() => createSecureRng("1234")).toThrow("Invalid seed");
  });

  it("is deterministic per seed and uniform in [0, 1)", () => {
    const seed = newSeed();
    const a = createSecureRng(seed);
    const b = createSecureRng(seed);
    const other = createSecureRng(newSeed());
    let sum = 0;
    let differs = false;
    for (let i = 0; i < 4000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
      differs ||= x !== other();
    }
    expect(differs).toBe(true);
    expect(sum / 4000).toBeGreaterThan(0.45);
    expect(sum / 4000).toBeLessThan(0.55);
  });
});
