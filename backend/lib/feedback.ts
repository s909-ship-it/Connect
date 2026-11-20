import { all, get, run, now, type Row } from "./db";
import { notify } from "./notify";

/* Feedback: what people tell the Connect team. Anyone signed in can send it; site admins read and answer it,
   and the answer lands in the sender's inbox. */
export const KINDS: [id: string, label: string][] = [
  ["bug", "Something is broken"], ["idea", "An idea"], ["praise", "Something I like"], ["other", "Something else"],
];
export const STATUSES: Record<string, [cls: string, label: string]> = {
  new: ["info", "New"], planned: ["purple", "Planned"], done: ["ok", "Done"], closed: ["plain", "Closed"],
};
export const kindLabel = (k: string) => KINDS.find(([id]) => id === k)?.[1] ?? "Something else";
const short = (t: string, n = 80) => (t.length > n ? t.slice(0, n - 3) + "..." : t);
/* The page someone was on when they opened the form. Only ever a path on this site. */
export const cleanPage = (v: unknown) => {
  const s = String(v ?? "").slice(0, 120);
  return s.startsWith("/") && !s.startsWith("//") ? s.split("?")[0] : "";
};

export function addFeedback(me: Row, kind: string, text: string, page = ""): number {
  const k = KINDS.some(([id]) => id === kind) ? kind : "other";
  const id = Number(run("INSERT INTO feedback (user_id, college_id, kind, text, page, created_at) VALUES (?,?,?,?,?,?)",
    me.id, me.college_id ?? null, k, text, cleanPage(page), now()).lastInsertRowid);
  for (const a of all("SELECT id FROM users WHERE super=1 AND deleted=0 AND suspended=0 AND id<>?", me.id))
    notify(a.id, `New feedback (${kindLabel(k).toLowerCase()}): ${short(text)}`, "/admin/feedback");
  return id;
}

/* A site admin sets where it stands and, if they want, writes back. The sender hears about either. */
export function answerFeedback(by: Row, id: number, status: string, reply: string): string | null {
  const f = get("SELECT * FROM feedback WHERE id=?", id);
  if (!f) return "That feedback is gone.";
  const st = STATUSES[status] ? status : f.status;
  const said = reply.trim() !== (f.reply ?? "").trim();
  if (!said && st === f.status) return null;
  run("UPDATE feedback SET status=?, reply=?, replied_by=?, replied_at=? WHERE id=?", st, reply.trim(), by.id, said && reply.trim() ? now() : f.replied_at, id);
  if (f.user_id !== by.id && get("SELECT 1 FROM users WHERE id=? AND deleted=0", f.user_id))
    notify(f.user_id, said && reply.trim() ? `The Connect team answered your feedback: ${short(reply.trim())}` : `Your feedback is now marked ${STATUSES[st][1].toLowerCase()}`, "/feedback");
  return null;
}
