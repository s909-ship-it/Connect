import crypto from "crypto";
import { all, get, run, now, db, type Row } from "./db";
import { systemLine } from "./teamchat";

/* A project's team space, beside its team chat (lib/teamchat.ts): pinned messages, Notion-style notes, a task board
   and team calls. Like the chat, all of it is for the project's current team only; the pages and API routes check
   that before calling anything here. */

const IST = 19800, DAY = 86400;
const short = (t: string, n = 60) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/* ---------- pinned messages ---------- */
export const MAX_PINS = 20;
export type Pin = { id: number; text: string; image: boolean; from: string; by: string; at: number };

export const pins = (projectId: number): Pin[] => all(
  `SELECT t.id, t.text, t.kind, u.name from_name, u.deleted, b.name by_name, p.created_at at
   FROM team_pins p JOIN team_messages t ON t.id=p.message_id AND t.project_id=p.project_id
   LEFT JOIN users u ON u.id=t.user_id LEFT JOIN users b ON b.id=p.by_id
   WHERE p.project_id=? ORDER BY p.created_at DESC LIMIT ?`, projectId, MAX_PINS,
).map((r) => ({ id: r.id, text: r.text || (r.kind === "image" ? "Photo" : ""), image: r.kind === "image", from: r.deleted ? "Deleted user" : r.from_name ?? "Someone", by: r.by_name ?? "Someone", at: r.at }));

/* Pins or unpins a message. Returns why not, or null. */
export function setPin(projectId: number, messageId: number, by: { id: number; name: string }, on: boolean): string | null {
  const m = get("SELECT id, kind FROM team_messages WHERE id=? AND project_id=?", messageId, projectId);
  if (!m || m.kind === "system") return "That message cannot be pinned.";
  const pinned = !!get("SELECT 1 FROM team_pins WHERE project_id=? AND message_id=?", projectId, messageId);
  if (on === pinned) return null;
  if (!on) { run("DELETE FROM team_pins WHERE project_id=? AND message_id=?", projectId, messageId); return null; }
  if ((get("SELECT COUNT(*) n FROM team_pins WHERE project_id=?", projectId)?.n ?? 0) >= MAX_PINS) return `Up to ${MAX_PINS} pinned messages. Unpin one first.`;
  run("INSERT INTO team_pins (project_id, message_id, by_id, created_at) VALUES (?,?,?,?)", projectId, messageId, by.id, now());
  systemLine(projectId, `${by.name} pinned a message`);
  return null;
}

/* ---------- notes: Notion-style pages made of blocks ---------- */
export const BLOCK_TYPES = ["p", "h1", "h2", "h3", "todo", "bullet", "number", "quote", "callout", "code", "divider"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];
export type Block = { id: string; type: BlockType; text: string; checked?: boolean };
export const MAX_BLOCKS = 400, MAX_TEXT = 4000, MAX_NOTES = 200;
export const blockId = () => crypto.randomBytes(6).toString("hex");

/* Whatever the browser sent, made safe to store: known block types, plain text, sane sizes, unique ids. */
export function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [], seen = new Set<string>();
  for (const b of raw.slice(0, MAX_BLOCKS)) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const type = (BLOCK_TYPES as readonly string[]).includes(String(o.type)) ? (o.type as BlockType) : "p";
    const id = typeof o.id === "string" && /^[a-z0-9]{4,24}$/i.test(o.id) && !seen.has(o.id) ? o.id : blockId();
    seen.add(id);
    const text = type === "divider" ? "" : String(o.text ?? "").replace(/\r\n?/g, "\n").slice(0, MAX_TEXT);
    out.push(type === "todo" ? { id, type, text, checked: !!o.checked } : { id, type, text });
  }
  return out;
}
/* A page icon: one emoji or symbol, never letters or markup. */
export const cleanIcon = (v: unknown) => { const s = String(v ?? "").trim(); return /^[^\x00-\x7f]{1,8}$/u.test(s) ? s : ""; };

