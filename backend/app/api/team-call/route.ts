import { baseUrl, currentUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { isMember } from "@/lib/college";
import { allow, notify } from "@/lib/notify";
import { iceServers } from "@/lib/calls";
import { push } from "@/lib/push";
import { onTeam } from "@/lib/teamchat";
import { inCall, joinCall, leaveCall, sendSignal } from "@/lib/teamspace";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });
const SIGNALS = new Set(["offer", "answer", "ice", "media"]);
const DEVICE = /^[a-z0-9-]{8,40}$/i;

/* A project's team call: join it (starting one if none is on), leave it, and pass WebRTC details from one person's
   browser to another's. Audio and video go straight between the browsers; the server never sees them. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || (new URL(origin).host !== req.headers.get("host") && origin !== new URL(baseUrl()).origin)) return no("Bad origin.", 403);
  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) return no("Sign in first.", 401);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return no("Bad request."); }
  const device = String(b.device ?? "");
  if (!DEVICE.test(device)) return no("Bad device.");

  if (b.action === "join") {
    const p = get("SELECT id, name FROM projects WHERE id=? AND college_id=?", Math.trunc(Number(b.project)) || 0, me.college_id);
    if (!p || !onTeam(p.id, me.id)) return no("Only the team can join this call.", 403);
    if (!allow(`team-call:${me.id}`, 20, 600)) return no("You have joined a lot of calls. Wait a few minutes.", 429);
    const r = joinCall(p.id, me, device, !!b.video);
    if ("error" in r) return no(r.error, 409);
    if (r.started) {
      // The rest of the team hears about it: inbox, and a notification on devices with alerts on.
      const kind = r.video ? "video" : "voice";
      for (const m of all("SELECT user_id FROM members WHERE project_id=? AND status='active' AND user_id<>?", p.id, me.id)) {
        notify(m.user_id, `${me.name} started a team ${kind} call in ${p.name}`, `/projects/${p.id}/chat`);
        void push(m.user_id, { type: "team", project: p.id, title: `${p.name} team call`, text: `${me.name} started a ${kind} call. Tap to join.`, url: `/projects/${p.id}/chat` }, { ttl: 120, urgent: true });
      }
    }
    return Response.json({ call: r.call, video: r.video, peers: r.peers, ice: await iceServers() });
  }

  const call = Math.trunc(Number(b.call)) || 0;
  if (b.action === "leave") {
    leaveCall(call, me.id, device);
    return Response.json({ ok: true });
  }
  if (b.action === "signal") {
    const type = String(b.type);
    const to = (b.to ?? {}) as { user?: unknown; device?: unknown };
    const target = { user: Math.trunc(Number(to.user)) || 0, device: String(to.device ?? "") };
    if (!SIGNALS.has(type) || !DEVICE.test(target.device)) return no("Bad signal.");
    if (!inCall(call, me.id, device) || !inCall(call, target.user, target.device)) return no("Not in this call.", 409);
    const payload = JSON.stringify(b.payload ?? null);
    if (payload.length > 20_000) return no("Too big.", 413);
    if (!allow(`team-sig:${me.id}`, 900, 60)) return no("Slow down.", 429);
    sendSignal(call, { user: me.id, device }, target, type, b.payload);
    return Response.json({ ok: true });
  }
  return no("Unknown action.");
}
