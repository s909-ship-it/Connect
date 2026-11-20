import { currentUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { read } from "@/lib/files";

export const dynamic = "force-dynamic";

/* A chat attachment. Only the two people in that conversation can open it. */
export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const me = await currentUser();
  const key = (await params).key;
  // Proof files on evidence: the owner, the teammate asked to confirm it, and admins of that college.
  const ev = me ? get("SELECT file_name, file_type, 'file' kind FROM evidence WHERE file_key=? AND (user_id=? OR teammate_id=? OR (college_id=? AND ?=1))", key, me.id, me.id, me.college_id, me.admin ? 1 : 0) : null;
  // Team chat photos: only the project's current team.
  const team = ev ?? (me ? get(`SELECT t.* FROM team_messages t JOIN members m ON m.project_id=t.project_id AND m.user_id=? AND m.status='active'
    WHERE t.file_key=?`, me.id, key) : null);
  const m = team ?? (me ? get("SELECT * FROM messages WHERE file_key=? AND (from_id=? OR to_id=?)", key, me.id, me.id) : null);
  const bytes = m ? read(key) : null;
  if (!m || !bytes) return new Response("Not found", { status: 404 });
  const inline = ["image", "video", "voice"].includes(m.kind) || m.file_type === "application/pdf" || String(m.file_type).startsWith("image/");
  const download = new URL(req.url).searchParams.has("download");
  const name = encodeURIComponent(m.file_name);
  // Videos and voice notes are played in pieces (and Safari insists on it), so answer byte ranges.
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  let body = bytes, status = 200;
  const extra: Record<string, string> = { "Accept-Ranges": "bytes" };
  if (range) {
    const size = bytes.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1] && !range[2]) { start = 0; end = size - 1; }
    end = Math.min(end, size - 1);
    if (start < 0 || start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    body = bytes.subarray(start, end + 1); status = 206;
    extra["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  return new Response(new Uint8Array(body), {
    status,
    headers: {
      ...extra,
      "Content-Type": m.file_type,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline && !download ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      // Even if a file were opened directly, it cannot run scripts or load anything. (Chrome will not show a PDF
      // inside a sandbox, and PDFs are shown by the browser's own viewer, so they skip it.)
      "Content-Security-Policy": m.file_type === "application/pdf" ? "frame-ancestors 'none'"
        : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
    },
  });
}
