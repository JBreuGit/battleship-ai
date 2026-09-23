import "server-only";
import { createHash } from "node:crypto";

/**
 * Replay guard: each accepted action index of a match may be claimed once.
 *
 * Tokens are self-contained, so without this a client could keep an old
 * token and re-submit it with different shots to probe the hidden fleet.
 * Every `(gameId, actionIndex)` is claimed atomically with a fingerprint of
 * the action; the same action again is an idempotent retry (the cached
 * response is returned), a different one is rejected as stale.
 *
 * Backed by Upstash/Vercel KV over REST when configured (shared across
 * serverless instances), otherwise by a bounded in-process map.
 */

const TTL_SECONDS = 24 * 60 * 60;
const MEMORY_LIMIT = 50_000;

export interface GuardStore {
  /** SET key value NX EX ttl — true when the key was newly created. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export class MemoryGuardStore implements GuardStore {
  private readonly entries = new Map<string, { value: string; expires: number }>();

  constructor(private readonly limit = MEMORY_LIMIT) {}

  private read(key: string): string | null {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  private write(key: string, value: string, ttlSeconds: number): void {
    this.entries.delete(key);
    if (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (this.read(key) !== null) {
      return false;
    }
    this.write(key, value, ttlSeconds);
    return true;
  }

  async get(key: string) {
    return this.read(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.write(key, value, ttlSeconds);
  }

  async del(key: string) {
    this.entries.delete(key);
  }
}

/** Upstash Redis (also what Vercel KV provisions) over its REST API. */
export class UpstashGuardStore implements GuardStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private async command(...args: (string | number)[]): Promise<unknown> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Replay store responded ${response.status}`);
    }
    const data = (await response.json()) as { result?: unknown; error?: string };
    if (data.error) {
      throw new Error(`Replay store error: ${data.error}`);
    }
    return data.result;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    return (await this.command("SET", key, value, "NX", "EX", ttlSeconds)) === "OK";
  }

  async get(key: string) {
    const result = await this.command("GET", key);
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.command("SET", key, value, "EX", ttlSeconds);
  }

  async del(key: string) {
    await this.command("DEL", key);
  }
}

let defaultStore: GuardStore | null = null;

export function defaultGuardStore(): GuardStore {
  if (!defaultStore) {
    const url =
      process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
    const token =
      process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
    defaultStore =
      url && token ? new UpstashGuardStore(url, token) : new MemoryGuardStore();
  }
  return defaultStore;
}

export type Claim =
  | { kind: "fresh" }
  /** Same action re-sent (e.g. a network retry); the original response. */
  | { kind: "replay"; response: string }
  /** Same action re-sent while the first request is still in flight. */
  | { kind: "pending" }
  /** A different action on an already-consumed token. */
  | { kind: "stale" };

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
}

const claimKey = (gameId: string, index: number) => `bs:v1:${gameId}:${index}`;
const responseKey = (gameId: string, index: number) =>
  `bs:v1:${gameId}:${index}:r`;

export class ReplayGuard {
  constructor(private readonly store: GuardStore) {}

  async claim(gameId: string, index: number, print: string): Promise<Claim> {
    if (await this.store.setIfAbsent(claimKey(gameId, index), print, TTL_SECONDS)) {
      return { kind: "fresh" };
    }
    const existing = await this.store.get(claimKey(gameId, index));
    if (existing !== print) {
      return { kind: "stale" };
    }
    const response = await this.store.get(responseKey(gameId, index));
    return response === null ? { kind: "pending" } : { kind: "replay", response };
  }

  async complete(gameId: string, index: number, response: string): Promise<void> {
    await this.store.set(responseKey(gameId, index), response, TTL_SECONDS);
  }

  /**
   * Give the slot back when processing failed after the claim, or when the
   * cached response turned out unusable. The response goes first so a new
   * claimant can never pair its fresh claim with the old payload.
   */
  async release(gameId: string, index: number): Promise<void> {
    await this.store.del(responseKey(gameId, index));
    await this.store.del(claimKey(gameId, index));
  }
}
