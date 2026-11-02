import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine";
import type { RangeKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = new Set<RangeKey>(["1h", "24h", "7d", "30d"]);

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("range") ?? "1h";
  const range = (RANGES.has(requested as RangeKey) ? requested : "1h") as RangeKey;
  const engine = await getEngine();
  return Response.json(engine.snapshot(range), {
    headers: { "cache-control": "no-store" },
  });
}
