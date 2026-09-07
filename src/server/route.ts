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
    return respond({
      status: 400,
      body: { error: "bad-request", message: "Request too large" },
    });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond({
      status: 400,
      body: { error: "bad-request", message: "Expected a JSON body" },
    });
  }
  return respond(await handler(body));
}

function respond({ status, body }: ApiResult): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
