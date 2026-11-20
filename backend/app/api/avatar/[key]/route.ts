import { currentUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { read } from "@/lib/files";

export const dynamic = "force-dynamic";

/* A profile photo someone uploaded. Shown wherever their photo is, like a Google photo. While they are anonymous it
   is their hidden real photo, so only they and their college's admins can open it, even with an old link. */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const key = (await params).key;
  const u = /^[A-Za-z0-9_-]{8,80}$/.test(key) ? get("SELECT id, anon, college_id, photo_mime FROM users WHERE photo_key=? AND deleted=0", key) : null;
  if (!u) return new Response("Not found", { status: 404 });
  if (u.anon) {
    const me = await currentUser();
    if (!me || (me.id !== u.id && !(me.admin && me.college_id === u.college_id))) return new Response("Not found", { status: 404 });
  }
  const bytes = read(key);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": u.photo_mime || "image/jpeg", "Cache-Control": u.anon ? "private, no-store" : "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
