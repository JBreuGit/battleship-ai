import { describe, expect, it } from "vitest";
import { ApiResult } from "./api";
import { gameRoute } from "./route";

const echo = (body: unknown): ApiResult => ({ status: 200, body: body as ApiResult["body"] });

function streamed(chunks: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Request("http://localhost/api/game/act", {
    method: "POST",
    headers: { "x-forwarded-for": `10.0.0.${chunks.length}`, ...headers },
    body: stream,
    // @ts-expect-error -- required by undici for streamed request bodies
    duplex: "half",
  });
}

describe("gameRoute", () => {
  it("parses a JSON body and forwards it", async () => {
    const response = await gameRoute(streamed(['{"a":', "1}"]), echo);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ a: 1 });
  });

  it("rejects malformed JSON and empty bodies", async () => {
    for (const chunks of [["{nope"], []]) {
      const response = await gameRoute(streamed(chunks), echo);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "bad-request" });
    }
  });

  it("caps chunked bodies even without a content-length header", async () => {
    const chunk = "x".repeat(32 * 1024);
    const response = await gameRoute(streamed([chunk, chunk, chunk, chunk, chunk]), echo);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: "Request too large" });
    const declared = await gameRoute(
      streamed(["{}"], { "content-length": String(1024 * 1024) }),
      echo,
    );
    expect(declared.status).toBe(400);
  });

  it("turns unexpected handler failures into an opaque 500", async () => {
    const response = await gameRoute(streamed(["{}"]), () => {
      throw new Error("seed=deadbeef leaked?");
    });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "server-error", message: "Fleet command is unavailable" });
  });
});
