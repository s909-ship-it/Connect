"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, run, db, now, type Row } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember } from "@/lib/college";
import { allow, notify } from "@/lib/notify";
import { canMessage, toMsg, type Msg } from "@/lib/chat";
import { pushMessage } from "@/lib/push";
export type { Msg } from "@/lib/chat";

/* Direct messages between people at the same college. Both sides must be verified members of it,
   and either side can block the other. Messages never cross colleges. */


async function meOrNull(): Promise<Row | null> {
  const me = await currentUser();
  return me?.onboarded && isMember(me) ? me : null;
}
/* The other person, if the two of you are allowed to talk. */
function partner(me: Row, id: number): Row | undefined {
  if (id === me.id) return undefined;
  return get("SELECT * FROM users WHERE id=? AND college_id=? AND verified=1 AND suspended=0 AND deleted=0", id, me.college_id);
}
const blocked = (a: number, b: number): boolean => !!get("SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)", a, b, b, a);

function rows(me: Row, other: number, after: number, limit = 200): Msg[] {
  return all(
    `SELECT m.*, p.name project_name FROM messages m LEFT JOIN projects p ON p.id=m.project_id
     WHERE ((m.from_id=? AND m.to_id=?) OR (m.from_id=? AND m.to_id=?)) AND m.id>?
     ORDER BY m.id DESC LIMIT ?`, me.id, other, other, me.id, after, limit,
  ).reverse().map((m) => toMsg(m, me.id));
}

/* New messages after `after`, and marks what you have now seen as read. The chat calls this every few seconds. */
export async function loadChat(other: number, after: number): Promise<{ messages: Msg[]; seenUpTo: number } | { error: string }> {
  const me = await meOrNull();
  const them = me ? partner(me, other) : undefined;
  if (!me || !them) return { error: "You cannot message this person." };
  run("UPDATE messages SET seen=1 WHERE from_id=? AND to_id=? AND seen=0", other, me.id);
  // Someone anonymous never shows "Seen": when they read a message stays theirs to know.
  const seenUpTo = them.anon ? 0 : get("SELECT MAX(id) n FROM messages WHERE from_id=? AND to_id=? AND seen=1", me.id, other)?.n ?? 0;
  return { messages: rows(me, other, after), seenUpTo };
}

export async function sendMessage(to: number, text: string): Promise<{ message: Msg } | { error: string }> {
  const me = await meOrNull();
  const ok = canMessage(me, to);
  if ("error" in ok) return ok;
  const body = String(text ?? "").trim().slice(0, 2000);
  if (!body) return { error: "Write something first." };
  if (!allow(`dm:${me!.id}`, 30, 60)) return { error: "You are sending a lot. Wait a minute." };
  const first = !get("SELECT 1 FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) LIMIT 1", me!.id, to, to, me!.id);
  const id = Number(run("INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?,?,?,?)", me!.id, to, body, now()).lastInsertRowid);
  if (first) notify(to, `${me!.name} sent you a message`, `/messages/${me!.id}`);
  pushMessage(to, me!, body);
  return { message: rows(me!, to, id - 1, 1)[0] };
}

