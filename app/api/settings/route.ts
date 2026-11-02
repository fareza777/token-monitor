import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const engine = await getEngine();
  return Response.json({ settings: engine.settings }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const engine = await getEngine();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Partial<Settings> = {};
  if (typeof body.monthlyBudgetUsd === "number" && body.monthlyBudgetUsd > 0) {
    patch.monthlyBudgetUsd = Math.min(10_000_000, body.monthlyBudgetUsd);
  }
  if (body.claudePlan === "pro" || body.claudePlan === "max5" || body.claudePlan === "max20" || body.claudePlan === "custom") {
    patch.claudePlan = body.claudePlan;
  }
  if (typeof body.claudeWeeklyTokens === "number" && body.claudeWeeklyTokens > 0) {
    patch.claudeWeeklyTokens = body.claudeWeeklyTokens;
  }
  if (body.codexPlan === "plus" || body.codexPlan === "pro" || body.codexPlan === "business") {
    patch.codexPlan = body.codexPlan;
  }

  const settings = await engine.updateSettings(patch);
  return Response.json({ ok: true, settings });
}
