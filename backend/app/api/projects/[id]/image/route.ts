import { baseUrl, currentUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { isMember } from "@/lib/college";
import { allow } from "@/lib/notify";
import { remove, save, sniff } from "@/lib/files";

export const dynamic = "force-dynamic";
const no = (error: string, status = 400) => Response.json({ error }, { status });
const MAX = 5 * 1024 * 1024;

/* A project's own image, set by its team: upload one (POST, multipart "file") or remove it (DELETE) to go back to the
   cover drawn from the project's name. */
async function teamProject(req: Request, id: number) {
  const origin = req.headers.get("origin");
  if (!origin || (new URL(origin).host !== req.headers.get("host") && origin !== new URL(baseUrl()).origin)) return { err: no("Bad origin.", 403) };
  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) return { err: no("Sign in first.", 401) };
  const p = get("SELECT * FROM projects WHERE id=? AND college_id=? AND status<>'dropped'", id, me.college_id);
  if (!p || !get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", p.id, me.id)) return { err: no("Only the team can change the project's image.", 403) };
  if (!allow(`pimage:${me.id}`, 20, 3600)) return { err: no("You have changed images a lot. Try again later.", 429) };
  return { p };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { p, err } = await teamProject(req, Number((await params).id));
  if (err) return err;
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024) return no("Images can be up to 5 MB.", 413);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return no("Could not read the upload."); }
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return no("Pick an image.");
  if (file.size > MAX) return no("Images can be up to 5 MB.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const t = sniff(bytes, file.name);
  if (!t || t.kind !== "image") return no("Use a JPEG, PNG, WebP or GIF image.", 415);
  const key = save(bytes);
  run("UPDATE projects SET image=?, image_key=?, image_mime=? WHERE id=?", `/api/pimage/${key}`, key, t.mime, p!.id);
  if (p!.image_key) remove(p!.image_key);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { p, err } = await teamProject(req, Number((await params).id));
  if (err) return err;
  if (p!.image_key) remove(p!.image_key);
  run("UPDATE projects SET image=NULL, image_key=NULL, image_mime=NULL WHERE id=?", p!.id);
  return Response.json({ ok: true });
}