/* Sends what was shared from another app (see app/share/route.ts) to one person, then forgets the share. */
export async function sendShare(fd: FormData) {
  const me = await meOrNull();
  if (!me) redirect("/onboarding");
  const sh = get("SELECT * FROM shares WHERE id=? AND user_id=?", String(fd.get("share")), me.id);
  const to = Number(fd.get("to"));
  if (!sh) redirect("/messages?err=" + encodeURIComponent("That share has expired. Share it again."));
  const ok = canMessage(me, to);
  if ("error" in ok) redirect(`/share/${sh.id}?err=${encodeURIComponent(ok.error)}`);
  const files: { key: string; name: string; type: string; kind: string; size: number }[] = JSON.parse(sh.files);
  db.transaction(() => {
    files.forEach((f, i) => run(
      "INSERT INTO messages (from_id, to_id, text, kind, file_key, file_name, file_type, file_size, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      me.id, to, i === 0 ? sh.text ?? "" : "", f.kind, f.key, f.name, f.type, f.size, now()));
    if (!files.length && sh.text) run("INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?,?,?,?)", me.id, to, sh.text, now());
    run("DELETE FROM shares WHERE id=?", sh.id);
  })();
  pushMessage(to, me, files.length ? `📎 Sent ${files.length === 1 ? files[0].name : `${files.length} files`}` : sh.text ?? "");
  revalidatePath("/", "layout");
  redirect(`/messages/${to}`);
}

/* Share a project into the chat as a card. Any project at your college that is not hidden. */
export async function shareProject(to: number, projectId: number): Promise<{ message: Msg } | { error: string }> {
  const me = await meOrNull();
  const ok = canMessage(me, to);
  if ("error" in ok) return ok;
  const p = get("SELECT id, name, pitch FROM projects WHERE id=? AND college_id=? AND hidden=0 AND status<>'dropped'", projectId, me!.college_id);
  if (!p) return { error: "That project cannot be shared." };
  if (!allow(`dm:${me!.id}`, 30, 60)) return { error: "You are sending a lot. Wait a minute." };
  const id = Number(run("INSERT INTO messages (from_id, to_id, text, kind, project_id, created_at) VALUES (?,?,?,?,?,?)",
    me!.id, to, p.pitch, "project", p.id, now()).lastInsertRowid);
  pushMessage(to, me!, `🚀 Shared ${p.name}`);
  return { message: rows(me!, to, id - 1, 1)[0] };
}

/* Invite someone to an open role on your project, straight from their profile or a chat. Shows up in the chat as a card. */
export async function inviteToProject(fd: FormData) {
  const me = await meOrNull();
  if (!me) redirect("/onboarding");
  const to = Number(fd.get("to")), back = String(fd.get("back") || `/u/${to}`);
  const say = (k: "ok" | "err", m: string): never => redirect(`${back.split("?")[0]}?${k}=${encodeURIComponent(m)}`);
  const them = partner(me, to);
  if (!them || them.role !== "student") say("err", "You can only invite verified members in your community.");
  if (blocked(me.id, to)) say("err", "You cannot invite this person.");
  const r = get(
    `SELECT r.*, p.name, p.id pid FROM roles r JOIN projects p ON p.id=r.project_id
     WHERE r.id=? AND r.open=1 AND p.lead_id=? AND p.college_id=? AND p.status IN ('recruiting','building')`, Number(fd.get("role")), me.id, me.college_id);
  if (!r) say("err", "Pick an open role on a project you lead.");
  if (get("SELECT 1 FROM members WHERE project_id=? AND user_id=?", r.pid, to)) say("err", `${them!.name.split(" ")[0]} is already on ${r.name}.`);
  if (get("SELECT 1 FROM messages WHERE from_id=? AND to_id=? AND kind='invite' AND project_id=? AND text LIKE ?", me.id, to, r.pid, `%${r.title}%`))
    say("err", `You already invited ${them!.name.split(" ")[0]} to this role.`);
  if (!allow(`invite:${me.id}`, 15, 3600)) say("err", "You have sent a lot of invites. Try again in an hour.");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  db.transaction(() => {
    run("INSERT INTO messages (from_id, to_id, text, kind, project_id, created_at) VALUES (?,?,?,?,?,?)",
      me.id, to, `Invited you to join ${r.name} as ${r.title}.${note ? `\n\n${note}` : ""}`, "invite", r.pid, now());
    notify(to, `${me.name} invited you to apply for ${r.title} on ${r.name}`, `/projects/${r.pid}`);
  })();
  pushMessage(to, me, `Invited you to join ${r.name} as ${r.title}`);
  revalidatePath("/", "layout");
  redirect(`/messages/${to}?ok=${encodeURIComponent(`Invited ${them!.name.split(" ")[0]} to ${r.name}.`)}`);
}

export async function setBlocked(fd: FormData) {
  const me = await meOrNull();
  if (!me) redirect("/onboarding");
  const id = Number(fd.get("user")), on = fd.get("on") === "1";
  if (id && id !== me.id) {
    if (on) run("INSERT OR IGNORE INTO blocks (user_id, blocked_id) VALUES (?,?)", me.id, id);
    else run("DELETE FROM blocks WHERE user_id=? AND blocked_id=?", me.id, id);
  }
  revalidatePath("/", "layout");
  if (!on && fd.get("back") === "/settings") redirect("/settings?ok=Unblocked.");
  redirect(on ? `/messages?ok=${encodeURIComponent("Blocked. They cannot message or invite you, and you will not see their messages.")}` : `/messages/${id}?ok=Unblocked.`);
}
