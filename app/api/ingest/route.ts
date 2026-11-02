import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawEvent = {
  providerId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  requests?: number;
  at?: number;
};

function authorized(request: NextRequest): boolean {
  const token = process.env.GATEWAY_INGEST_TOKEN;
  if (!token) return true;
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return bearer === token || request.headers.get("x-ingest-token") === token;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 512_000) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let inputs: RawEvent[] = [];
  if (Array.isArray(body)) {
    inputs = body as RawEvent[];
  } else if (body && typeof body === "object") {
    const record = body as { events?: unknown; event?: unknown };
    if (Array.isArray(record.events)) inputs = record.events as RawEvent[];
    else if (record.event) inputs = [record.event as RawEvent];
    else inputs = [body as RawEvent];
  }

  if (!inputs.length) {
    return Response.json({ ok: false, error: "No events supplied" }, { status: 400 });
  }

  const engine = await getEngine();
  const result = await engine.ingest(
    inputs.map((event) => ({
      providerId: String(event.providerId ?? ""),
      model: String(event.model ?? ""),
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cacheWriteTokens: event.cacheWriteTokens,
      costUsd: event.costUsd,
      requests: event.requests,
      at: event.at,
    })),
  );

  return Response.json({ ok: result.accepted > 0, ...result });
}
