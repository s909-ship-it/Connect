import { baseUrl, currentUser } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { allow } from "@/lib/notify";
import { remove, save, sniff } from "@/lib/files";
import { setPhoto } from "@/lib/identity";

export const dynamic = "force-dynamic";
const no = (error: string, status = 400) => Response.json({ error }, { status });
const MAX = 5 * 1024 * 1024;

/* Your own profile photo: upload one (POST, multipart "file"), or remove it (DELETE) to go back to your sign-in photo
   at your next sign-in. While anonymous, it is kept with your real details and the pattern still shows. */
async function who(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || (new URL(origin).host !== req.headers.get("host") && origin !== new URL(baseUrl()).origin)) return { err: no("Bad origin.", 403) };
  const me = await currentUser();
  if (!me?.onboarded) return { err: no("Sign in first.", 401) };
  if (!allow(`photo:${me.id}`, 20, 3600)) return { err: no("You have changed your photo a lot. Try again later.", 429) };
  return { me };
}

export async function POST(req: Request) {
  const { me, err } = await who(req);
  if (err) return err;
  if (Number(req.headers.get("content-length") || 0) > MAX + 64 * 1024) return no("Photos can be up to 5 MB.", 413);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return no("Could not read the upload."); }
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return no("Pick a photo.");
  if (file.size > MAX) return no("Photos can be up to 5 MB.", 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const t = sniff(bytes, file.name);
  if (!t || t.kind !== "image") return no("Use a JPEG, PNG, WebP or GIF photo.", 415);
  const old = me!.photo_key;
  const key = save(bytes);
  run("UPDATE users SET photo_key=?, photo_mime=? WHERE id=?", key, t.mime, me!.id);
  setPhoto(me!, `/api/avatar/${key}`);
  if (old) remove(old);
  return Response.json({ ok: true, anon: !!me!.anon });
}

export async function DELETE(req: Request) {
  const { me, err } = await who(req);
  if (err) return err;
  if (me!.photo_key) remove(me!.photo_key);
  run("UPDATE users SET photo_key=NULL, photo_mime=NULL WHERE id=?", me!.id);
  setPhoto(get("SELECT * FROM users WHERE id=?", me!.id), null);
  return Response.json({ ok: true });
}