const B = (type: BlockType, text = "", checked?: boolean): Block => (type === "todo" ? { id: blockId(), type, text, checked: !!checked } : { id: blockId(), type, text });
const today = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/* New pages can start from one of these, like Notion's templates. */
export const TEMPLATES: Record<string, { label: string; icon: string; title: () => string; blocks: () => Block[] }> = {
  blank: { label: "Empty page", icon: "📄", title: () => "", blocks: () => [B("p")] },
  meeting: {
    label: "Meeting notes", icon: "🗓️", title: () => `Meeting, ${today()}`,
    blocks: () => [B("h2", "Agenda"), B("bullet"), B("h2", "Notes"), B("p"), B("h2", "Action items"), B("todo")],
  },
  brief: {
    label: "Project brief", icon: "🎯", title: () => "Project brief",
    blocks: () => [B("callout", "In one line: what are we building, and for whom?"), B("h2", "The problem"), B("p"), B("h2", "What we will build"), B("bullet"),
      B("h2", "Not now"), B("bullet"), B("h2", "How we will know it works"), B("todo")],
  },
  retro: {
    label: "Retro", icon: "🔁", title: () => `Retro, ${today()}`,
    blocks: () => [B("h2", "What went well"), B("bullet"), B("h2", "What did not"), B("bullet"), B("h2", "Try next time"), B("todo")],
  },
  launch: {
    label: "Ready for review", icon: "🚀", title: () => "Ready for review",
    blocks: () => [B("callout", "Reviewers open your proof and decide what it is worth. Tick these before you send it for review."),
      B("todo", "The live link works on a phone"), B("todo", "The README says what it is and how to run it"), B("todo", "A short demo video is linked as proof"),
      B("todo", "Every teammate wrote what they did"), B("todo", "Every milestone is ticked on Connect"), B("todo", "Each teammate's GitHub is on their profile")],
  },
};

export type NoteHead = { id: number; title: string; icon: string; important: boolean; updated_at: number; updated_by: string | null };
export type Note = NoteHead & { blocks: Block[]; version: number; created_by: string | null; created_at: number; deleted_at: number | null };

const head = (r: Row): NoteHead => ({ id: r.id, title: r.title, icon: r.icon, important: !!r.important, updated_at: r.updated_at, updated_by: r.ub_deleted ? "Deleted user" : r.ub_name ?? null });
const NOTE_SELECT = `SELECT n.*, ub.name ub_name, ub.deleted ub_deleted, cb.name cb_name, cb.deleted cb_deleted FROM team_notes n
  LEFT JOIN users ub ON ub.id=n.updated_by LEFT JOIN users cb ON cb.id=n.created_by`;

/* Pages, important ones first, then the most recently edited. Pages in the trash for over 30 days are deleted. */
export function noteList(projectId: number): NoteHead[] {
  run("DELETE FROM team_notes WHERE project_id=? AND deleted_at IS NOT NULL AND deleted_at<?", projectId, now() - 30 * DAY);
  return all(`${NOTE_SELECT} WHERE n.project_id=? AND n.deleted_at IS NULL ORDER BY n.important DESC, n.updated_at DESC`, projectId).map(head);
}
export const trashList = (projectId: number): NoteHead[] =>
  all(`${NOTE_SELECT} WHERE n.project_id=? AND n.deleted_at IS NOT NULL ORDER BY n.deleted_at DESC`, projectId).map(head);

export function noteGet(projectId: number, id: number): Note | null {
  const r = get(`${NOTE_SELECT} WHERE n.id=? AND n.project_id=?`, id, projectId);
  if (!r) return null;
  let blocks: Block[] = [];
  try { blocks = cleanBlocks(JSON.parse(r.blocks)); } catch { /* a broken page shows empty rather than failing */ }
  return { ...head(r), blocks: blocks.length ? blocks : [B("p")], version: r.version, created_by: r.cb_deleted ? "Deleted user" : r.cb_name ?? null, created_at: r.created_at, deleted_at: r.deleted_at };
}

export function noteCreate(projectId: number, userId: number, template = "blank"): number | { error: string } {
  if ((get("SELECT COUNT(*) n FROM team_notes WHERE project_id=? AND deleted_at IS NULL", projectId)?.n ?? 0) >= MAX_NOTES) return { error: `Up to ${MAX_NOTES} pages per project. Delete some first.` };
  const t = TEMPLATES[template] ?? TEMPLATES.blank, at = now();
  return Number(run("INSERT INTO team_notes (project_id, title, icon, blocks, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
    projectId, t.title(), t.icon, JSON.stringify(t.blocks()), userId, userId, at, at).lastInsertRowid);
}

/* Saves a page. `base` is the version the editor started from: if a teammate saved in between, nothing is overwritten
   and their version comes back instead, unless `force` (the person chose to keep theirs). */
