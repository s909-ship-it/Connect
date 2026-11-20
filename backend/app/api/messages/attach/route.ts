import { currentUser, baseUrl } from "@/lib/auth";
import { get, run, now, db } from "@/lib/db";
import { canMessage, toMsg } from "@/lib/chat";
import { allow, notify } from "@/lib/notify";
import { LIMITS, cleanName, maxFor, save, sizeText, sniff } from "@/lib/files";
import { pushMessage } from "@/lib/push";

export const dynamic = "force-dynamic";

const no = (error: string, status = 400) => Response.json({ error }, { status });

/* Sends one attachment (and an optional caption) as a chat message. Multipart form: to, file, caption, w, h. */
export async function POST(req: Request) {
  // Only from our own pages: a form on another site cannot post here as you.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || (new URL(origin).host !== host && origin !== new URL(baseUrl()).origin)) return no("Bad origin.", 403);
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > LIMITS.videoBytes + 64 * 1024) return no(`That is over ${sizeText(LIMITS.videoBytes)}.`, 413);

  const me = await currentUser();
  let fd: FormData;
  try { fd = await req.formData(); } catch { return no("Could not read the upload."); }
  const to = Number(fd.get("to"));
  const ok = canMessage(me ?? null, to);
  if ("error" in ok) return no(ok.error, 403);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return no("Pick a file.");
  if (file.size > LIMITS.videoBytes) return no(`That is over ${sizeText(LIMITS.videoBytes)}.`, 413);
  if (!allow(`up:${me!.id}`, LIMITS.perHour, 3600)) return no(`You can send ${LIMITS.perHour} files an hour. Try again later.`, 429);
  const today = get("SELECT COALESCE(SUM(file_size),0) n FROM messages WHERE from_id=? AND file_key IS NOT NULL AND created_at>?", me!.id, now() - 86400).n;
  if (today + file.size > LIMITS.bytesPerDay) return no(`You have sent ${sizeText(today)} of files today. The limit is ${sizeText(LIMITS.bytesPerDay)} a day.`, 429);

  const bytes = Buffer.from(await file.arrayBuffer());
  const t = sniff(bytes, file.name, fd.get("voice") === "1");
  if (!t) return no("Send a photo, a video (MP4, MOV, WebM), a PDF, a Word, PowerPoint or Excel file, or a text file.", 415);
  if (bytes.length > maxFor(t.kind)) return no(`${t.kind === "image" ? "Photos" : t.kind === "video" ? "Videos" : t.kind === "voice" ? "Voice notes" : "Files"} can be up to ${sizeText(maxFor(t.kind))}.`, 413);
  const secs = Math.round(Number(fd.get("seconds")) || 0);

  const dim = (k: string) => { const v = Math.round(Number(fd.get(k))); return v > 0 && v <= 20000 ? v : null; };
  const caption = String(fd.get("caption") ?? "").trim().slice(0, 2000);
  const key = save(bytes);
  const first = !get("SELECT 1 FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) LIMIT 1", me!.id, to, to, me!.id);
  const id = db.transaction(() => Number(run(
    `INSERT INTO messages (from_id, to_id, text, kind, file_key, file_name, file_type, file_size, file_w, file_h, file_secs, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    me!.id, to, caption, t.kind, key, cleanName(file.name, t.ext), t.mime, bytes.length,
    t.kind === "image" || t.kind === "video" ? dim("w") : null, t.kind === "image" || t.kind === "video" ? dim("h") : null,
    secs > 0 && secs < 3600 ? secs : null, now()).lastInsertRowid))();
  if (first) notify(to, `${me!.name} sent you a ${{ image: "photo", video: "video", voice: "voice note", file: "file" }[t.kind]}`, `/messages/${me!.id}`);
  pushMessage(to, me!, caption || { image: "📷 Photo", video: "🎬 Video", voice: "🎙️ Voice note", file: `📎 ${file.name}` }[t.kind]);
  return Response.json({ message: toMsg(get("SELECT * FROM messages WHERE id=?", id), me!.id) });
}
