"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember } from "@/lib/college";
import { allow } from "@/lib/notify";
import { remove, save, sniff } from "@/lib/files";
import { setAnonymous } from "@/lib/identity";
import { makeImage, projectPrompt } from "@/lib/aiimage";

/* Anonymous mode and AI project images. Forms post here and come back to the page they came from with a message. */
function back(fd: FormData) {
  const s = String(fd.get("back") || "/");
  return s.startsWith("/") && !s.startsWith("//") ? s.split("?")[0] : "/";
}
function go(to: string, key: "ok" | "err", msg: string): never {
  revalidatePath("/", "layout");
  redirect(`${to}?${key}=${encodeURIComponent(msg)}`);
}

/* on=1 turns anonymous mode on, on=0 off; fresh=1 picks a new alias. */
export async function setAnonymousMode(fd: FormData) {
  const me = await currentUser();
  if (!me?.onboarded) redirect("/signin");
  const to = back(fd);
  const on = fd.get("on") === "1", fresh = fd.get("fresh") === "1";
  if (on === !!me.anon && !fresh) go(to, "ok", on ? "You are already anonymous." : "You are already showing your real name.");
  // A few changes a day, so an alias cannot be used to slip away from a conversation over and over.
  if (!allow(`anon:${me.id}`, 6, 86400)) go(to, "err", "You have changed this a lot today. Try again tomorrow.");
  const alias = setAnonymous(me, on, fresh);
  go(to, "ok", on ? `You are anonymous. People see you as ${alias}.` : "Your real name and photo are back.");
}

/* A cover for the project made by AI from its name and pitch (needs a paid Gemini plan; see lib/aiimage.ts). */
export async function aiProjectImage(fd: FormData) {
  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) redirect("/signin");
  const to = back(fd);
  const p = get("SELECT * FROM projects WHERE id=? AND college_id=? AND status<>'dropped'", Math.trunc(Number(fd.get("id"))) || 0, me.college_id);
  if (!p || !get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", p.id, me.id)) go(to, "err", "Only the team can change the project's image.");
  if (!allow(`ai-image:${me.id}`, 5, 3600) || !allow(`ai-image-p:${p!.id}`, 8, 86400)) go(to, "err", "You have made a few images already. Try again later.");
  const r = await makeImage(projectPrompt(p!.name, p!.pitch));
  if ("error" in r) go(to, "err", r.error);
  const t = sniff(r.bytes, "ai.png");
  if (!t || t.kind !== "image") go(to, "err", "The AI's image could not be used. Try again.");
  const key = save(r.bytes);
  run("UPDATE projects SET image=?, image_key=?, image_mime=? WHERE id=?", `/api/pimage/${key}`, key, t!.mime, p!.id);
  if (p!.image_key) remove(p!.image_key);
  go(to, "ok", "New image made by AI. Upload your own any time to replace it.");
}
