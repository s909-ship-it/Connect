"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run, now } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { allow } from "@/lib/notify";

/* Follow or unfollow a project at your own college. Followers get its main moments in their inbox. */
export async function toggleFollow(fd: FormData) {
  const me = await requireMember();
  const id = Math.trunc(Number(fd.get("id"))) || 0;
  const back = `/projects/${id}`;
  const p = get("SELECT id FROM projects WHERE id=? AND college_id=? AND hidden=0", id, me.college_id);
  if (!p) redirect("/");
  if (!allow(`follow:${me.id}`, 30, 600)) redirect(back + "?err=" + encodeURIComponent("Slow down a little. Try again in a few minutes."));
  const on = get("SELECT 1 FROM follows WHERE project_id=? AND user_id=?", id, me.id);
  if (on) run("DELETE FROM follows WHERE project_id=? AND user_id=?", id, me.id);
  else run("INSERT OR IGNORE INTO follows (project_id, user_id, created_at) VALUES (?,?,?)", id, me.id, now());
  revalidatePath(back);
  redirect(back + "?ok=" + encodeURIComponent(on ? "Unfollowed." : "Following. Its milestones, posts and review results will reach your inbox."));
}
