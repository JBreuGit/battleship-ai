import "server-only";

/**
 * Best-effort per-client request throttle (sliding window, in-process).
 * Serverless instances each keep their own counters, so this bounds abuse
 * per instance rather than globally; it exists to blunt brute-force probing
 * of the API, not as the security boundary.
 */

const WINDOW_MS = 60_000;
const LIMIT = 240;
const MAX_CLIENTS = 10_000;

const hits = new Map<string, number[]>();

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  return ip || "anonymous";
}

export function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length <= LIMIT) {
    recent.push(now);
  }
  if (!hits.has(key) && hits.size >= MAX_CLIENTS) {
    const oldest = hits.keys().next().value;
    if (oldest !== undefined) {
      hits.delete(oldest);
    }
  }
  hits.set(key, recent);
  return recent.length > LIMIT;
}
