"use server";

import { all, get, run, now, type Row } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { isMember } from "@/lib/college";
import { allow } from "@/lib/notify";
import { push } from "@/lib/push";
import { markTeamRead, onTeam, teamMessages, type TeamMsg } from "@/lib/teamchat";
import {
  callStatus, noteCreate, noteGet, noteImportant, noteList, noteSave, noteTrash, pins, setPin, taskAdd, taskDelete, taskList, taskUpdate, trashList,
  type Note, type NoteHead, type Pin, type Task,
} from "@/lib/teamspace";
export type { TeamMsg } from "@/lib/teamchat";
export type { Note, NoteHead, Pin, Task } from "@/lib/teamspace";

/* Everything in a project's team space: only the project's current team, at the same college. */
async function teammate(projectId: number): Promise<{ me: Row; p: Row } | null> {
  const me = await currentUser();
  if (!me?.onboarded || !isMember(me)) return null;
  const p = get("SELECT id, name FROM projects WHERE id=? AND college_id=?", Math.trunc(Number(projectId)) || 0, me.college_id);
  return p && onTeam(p.id, me.id) ? { me, p } : null;
}
const NO = { error: "Only the team can use this." };
const n = (v: unknown) => Math.trunc(Number(v)) || 0;

/* Lets the rest of the team know, on devices where they turned alerts on and Connect is not open. */
function tellTeam(p: Row, me: Row, text: string, url: string, urgent = false) {
  for (const r of all("SELECT user_id FROM members WHERE project_id=? AND status='active' AND user_id<>?", p.id, me.id))
    void push(r.user_id, { type: "team", project: p.id, title: p.name, text: text.length > 140 ? text.slice(0, 137) + "..." : text, url }, { ttl: urgent ? 120 : 3600, urgent });
}

/* ---------- chat ---------- */
/* New messages after `after` plus the pinned ones, and marks the chat read. The chat calls this every few seconds. */
export async function loadTeamChat(projectId: number, after: number): Promise<{ messages: TeamMsg[]; pins: Pin[] } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  const messages = teamMessages(t.p.id, t.me.id, Math.max(0, n(after)));
  if (messages.length || !after) markTeamRead(t.p.id, t.me.id);
  return { messages, pins: pins(t.p.id) };
}

export async function sendTeamMessage(projectId: number, text: string): Promise<{ message: TeamMsg } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  const body = String(text ?? "").trim().slice(0, 2000);
  if (!body) return { error: "Write something first." };
  if (!allow(`team:${t.me.id}`, 40, 60)) return { error: "You are sending a lot. Wait a minute." };
  const id = Number(run("INSERT INTO team_messages (project_id, user_id, text, created_at) VALUES (?,?,?,?)", t.p.id, t.me.id, body, now()).lastInsertRowid);
  markTeamRead(t.p.id, t.me.id);
  tellTeam(t.p, t.me, `${t.me.name}: ${body}`, `/projects/${t.p.id}/chat`);
  return { message: teamMessages(t.p.id, t.me.id, id - 1, 1)[0] };
}

export async function pinTeamMessage(projectId: number, messageId: number, on: boolean): Promise<{ pins: Pin[] } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  if (!allow(`pin:${t.me.id}`, 30, 600)) return { error: "Slow down a little." };
  const why = setPin(t.p.id, n(messageId), t.me, !!on);
  return why ? { error: why } : { pins: pins(t.p.id) };
}

/* ---------- notes ---------- */
export async function teamNotes(projectId: number): Promise<{ notes: NoteHead[]; trash: NoteHead[] } | { error: string }> {
  const t = await teammate(projectId);
  return t ? { notes: noteList(t.p.id), trash: trashList(t.p.id) } : NO;
}
export async function openNote(projectId: number, id: number): Promise<{ note: Note } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  const note = noteGet(t.p.id, n(id));
  return note && !note.deleted_at ? { note } : { error: "That page was deleted." };
}
export async function newNote(projectId: number, template: string): Promise<{ id: number } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  if (!allow(`note-new:${t.me.id}`, 30, 600)) return { error: "You have made a lot of pages. Wait a few minutes." };
  const r = noteCreate(t.p.id, t.me.id, String(template));
  return typeof r === "number" ? { id: r } : r;
}
export async function saveNote(projectId: number, id: number, data: { title?: string; icon?: string; blocks?: unknown }, base: number, force = false):
  Promise<{ version: number } | { conflict: Note } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  if (!allow(`note-save:${t.me.id}`, 240, 60)) return { error: "Saving too often. Wait a moment." };
  if (JSON.stringify(data ?? {}).length > 400_000) return { error: "That page is too long. Split it into two." };
  return noteSave(t.p.id, n(id), t.me.id, data ?? {}, n(base), !!force);
}
export async function markNoteImportant(projectId: number, id: number, on: boolean): Promise<{ ok: boolean } | { error: string }> {
  const t = await teammate(projectId);
  return t ? { ok: noteImportant(t.p.id, n(id), !!on) } : NO;
}
export async function trashNote(projectId: number, id: number, on: boolean): Promise<{ ok: boolean } | { error: string }> {
  const t = await teammate(projectId);
  return t ? { ok: noteTrash(t.p.id, n(id), !!on) } : NO;
}

/* ---------- tasks ---------- */
export async function teamTasks(projectId: number): Promise<{ tasks: Task[] } | { error: string }> {
  const t = await teammate(projectId);
  return t ? { tasks: taskList(t.p.id) } : NO;
}
export async function addTask(projectId: number, title: string, status: string): Promise<{ tasks: Task[] } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  if (!allow(`task:${t.me.id}`, 60, 600)) return { error: "Slow down a little." };
  const r = taskAdd(t.p.id, t.me.id, title, status);
  return typeof r === "number" ? { tasks: taskList(t.p.id) } : r;
}
export async function editTask(projectId: number, id: number, patch: { title?: string; status?: string; assignee?: number | null; due?: string | null; before?: number | null }):
  Promise<{ tasks: Task[] } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  const why = taskUpdate(t.p.id, n(id), patch ?? {});
  return why ? { error: why } : { tasks: taskList(t.p.id) };
}
export async function removeTask(projectId: number, id: number): Promise<{ tasks: Task[] } | { error: string }> {
  const t = await teammate(projectId);
  if (!t) return NO;
  taskDelete(t.p.id, n(id));
  return { tasks: taskList(t.p.id) };
}

/* ---------- calls ---------- */
/* Whether a team call is on, and who is in it: for the "Join" bar. */
export async function teamCallStatus(projectId: number): Promise<{ call: ReturnType<typeof callStatus> } | { error: string }> {
  const t = await teammate(projectId);
  return t ? { call: callStatus(t.p.id) } : NO;
}
