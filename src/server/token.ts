import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";

/**
 * Sealed game tokens: AES-256-GCM over the compressed match record.
 *
 * The client holds the token but cannot read it (the enemy fleet's seed is
 * inside) or alter it (the GCM tag covers every byte). The key comes from
 * `GAME_SECRET`, which must be the same on every server instance; there is
 * deliberately no fallback, since any guessable key would expose the fleet.
 */

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_TOKEN_CHARS = 64 * 1024;

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) {
    const secret = process.env.GAME_SECRET;
    if (!secret || secret.length < 16) {
      throw new Error(
        "GAME_SECRET is not configured — set a long random value in the environment",
      );
    }
    cachedKey = createHash("sha256").update(secret, "utf8").digest();
  }
  return cachedKey;
}

export class TokenError extends Error {
  constructor(message = "Invalid game token") {
    super(message);
    this.name = "TokenError";
  }
}

export function sealToken(payload: unknown): string {
  const plain = brotliCompressSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, body]).toString(
    "base64url",
  );
}

export function openToken(token: unknown): unknown {
  if (typeof token !== "string" || token.length === 0) {
    throw new TokenError();
  }
  if (token.length > MAX_TOKEN_CHARS) {
    throw new TokenError("Game token too large");
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(token, "base64url");
  } catch {
    throw new TokenError();
  }
  if (raw.length < 1 + IV_BYTES + TAG_BYTES || raw[0] !== VERSION) {
    throw new TokenError();
  }
  const iv = raw.subarray(1, 1 + IV_BYTES);
  const tag = raw.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const body = raw.subarray(1 + IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    return JSON.parse(brotliDecompressSync(plain).toString("utf8"));
  } catch {
    throw new TokenError();
  }
}

/** A fresh unguessable match id. */
export function newGameId(): string {
  return randomBytes(16).toString("base64url");
}

/** A fresh 32-bit seed from the OS CSPRNG. */
export function newSeed(): number {
  return randomBytes(4).readUInt32BE(0);
}
