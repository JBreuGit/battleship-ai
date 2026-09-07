import { handleCampaign } from "@/server/api";
import { gameRoute } from "@/server/route";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return gameRoute(request, handleCampaign);
}
