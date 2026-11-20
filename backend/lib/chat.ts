import { all, get, type Row } from "./db";
import { isMember } from "./college";

/* Your conversations, newest first: who, the last message, and how many you have not read. */
export function conversations(me: Row): { u: Row; last: Row; unread: number }[] {
  const pairs = all(
    `SELECT other, MAX(id) last FROM (
       SELECT CASE WHEN from_id=? THEN to_id ELSE from_id END other, id FROM messages WHERE from_id=? OR to_id=?
     ) GROUP BY other ORDER BY last DESC LIMIT 100`, me.id, me.id, me.id);
  const blocked = new Set(all("SELECT blocked_id FROM blocks WHERE user_id=?", me.id).map((b) => b.blocked_id));
  const unread = new Map(all("SELECT from_id, COUNT(*) n FROM messages WHERE to_id=? AND seen=0 GROUP BY from_id", me.id).map((r) => [r.from_id, r.n]));
  return pairs
    .filter((p) => !blocked.has(p.other))
    .map((p) => ({
      u: get("SELECT id, name, picture, branch, college_id, deleted FROM users WHERE id=?", p.other),
      last: get("SELECT * FROM messages WHERE id=?", p.last),
      unread: unread.get(p.other) ?? 0,
    }))
    .filter((c) => c.u && c.u.college_id === me.college_id);
}

/* Unread messages for the header badge, not counting people you blocked. */
export function unreadMessages(userId: number): number {
  return get(
    "SELECT COUNT(*) n FROM messages WHERE to_id=? AND seen=0 AND from_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id=?)", userId, userId,
  )?.n ?? 0;
}

/* Whether `me` may send to `to` right now. Returns the other person, or why not.
   Same college, both verified, nobody blocked, and a newcomer gets five messages before the other person replies. */
export function canMessage(me: Row | null, to: number): { them: Row } | { error: string } {
  if (!me?.onboarded || !isMember(me)) return { error: "Verify your college or work email first." };
  const them = to !== me.id ? get("SELECT * FROM users WHERE id=? AND college_id=? AND verified=1 AND suspended=0 AND deleted=0", to, me.college_id) : undefined;
  if (!them) return { error: "You can only message verified people in your community." };
  if (get("SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)", me.id, to, to, me.id)) return { error: "You cannot message this person." };
  const replied = get("SELECT 1 FROM messages WHERE from_id=? AND to_id=? LIMIT 1", to, me.id);
  // Their choice in Settings: only people they have built with (or already written to) may start a chat.
  if (them.dm_from === "team" && !replied && !get("SELECT 1 FROM members a JOIN members b ON b.project_id=a.project_id WHERE a.user_id=? AND b.user_id=? LIMIT 1", me.id, to))
    return { error: `${them.name.split(" ")[0]} only takes messages from people they have been on a project with.` };
  if (!replied && get("SELECT COUNT(*) n FROM messages WHERE from_id=? AND to_id=?", me.id, to).n >= 5)
    return { error: `Wait for ${them.name.split(" ")[0]} to reply before sending more.` };
  return { them };
}

/* A message as the chat screen shows it. */
export type Msg = {
  id: number; mine: boolean; text: string; kind: string; project_id: number | null; project_name: string | null; created_at: number; seen: boolean;
  file: { key: string; name: string; type: string; size: number; w: number | null; h: number | null; secs: number | null } | null;
};
export function toMsg(m: Row, meId: number): Msg {
  return {
    id: m.id, mine: m.from_id === meId, text: m.text, kind: m.kind, project_id: m.project_id, project_name: m.project_name ?? null,
    created_at: m.created_at, seen: !!m.seen,
    file: m.file_key ? { key: m.file_key, name: m.file_name, type: m.file_type, size: m.file_size, w: m.file_w, h: m.file_h, secs: m.file_secs ?? null } : null,
  };
}
