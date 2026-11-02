import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const engine = await getEngine();
  return Response.json(engine.catalogState(), { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const engine = await getEngine();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id === "string") {
    await engine.setEnabled(body.id, true);
    return Response.json({ ok: true, state: engine.catalogState() });
  }

  if (typeof body.presetId === "string") {
    const result = await engine.addCustomProvider({ presetId: body.presetId });
    return Response.json({ ...result, state: engine.catalogState() }, { status: result.ok ? 200 : 400 });
  }

  const result = await engine.addCustomProvider({
    name: typeof body.name === "string" ? body.name : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    keyEnv: typeof body.keyEnv === "string" ? body.keyEnv : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
  });
  return Response.json({ ...result, state: engine.catalogState() }, { status: result.ok ? 200 : 400 });
}

export async function PATCH(request: NextRequest) {
  const engine = await getEngine();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
    return Response.json({ ok: false, error: "id and enabled are required" }, { status: 400 });
  }
  await engine.setEnabled(body.id, body.enabled);
  return Response.json({ ok: true, state: engine.catalogState() });
}
