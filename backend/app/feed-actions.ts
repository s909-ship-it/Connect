"use server";

import { get } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { allow } from "@/lib/notify";
import { setHidden } from "@/lib/feed";

/* "Not for me" on a board card, and its undo. Only changes the person's own For you order. */
export async function hideFromFeed(projectId: number, on: boolean): Promise<boolean> {
  const me = await requireMember();
  const id = Math.trunc(Number(projectId)) || 0;
  if (!get("SELECT 1 FROM projects WHERE id=? AND college_id=?", id, me.college_id)) return false;
  if (!allow(`feedhide:${me.id}`, 60, 600)) return false;
  setHidden(me.id, id, !!on);
  return true;
}
