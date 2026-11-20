import crypto from "crypto";
import { currentUser } from "@/lib/auth";
import { isMember } from "@/lib/college";
import { all, run, now } from "@/lib/db";
import { LIMITS, cleanName, maxFor, remove, save, sniff } from "@/lib/files";
import { allow } from "@/lib/notify";

export const dynamic = "force-dynamic";
// Redirects stay on whatever address the request came in on.
const to = (req: Request) => (path: string) => Response.redirect(new URL(path, req.url), 303);

/* Receives what you shared to Connect from another app (the phone's share sheet). The files are checked and held
   for an hour while you pick who to send them to. Nothing is sent until you choose. */
export async function POST(req: Request) {
  const go = to(req);
  const me = await currentUser();
  if (!me) return go("/signin");
  if (!isMember(me)) return go("/onboarding");
  if (Number(req.headers.get("content-length") || 0) > LIMITS.videoBytes * LIMITS.atOnce + 256 * 1024) return go("/messages?err=" + encodeURIComponent("That is too much to share at once."));
  if (!allow(`share:${me.id}`, 20, 3600)) return go("/messages?err=" + encodeURIComponent("You have shared a lot. Try again later."));
  let fd: FormData;
  try { fd = await req.formData(); } catch { return go("/messages?err=" + encodeURIComponent("Could not read what was shared.")); }

  // Old, unsent shares are thrown away.
  for (const old of all("SELECT * FROM shares WHERE created_at<? OR user_id=?", now() - 3600, me.id)) {
    for (const f of JSON.parse(old.files)) remove(f.key);
    run("DELETE FROM shares WHERE id=?", old.id);
  }
  const files: { key: string; name: string; type: string; kind: string; size: number }[] = [];
  let skipped = 0;
  for (const f of fd.getAll("files").slice(0, LIMITS.atOnce)) {
    if (!(f instanceof File) || !f.size) continue;
    const b = Buffer.from(await f.arrayBuffer());
    const t = sniff(b, f.name);
    if (!t || b.length > maxFor(t.kind)) { skipped++; continue; }
    files.push({ key: save(b), name: cleanName(f.name, t.ext), type: t.mime, kind: t.kind, size: b.length });
  }
  const text = ["title", "text", "url"].map((k) => String(fd.get(k) ?? "").trim()).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).join("\n").slice(0, 2000);
  if (!files.length && !text) return go("/messages?err=" + encodeURIComponent(skipped ? "Connect cannot send that kind of file." : "Nothing to share."));
  const id = crypto.randomBytes(12).toString("base64url");
  run("INSERT INTO shares (id, user_id, files, text, created_at) VALUES (?,?,?,?,?)", id, me.id, JSON.stringify(files), text, now());
  return go(`/share/${id}${skipped ? "?skipped=" + skipped : ""}`);
}

export function GET(req: Request) {
  return to(req)("/messages");
}
