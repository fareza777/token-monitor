import type { NextRequest } from "next/server";
import { getEngine } from "@/lib/engine";
import type { RangeKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANGES = new Set<RangeKey>(["1h", "24h", "7d", "30d"]);
const FRAME_MS = 1_500;

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("range") ?? "1h";
  const range = (RANGES.has(requested as RangeKey) ? requested : "1h") as RangeKey;
  const engine = await getEngine();
  const encoder = new TextEncoder();

  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(engine.snapshot(range))}\n\n`),
          );
        } catch {
          closed = true;
          if (timer) clearInterval(timer);
        }
      };

      controller.enqueue(encoder.encode("retry: 2500\n\n"));
      send();
      timer = setInterval(send, FRAME_MS);

      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        timer = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      timer = null;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
