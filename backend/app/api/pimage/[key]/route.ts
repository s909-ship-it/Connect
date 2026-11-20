import { currentUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { read } from "@/lib/files";

export const dynamic = "force-dynamic";

/* A project's own image: seen by whoever can see the project (its college, or only its team and admins while it is
   private or hidden). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key;
  const p = /^[A-Za-z0-9_-]{8,80}$/.test(key) ? get("SELECT id, college_id, hidden, image_mime FROM projects WHERE image_key=?", key) : null;
  const me = p ? await currentUser() : null;
  const team = p && me ? !!get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", p.id, me.id) : false;
  if (!p || !me?.verified || me.college_id !== p.college_id || (p.hidden && !team && !me.admin)) return new Response("Not found", { status: 404 });
  const bytes = read(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": p.image_mime || "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
