import { currentUser } from "@/lib/auth";
import { all, get, run, now } from "@/lib/db";
import { inCall, sweepCall, touchCall } from "@/lib/teamspace";

export const dynamic = "force-dynamic";

/* The live stream for one browser tab in a team call (Server-Sent Events): who joined and left, and the WebRTC
   details other people's browsers sent to this one. It also keeps the tab marked as present; when it stops for
   a while, the others are told the person left. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me?.verified) return new Response("Sign in first.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const call = Math.trunc(Number(q.get("call"))) || 0, device = (q.get("device") ?? "").slice(0, 40);
  if (!/^[a-z0-9-]{8,40}$/i.test(device) || !inCall(call, me.id, device)) return new Response("Not in this call.", { status: 404 });
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let beats = 0;
      const stop = () => { if (timer) clearInterval(timer); timer = undefined; try { controller.close(); } catch {} };
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { stop(); } };
      const tick = () => {
        beats++;
        if (beats % 5 === 0) touchCall(call, me.id, device);
        if (beats % 25 === 0) {
          sweepCall(call);
          run("DELETE FROM team_signals WHERE created_at<?", now() - 120);
          send(": keep-alive\n\n");
        }
        for (const r of all("SELECT * FROM team_signals WHERE to_id=? AND to_device=? AND call_id=? ORDER BY id", me.id, device, call)) {
          send(`event: team\ndata: ${JSON.stringify({ type: r.type, from: { user: r.from_id, device: r.from_device }, payload: JSON.parse(r.payload ?? "null") })}\n\n`);
          run("DELETE FROM team_signals WHERE id=?", r.id);
        }
        // Left in another tab, replaced by another device, or the call ended: tell this tab and stop.
        if (beats % 5 === 0 && !inCall(call, me.id, device)) {
          const ended = !!get("SELECT 1 FROM team_calls WHERE id=? AND ended_at IS NOT NULL", call);
          send(`event: team\ndata: ${JSON.stringify({ type: ended ? "ended" : "gone", from: null, payload: null })}\n\n`);
          stop();
        }
      };
      send("retry: 2000\n\n");
      touchCall(call, me.id, device);
      tick();
      timer = setInterval(tick, 400);
      req.signal.addEventListener("abort", stop);
    },
    cancel() { if (timer) clearInterval(timer); },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