export function noteSave(projectId: number, id: number, userId: number, data: { title?: unknown; icon?: unknown; blocks?: unknown }, base: number, force = false):
  { version: number } | { conflict: Note } | { error: string } {
  const cur = get("SELECT * FROM team_notes WHERE id=? AND project_id=? AND deleted_at IS NULL", id, projectId);
  if (!cur) return { error: "That page was deleted." };
  if (!force && cur.version !== base) return { conflict: noteGet(projectId, id)! };
  const title = data.title === undefined ? cur.title : String(data.title).replace(/\s+/g, " ").trim().slice(0, 120);
  const icon = data.icon === undefined ? cur.icon : cleanIcon(data.icon);
  const blocks = data.blocks === undefined ? cur.blocks : JSON.stringify(cleanBlocks(data.blocks));
  run("UPDATE team_notes SET title=?, icon=?, blocks=?, version=version+1, updated_by=?, updated_at=? WHERE id=?", title, icon, blocks, userId, now(), id);
  return { version: cur.version + 1 };
}
export const noteImportant = (projectId: number, id: number, on: boolean) =>
  run("UPDATE team_notes SET important=? WHERE id=? AND project_id=?", on ? 1 : 0, id, projectId).changes > 0;
export const noteTrash = (projectId: number, id: number, on: boolean) =>
  run(`UPDATE team_notes SET deleted_at=? WHERE id=? AND project_id=? AND deleted_at IS ${on ? "NULL" : "NOT NULL"}`, on ? now() : null, id, projectId).changes > 0;

/* ---------- tasks: a board with To do, Doing and Done ---------- */
export const TASK_STATUSES: [id: "todo" | "doing" | "done", label: string][] = [["todo", "To do"], ["doing", "Doing"], ["done", "Done"]];
export type TaskStatus = (typeof TASK_STATUSES)[number][0];
export type Task = {
  id: number; title: string; status: TaskStatus; position: number; due: string | null; done_at: number | null;
  assignee: { id: number; name: string; picture: string | null; role: string; gone: boolean } | null;
};
export const MAX_TASKS = 500;
/* Due dates are calendar days in India time, stored as days since 1970 and sent as "2026-11-21". */
export const dayFromDate = (s: unknown): number | null => {
  const m = String(s ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Number.isFinite(t) ? Math.floor(t / 1000 / DAY) : null;
};
export const dateFromDay = (d: number | null): string | null => (d == null ? null : new Date(d * DAY * 1000).toISOString().slice(0, 10));
export const todayDay = () => Math.floor((now() + IST) / DAY);

export const taskList = (projectId: number): Task[] => all(
  `SELECT t.*, u.name, u.picture, u.deleted, m.role, m.status mstatus FROM team_tasks t
   LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN members m ON m.project_id=t.project_id AND m.user_id=t.assignee_id
   WHERE t.project_id=? ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, t.position, t.id`, projectId,
).map((r) => ({
  id: r.id, title: r.title, status: r.status, position: r.position, due: dateFromDay(r.due), done_at: r.done_at,
  assignee: r.assignee_id ? { id: r.assignee_id, name: r.deleted ? "Deleted user" : r.name ?? "Someone", picture: r.deleted ? null : r.picture ?? null, role: r.role || "Member", gone: r.mstatus !== "active" } : null,
}));

const isStatus = (s: unknown): s is TaskStatus => TASK_STATUSES.some(([id]) => id === s);
const lastPos = (projectId: number, status: string) => (get("SELECT MAX(position) n FROM team_tasks WHERE project_id=? AND status=?", projectId, status)?.n ?? 0) as number;

export function taskAdd(projectId: number, userId: number, title: unknown, status: unknown = "todo"): number | { error: string } {
  const t = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!t) return { error: "Give the task a name." };
  if ((get("SELECT COUNT(*) n FROM team_tasks WHERE project_id=?", projectId)?.n ?? 0) >= MAX_TASKS) return { error: `Up to ${MAX_TASKS} tasks per project.` };
  const st = isStatus(status) ? status : "todo", at = now();
  return Number(run("INSERT INTO team_tasks (project_id, title, status, position, created_by, created_at, updated_at, done_at) VALUES (?,?,?,?,?,?,?,?)",
    projectId, t, st, lastPos(projectId, st) + 1, userId, at, at, st === "done" ? at : null).lastInsertRowid);
}

