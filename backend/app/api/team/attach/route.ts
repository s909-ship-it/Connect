import { currentUser, baseUrl } from "@/lib/auth";
import { all, get, run, now } from "@/lib/db";
import { push } from "@/lib/push";
import { isMember } from "@/lib/college";
import { allow } from "@/lib/notify";
import { LIMITS, cleanName, save, sizeText, sniff } from "@/lib/files";
import { markTeamRead, onTeam, teamMessages } from "@/lib/teamchat";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

/* Sends one photo (and an optional caption) to a project's team chat. Multipart form: project, file, caption, w, h.
   Same checks as photos in direct messages: our own pages only, real image bytes, size and daily limits. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || (new URL(origin).host !== host && origin !== new URL(baseUrl()).origin)) return no("Bad origin.", 403);
  if (Number(req.headers.get("content-length") || 0) > LIMITS.imageBytes + 64 * 1024) return no(`Photos can be up to ${sizeText(LIMITS.imageBytes)}.`, 413);

  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) return no("Sign in first.", 401);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return no("Could not read the upload."); }
  const p = get("SELECT id FROM projects WHERE id=? AND college_id=?", Math.trunc(Number(fd.get("project"))) || 0, me.college_id);
  if (!p || !onTeam(p.id, me.id)) return no("Only the team can send photos here.", 403);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return no("Pick a photo.");
  if (file.size > LIMITS.imageBytes) return no(`Photos can be up to ${sizeText(LIMITS.imageBytes)}.`, 413);
  if (!allow(`up:${me.id}`, LIMITS.perHour, 3600)) return no(`You can send ${LIMITS.perHour} files an hour. Try again later.`, 429);
  const today = get("SELECT COALESCE(SUM(file_size),0) n FROM team_messages WHERE user_id=? AND file_key IS NOT NULL AND created_at>?", me.id, now() - 86400).n
    + get("SELECT COALESCE(SUM(file_size),0) n FROM messages WHERE from_id=? AND file_key IS NOT NULL AND created_at>?", me.id, now() - 86400).n;
  if (today + file.size > LIMITS.bytesPerDay) return no(`You have sent ${sizeText(today)} of files today. The limit is ${sizeText(LIMITS.bytesPerDay)} a day.`, 429);

  const bytes = Buffer.from(await file.arrayBuffer());
  const t = sniff(bytes, file.name);
  if (!t || t.kind !== "image") return no("Send a photo: JPEG, PNG, WebP or GIF.", 415);
  const dim = (k: string) => { const v = Math.round(Number(fd.get(k))); return v > 0 && v <= 20000 ? v : null; };
  const caption = String(fd.get("caption") ?? "").trim().slice(0, 2000);
  const key = save(bytes);
  const id = Number(run(
    `INSERT INTO team_messages (project_id, user_id, text, kind, file_key, file_name, file_type, file_size, file_w, file_h, created_at)
     VALUES (?,?,?,'image',?,?,?,?,?,?,?)`,
    p.id, me.id, caption, key, cleanName(file.name, t.ext), t.mime, bytes.length, dim("w"), dim("h"), now()).lastInsertRowid);
  markTeamRead(p.id, me.id);
  for (const r of all("SELECT user_id FROM members WHERE project_id=? AND status='active' AND user_id<>?", p.id, me.id))
    void push(r.user_id, { type: "team", project: p.id, title: String(get("SELECT name FROM projects WHERE id=?", p.id)?.name ?? "Team chat"), text: `${me.name} sent a photo${caption ? `: ${caption.slice(0, 100)}` : ""}`, url: `/projects/${p.id}/chat` });
  return Response.json({ message: teamMessages(p.id, me.id, id - 1, 1)[0] });
}
