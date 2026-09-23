import "server-only";
import { ApiResult } from "./api";
import { clientKey, rateLimited } from "./rateLimit";

const MAX_BODY_BYTES = 128 * 1024;

/** Common wrapper for the game route handlers: throttle, parse, respond. */
export async function gameRoute(
  request: Request,
  handler: (body: unknown) => ApiResult | Promise<ApiResult>,
): Promise<Response> {
  if (rateLimited(clientKey(request))) {
    return respond({
      status: 429,
      body: { error: "rate-limited", message: "Too many requests" },
    });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return respond(tooLarge);
  }
  let text: string;
  try {
    text = await readBounded(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLarge) {
      return respond(tooLarge);
    }
    return respond(badJson);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return respond(badJson);
  }
  try {
    return respond(await handler(body));
  } catch {
    return respond({
      status: 500,
      body: { error: "server-error", message: "Fleet command is unavailable" },
    });
  }
}

const tooLarge: ApiResult = {
  status: 413,
  body: { error: "bad-request", message: "Request too large" },
};
const badJson: ApiResult = {
  status: 400,
  body: { error: "bad-request", message: "Expected a JSON body" },
};

class BodyTooLarge extends Error {}

/**
 * Read the body as UTF-8, aborting once it exceeds `limit` bytes. The
 * content-length header is advisory (absent on chunked uploads), so the
 * limit is enforced on the bytes actually received.
 */
async function readBounded(request: Request, limit: number): Promise<string> {
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw new BodyTooLarge();
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function respond({ status, body }: ApiResult): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