/* Changes a task. The assignee must be on the team. Moving it sets where it lands: before `before`, or at the end. */
export function taskUpdate(projectId: number, id: number, patch: { title?: unknown; status?: unknown; assignee?: unknown; due?: unknown; before?: unknown }): string | null {
  const t = get("SELECT * FROM team_tasks WHERE id=? AND project_id=?", id, projectId);
  if (!t) return "That task is gone.";
  const sets: string[] = [], args: unknown[] = [];
  if (patch.title !== undefined) {
    const title = String(patch.title).replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title) return "Give the task a name.";
    sets.push("title=?"); args.push(title);
  }
  if (patch.assignee !== undefined) {
    const a = patch.assignee === null || patch.assignee === "" ? null : Math.trunc(Number(patch.assignee)) || null;
    if (a && !get("SELECT 1 FROM members WHERE project_id=? AND user_id=? AND status='active'", projectId, a)) return "Assign it to someone on the team.";
    sets.push("assignee_id=?"); args.push(a);
  }
  if (patch.due !== undefined) { sets.push("due=?"); args.push(patch.due === null || patch.due === "" ? null : dayFromDate(patch.due)); }
  if (patch.status !== undefined || patch.before !== undefined) {
    const st = isStatus(patch.status) ? patch.status : t.status;
    const before = patch.before == null ? null : get("SELECT id, position FROM team_tasks WHERE id=? AND project_id=? AND status=? AND id<>?", Math.trunc(Number(patch.before)) || 0, projectId, st, id);
    let pos: number;
    if (before) {
      const prev = get("SELECT MAX(position) n FROM team_tasks WHERE project_id=? AND status=? AND position<? AND id<>?", projectId, st, before.position, id)?.n;
      pos = prev == null ? before.position - 1 : (prev + before.position) / 2;
    } else pos = st === t.status && patch.before === undefined ? t.position : lastPos(projectId, st) + 1;
    sets.push("status=?", "position=?", "done_at=?"); args.push(st, pos, st === "done" ? t.done_at ?? now() : null);
  }
  if (!sets.length) return null;
  run(`UPDATE team_tasks SET ${sets.join(", ")}, updated_at=? WHERE id=?`, ...args, now(), id);
  return null;
}
export const taskDelete = (projectId: number, id: number) => run("DELETE FROM team_tasks WHERE id=? AND project_id=?", id, projectId).changes > 0;

/* ---------- team calls ---------- */
/* Everyone's browser connects to everyone else's, so a call is kept to a team-sized group. */
export const CALL_MAX = 8, CALL_STALE = 15;
export type CallPerson = { user: number; device: string; name: string; picture: string | null; role: string; lead: boolean };

export const activeCall = (projectId: number): Row | undefined => get("SELECT * FROM team_calls WHERE project_id=? AND ended_at IS NULL ORDER BY id DESC LIMIT 1", projectId);

export const callPeople = (callId: number): CallPerson[] => all(
  `SELECT c.user_id, c.device, u.name, u.picture, m.role, (u.id=p.lead_id) lead FROM team_call_people c
   JOIN team_calls k ON k.id=c.call_id JOIN projects p ON p.id=k.project_id JOIN users u ON u.id=c.user_id
   LEFT JOIN members m ON m.project_id=k.project_id AND m.user_id=c.user_id
   WHERE c.call_id=? AND c.left_at IS NULL ORDER BY c.joined_at`, callId,
).map((r) => ({ user: r.user_id, device: r.device, name: r.name, picture: r.picture ?? null, role: r.role || "Member", lead: !!r.lead }));

export function sendSignal(callId: number, from: { user: number; device: string }, to: { user: number; device: string }, type: string, payload: unknown) {
  run("INSERT INTO team_signals (call_id, to_id, to_device, from_id, from_device, type, payload, created_at) VALUES (?,?,?,?,?,?,?,?)",
    callId, to.user, to.device, from.user, from.device, type, JSON.stringify(payload ?? null), now());
}
const tellOthers = (callId: number, from: { user: number; device: string }, type: string, payload: unknown) => {
  for (const p of callPeople(callId)) if (!(p.user === from.user && p.device === from.device)) sendSignal(callId, from, p, type, payload);
};
const clock = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

/* People whose tab went quiet have left; a call with nobody left in it has ended. */
export function sweepCall(callId: number) {
  const c = get("SELECT * FROM team_calls WHERE id=? AND ended_at IS NULL", callId);
  if (!c) return;
  for (const p of all("SELECT * FROM team_call_people WHERE call_id=? AND left_at IS NULL AND seen_at<?", callId, now() - CALL_STALE)) {
    run("UPDATE team_call_people SET left_at=? WHERE call_id=? AND user_id=? AND device=?", now(), callId, p.user_id, p.device);
    tellOthers(callId, { user: p.user_id, device: p.device }, "left", null);
  }
  if (!get("SELECT 1 FROM team_call_people WHERE call_id=? AND left_at IS NULL", callId)) {
    if (run("UPDATE team_calls SET ended_at=? WHERE id=? AND ended_at IS NULL", now(), callId).changes)
      systemLine(c.project_id, `Team ${c.video ? "video" : "voice"} call ended · ${clock(now() - c.created_at)}`);
    run("DELETE FROM team_signals WHERE call_id=?", callId);
  }
}

