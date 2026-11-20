import { all, get, run, now, type Row } from "./db";

/* Team chat: one group conversation per project. Only its current team can read or write it; someone who leaves
   loses access, and nobody else (admins included) can open it. Each message shows who sent it with their role on
   the project, the way group chats show tags. Joins and departures appear as system lines. */

export type TeamFile = { key: string; name: string; type: string; size: number; w: number | null; h: number | null };
export type TeamMsg = {
  id: number; mine: boolean; kind: "text" | "image" | "system"; text: string; created_at: number;
  from: { id: number; name: string; picture: string | null; role: string; lead: boolean; gone: boolean } | null;
  file: TeamFile | null;
};

export const onTeam = (projectId: number, userId: number) =>
  !!get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", projectId, userId);

/* The project, if this person is on its current team at their own college; otherwise null. Every team space page checks this. */
export const teamProject = (projectId: number, me: Row): Row | null => {
  const p = get("SELECT id, name FROM projects WHERE id=? AND college_id=?", projectId, me.college_id);
  return p && onTeam(p.id, me.id) ? p : null;
};

/* Messages after `after`, oldest first, as the chat screen shows them. */
export function teamMessages(projectId: number, meId: number, after = 0, limit = 200): TeamMsg[] {
  return all(
    `SELECT t.*, u.name, u.picture, u.deleted, m.role, m.status mstatus, p.lead_id
     FROM team_messages t JOIN projects p ON p.id=t.project_id
     LEFT JOIN users u ON u.id=t.user_id LEFT JOIN members m ON m.project_id=t.project_id AND m.user_id=t.user_id
     WHERE t.project_id=? AND t.id>? ORDER BY t.id DESC LIMIT ?`, projectId, after, limit,
  ).reverse().map((r) => ({
    id: r.id, mine: r.user_id === meId, kind: r.kind, text: r.text, created_at: r.created_at,
    from: r.user_id ? {
      id: r.user_id, name: r.deleted ? "Deleted user" : r.name ?? "Someone", picture: r.deleted ? null : r.picture ?? null,
      role: r.role || "Member", lead: r.user_id === r.lead_id, gone: r.mstatus !== "active",
    } : null,
    file: r.file_key ? { key: r.file_key, name: r.file_name, type: r.file_type, size: r.file_size, w: r.file_w, h: r.file_h } : null,
  }));
}

/* A line from Connect itself: "Riya joined as Backend". */
export const systemLine = (projectId: number, text: string) =>
  run("INSERT INTO team_messages (project_id, user_id, text, kind, created_at) VALUES (?,NULL,?,'system',?)", projectId, text.slice(0, 200), now());

export function markTeamRead(projectId: number, userId: number) {
  const top = get("SELECT MAX(id) n FROM team_messages WHERE project_id=?", projectId)?.n ?? 0;
  run("INSERT INTO team_reads (project_id, user_id, last_id) VALUES (?,?,?) ON CONFLICT (project_id, user_id) DO UPDATE SET last_id=MAX(last_id, excluded.last_id)", projectId, userId, top);
}

/* Messages from teammates this person has not seen yet. */
export function unreadTeam(projectId: number, userId: number): number {
  const seen = get("SELECT last_id FROM team_reads WHERE project_id=? AND user_id=?", projectId, userId)?.last_id ?? 0;
  return get("SELECT COUNT(*) n FROM team_messages WHERE project_id=? AND id>? AND (user_id IS NULL OR user_id<>?)", projectId, seen, userId)?.n ?? 0;
}

/* The team, lead first, with their roles: the chat's header. */
export const teamOf = (projectId: number): Row[] => all(
  `SELECT u.id, u.name, u.picture, m.role, (u.id=p.lead_id) lead FROM members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id
   WHERE m.project_id=? AND m.status='active' ORDER BY lead DESC, m.rowid`, projectId);
