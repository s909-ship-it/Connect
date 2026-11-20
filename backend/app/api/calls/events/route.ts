import { currentUser } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { drop, ping, sweep } from "@/lib/calls";

export const dynamic = "force-dynamic";

/* A live stream of call events for one browser tab (Server-Sent Events): rings, answers, hang-ups and the
   WebRTC details from the other side.
   Signals for one tab are deleted once sent. Signals for all your tabs (a ring, a hang-up) stay a couple of
   minutes so every open tab sees them; each stream remembers which it has already passed on. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me?.verified) return new Response("Sign in first.", { status: 401 });
  const device = (new URL(req.url).searchParams.get("device") ?? "").slice(0, 40);
  if (!/^[a-z0-9-]{8,40}$/i.test(device)) return new Response("Bad device.", { status: 400 });
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const seen = new Set<number>();
      let beats = 0;
      const stop = () => { if (timer) clearInterval(timer); timer = undefined; drop(me.id, device); try { controller.close(); } catch {} };
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };

      // Old tab-wide signals are history, except a ring that is still ringing: a tab opened mid-ring should ring too.
      for (const r of all("SELECT s.id, s.type, c.status FROM call_signals s JOIN voice_calls c ON c.id=s.call_id WHERE s.to_id=? AND s.to_device IS NULL", me.id))
        if (!(r.type === "ring" && r.status === "ringing")) seen.add(r.id);

      const tick = () => {
        ping(me.id, device);
        if (++beats % 20 === 0) { sweep(); send(": keep-alive\n\n"); }
        for (const r of all("SELECT * FROM call_signals WHERE to_id=? AND (to_device IS NULL OR to_device=?) ORDER BY id", me.id, device)) {
          if (seen.has(r.id)) continue;
          send(`event: call\ndata: ${JSON.stringify({ type: r.type, call: r.call_id, payload: JSON.parse(r.payload ?? "null") })}\n\n`);
          if (r.to_device) run("DELETE FROM call_signals WHERE id=?", r.id); else seen.add(r.id);
        }
      };
      send("retry: 2000\n\n");
      tick();
      timer = setInterval(tick, 400);
      req.signal.addEventListener("abort", stop);
    },
    cancel() { if (timer) clearInterval(timer); drop(me.id, device); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