/* Joins the project's call, starting one if none is on. Returns the people already in it: the newcomer calls each. */
export function joinCall(projectId: number, me: { id: number; name: string }, device: string, video: boolean):
  { call: number; video: boolean; started: boolean; peers: CallPerson[] } | { error: string } {
  return db.transaction(() => {
    const live = activeCall(projectId);
    if (live) sweepCall(live.id);
    let c = activeCall(projectId), started = false;
    if (!c) {
      const id = Number(run("INSERT INTO team_calls (project_id, started_by, video, created_at) VALUES (?,?,?,?)", projectId, me.id, video ? 1 : 0, now()).lastInsertRowid);
      c = get("SELECT * FROM team_calls WHERE id=?", id)!;
      systemLine(projectId, `${me.name} started a team ${video ? "video" : "voice"} call`);
      started = true;
    }
    const inIt = callPeople(c.id);
    if (!inIt.some((p) => p.user === me.id && p.device === device) && inIt.length >= CALL_MAX) return { error: `The call is full (${CALL_MAX} people).` };
    // The same person joining from a second tab or phone replaces the first.
    for (const p of inIt.filter((p) => p.user === me.id && p.device !== device)) {
      run("UPDATE team_call_people SET left_at=? WHERE call_id=? AND user_id=? AND device=?", now(), c.id, p.user, p.device);
      sendSignal(c.id, { user: me.id, device }, p, "replaced", null);
      tellOthers(c.id, p, "left", null);
    }
    run("INSERT OR REPLACE INTO team_call_people (call_id, user_id, device, joined_at, seen_at, left_at) VALUES (?,?,?,?,?,NULL)", c.id, me.id, device, now(), now());
    const peers = callPeople(c.id).filter((p) => !(p.user === me.id && p.device === device));
    const mine = callPeople(c.id).find((p) => p.user === me.id && p.device === device);
    tellOthers(c.id, { user: me.id, device }, "joined", mine);
    return { call: c.id, video: !!c.video, started, peers };
  })();
}

export function leaveCall(callId: number, userId: number, device: string) {
  if (run("UPDATE team_call_people SET left_at=? WHERE call_id=? AND user_id=? AND device=? AND left_at IS NULL", now(), callId, userId, device).changes)
    tellOthers(callId, { user: userId, device }, "left", null);
  sweepCall(callId);
}

export const inCall = (callId: number, userId: number, device: string) =>
  !!get("SELECT 1 FROM team_call_people p JOIN team_calls c ON c.id=p.call_id WHERE p.call_id=? AND p.user_id=? AND p.device=? AND p.left_at IS NULL AND c.ended_at IS NULL", callId, userId, device);

/* The live stream marks the tab as still there. */
export const touchCall = (callId: number, userId: number, device: string) =>
  run("UPDATE team_call_people SET seen_at=? WHERE call_id=? AND user_id=? AND device=? AND left_at IS NULL", now(), callId, userId, device).changes > 0;

/* What the team space shows when a call is on and you are not in it. */
export function callStatus(projectId: number): { id: number; video: boolean; since: number; people: { name: string; picture: string | null; id: number }[] } | null {
  const c = activeCall(projectId);
  if (!c) return null;
  sweepCall(c.id);
  const people = callPeople(c.id);
  if (!people.length) return null;
  const seen = new Set<number>();
  return { id: c.id, video: !!c.video, since: c.created_at, people: people.filter((p) => !seen.has(p.user) && seen.add(p.user)).map((p) => ({ id: p.user, name: p.name, picture: p.picture })) };
}

/* ---------- when someone deletes their account ---------- */
/* Notes and tasks belong to the team, so they stay ("Deleted user" as their author); the person's calls go, and
   their tasks are left unassigned. */
export function forgetTeamspace(userId: number) {
  run("DELETE FROM team_call_people WHERE user_id=?", userId);
  run("DELETE FROM team_signals WHERE to_id=? OR from_id=?", userId, userId);
  run("UPDATE team_tasks SET assignee_id=NULL WHERE assignee_id=?", userId);
}
export const pinPreview = (p: Pin) => `${p.from}: ${short(p.text || "Photo")}`;
