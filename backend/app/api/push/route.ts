import { baseUrl, currentUser } from "@/lib/auth";
import { run } from "@/lib/db";
import { allow } from "@/lib/notify";
import { pushReady, savePushSub } from "@/lib/push";

export const dynamic = "force-dynamic";
const no = (error: string, status = 400) => Response.json({ error }, { status });
const sameSite = (req: Request) => {
  const o = req.headers.get("origin");
  return !!o && (new URL(o).host === req.headers.get("host") || o === new URL(baseUrl()).origin);
};

/* Turn alerts on for this device (POST a PushSubscription) or off (DELETE with its endpoint). */
export async function POST(req: Request) {
  if (!sameSite(req)) return no("Bad origin.", 403);
  const me = await currentUser();
  if (!me?.verified) return no("Sign in first.", 401);
  if (!pushReady()) return no("Push is not set up on this server.", 503);
  if (!allow(`pushsub:${me.id}`, 10, 3600)) return no("Try again later.", 429);
  const ok = savePushSub(me.id, await req.json().catch(() => ({})));
  return ok ? Response.json({ ok: true }) : no("That subscription does not look right.");
}
export async function DELETE(req: Request) {
  if (!sameSite(req)) return no("Bad origin.", 403);
  const me = await currentUser();
  if (!me) return no("Sign in first.", 401);
  const { endpoint } = await req.json().catch(() => ({}));
  run("DELETE FROM push_subs WHERE endpoint=? AND user_id=?", String(endpoint ?? ""), me.id);
  return Response.json({ ok: true });
}
