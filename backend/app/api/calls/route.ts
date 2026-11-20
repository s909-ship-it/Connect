import { baseUrl, currentUser } from "@/lib/auth";
import { get, run, now } from "@/lib/db";
import { canMessage } from "@/lib/chat";
import { allow } from "@/lib/notify";
import { finish, iceServers, liveCall, online, signal, sweep } from "@/lib/calls";
import { push } from "@/lib/push";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });
const SIGNALS = new Set(["offer", "answer", "ice", "media"]);

/* Everything a call does: start, accept, decline, end, and pass WebRTC details to the other side. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || (new URL(origin).host !== req.headers.get("host") && origin !== new URL(baseUrl()).origin)) return no("Bad origin.", 403);
  const me = await currentUser();
  if (!me) return no("Sign in first.", 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return no("Bad request."); }
  const device = String(b.device ?? "").slice(0, 40);
  sweep();

  if (b.action === "start") {
    const to = Number(b.to);
    const ok = canMessage(me, to);
    if ("error" in ok) return no(ok.error, 403);
    if (ok.them.calls_on === 0) return no(`${ok.them.name.split(" ")[0]} has calls switched off. Send a message instead.`, 403);
    if (!allow(`call:${me.id}`, 12, 600)) return no("You have started a lot of calls. Wait a few minutes.", 429);
    if (liveCall(me.id)) return no("You are already in a call.", 409);
    if (liveCall(to)) return no(`${ok.them.name.split(" ")[0]} is on another call.`, 409);
    const id = Number(run("INSERT INTO voice_calls (caller_id, callee_id, video, caller_device, created_at) VALUES (?,?,?,?,?)",
      me.id, to, b.video ? 1 : 0, device, now()).lastInsertRowid);
    signal(id, to, null, "ring", { id, video: !!b.video, from: { id: me.id, name: me.name, picture: me.picture } });
    // Rings their phone or laptop too, even with Connect closed.
    void push(to, { type: "call", id, video: !!b.video, from: { id: me.id, name: me.name } }, { ttl: 45, urgent: true });
    return Response.json({ id, ice: await iceServers(), online: online(to) });
  }

  const c = get("SELECT * FROM voice_calls WHERE id=? AND (caller_id=? OR callee_id=?)", Number(b.id), me.id, me.id);
  if (!c) return no("No such call.", 404);
  const other = c.caller_id === me.id ? c.callee_id : c.caller_id;

  if (b.action === "accept") {
    if (c.callee_id !== me.id || c.status !== "ringing") return no(c.status === "ringing" ? "Not your call." : "That call has ended.", 409);
    run("UPDATE voice_calls SET status='active', answered_at=?, callee_device=? WHERE id=? AND status='ringing'", now(), device, c.id);
    signal(c.id, other, c.caller_device, "accepted", { id: c.id });
    // Any other tab of yours that was ringing can stop.
    signal(c.id, me.id, null, "taken", { id: c.id, device });
    return Response.json({ ok: true, ice: await iceServers() });
  }
  if (b.action === "decline") {
    if (c.callee_id === me.id) finish(c, "declined", me.id);
    return Response.json({ ok: true });
  }
  if (b.action === "end") {
    finish(c, b.failed ? "failed" : c.status === "ringing" && c.caller_id === me.id ? "ended" : "ended", me.id);
    return Response.json({ ok: true });
  }
  if (b.action === "signal") {
    const type = String(b.type);
    if (!SIGNALS.has(type) || c.status !== "active") return no("Not now.", 409);
    const payload = JSON.stringify(b.payload ?? null);
    if (payload.length > 20_000) return no("Too big.", 413);
    if (!allow(`sig:${me.id}`, 400, 60)) return no("Slow down.", 429);
    signal(c.id, other, c.caller_id === me.id ? c.callee_device : c.caller_device, type, b.payload);
    return Response.json({ ok: true });
  }
  return no("Unknown action.");
}
