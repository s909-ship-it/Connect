/* Team chat rules. Run with: npm test. Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-team-")), "test.db");

test("only the current team is on it, messages carry name, role and lead tags, and unread counts work", async () => {
  const { run, now, TABLES } = await import("../lib/db");
  const { onTeam, teamMessages, systemLine, markTeamRead, unreadTeam, teamOf } = await import("../lib/teamchat");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  for (const [id, name] of [[1, "Riya Patil"], [2, "Arjun Mane"], [3, "Kabir Shaikh"], [4, "Outsider"]] as const)
    run("INSERT INTO users (id, sub, name, verified, onboarded, created_at) VALUES (?,?,?,1,1,?)", id, `t:${id}`, name, now());
  const pid = Number(run("INSERT INTO projects (name, pitch, lead_id, created_at) VALUES ('Attend','x',1,?)", now()).lastInsertRowid);
  run("INSERT INTO members (project_id, user_id, role) VALUES (?,1,'Lead'),(?,2,'Backend'),(?,3,'Design')", pid, pid, pid);

  assert.ok(onTeam(pid, 2));
  assert.ok(!onTeam(pid, 4), "someone not on the team cannot read it");
  assert.deepEqual(teamOf(pid).map((u) => [u.name, u.role, !!u.lead]), [["Riya Patil", "Lead", true], ["Arjun Mane", "Backend", false], ["Kabir Shaikh", "Design", false]]);

  run("INSERT INTO team_messages (project_id, user_id, text, created_at) VALUES (?,1,'Kickoff at 6',?)", pid, now());
  run("INSERT INTO team_messages (project_id, user_id, text, created_at) VALUES (?,2,'API is up',?)", pid, now());
  const seenByArjun = teamMessages(pid, 2);
  assert.equal(seenByArjun[0].from?.lead, true);
  assert.equal(seenByArjun[1].from?.role, "Backend");
  assert.equal(seenByArjun[1].mine, true);
  assert.equal(seenByArjun[0].mine, false);

  assert.equal(unreadTeam(pid, 3), 2, "Kabir has two new messages");
  assert.equal(unreadTeam(pid, 2), 1, "your own messages never count as new");
  markTeamRead(pid, 3);
  assert.equal(unreadTeam(pid, 3), 0);

  run("UPDATE members SET status='left' WHERE project_id=? AND user_id=3", pid);
  systemLine(pid, "Kabir Shaikh left the team");
  assert.ok(!onTeam(pid, 3), "leaving the team ends access");
  const after = teamMessages(pid, 1);
  assert.equal(after.at(-1)?.kind, "system");
  assert.equal(after.at(-1)?.from, null);
  run("INSERT INTO team_messages (project_id, user_id, text, created_at) VALUES (?,3,'old note',?)", pid, now() - 10);
  assert.equal(teamMessages(pid, 1).find((m) => m.text === "old note")?.from?.gone, true, "a former member's messages say so");
});

async function teamSetup() {
  const { run, now, TABLES } = await import("../lib/db");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  for (const [id, name] of [[1, "Riya Patil"], [2, "Arjun Mane"], [3, "Kabir Shaikh"], [4, "Outsider"]] as const)
    run("INSERT INTO users (id, sub, name, verified, onboarded, created_at) VALUES (?,?,?,1,1,?)", id, `t:${id}`, name, now());
  const pid = Number(run("INSERT INTO projects (name, pitch, lead_id, created_at) VALUES ('Attend','x',1,?)", now()).lastInsertRowid);
  run("INSERT INTO members (project_id, user_id, role) VALUES (?,1,'Lead'),(?,2,'Backend'),(?,3,'Design')", pid, pid, pid);
  return { run, now, pid };
}

test("pins: any teammate pins a message, system lines cannot be pinned, and pinning says so in the chat", async () => {
  const { run, now, pid } = await teamSetup();
  const { setPin, pins } = await import("../lib/teamspace");
  const { teamMessages } = await import("../lib/teamchat");
  const m = Number(run("INSERT INTO team_messages (project_id, user_id, text, created_at) VALUES (?,2,'Demo is Friday 5pm',?)", pid, now()).lastInsertRowid);
  const sys = Number(run("INSERT INTO team_messages (project_id, user_id, text, kind, created_at) VALUES (?,NULL,'x joined','system',?)", pid, now()).lastInsertRowid);
  assert.equal(setPin(pid, m, { id: 3, name: "Kabir Shaikh" }, true), null);
  assert.equal(setPin(pid, m, { id: 3, name: "Kabir Shaikh" }, true), null, "pinning twice is fine");
  assert.match(setPin(pid, sys, { id: 3, name: "Kabir Shaikh" }, true) ?? "", /cannot be pinned/);
  assert.deepEqual(pins(pid).map((p) => [p.text, p.from, p.by]), [["Demo is Friday 5pm", "Arjun Mane", "Kabir Shaikh"]]);
  assert.equal(teamMessages(pid, 1).at(-1)?.text, "Kabir Shaikh pinned a message");
  setPin(pid, m, { id: 1, name: "Riya Patil" }, false);
  assert.equal(pins(pid).length, 0);
});

test("notes: templates, safe blocks, and a teammate's newer save is never silently overwritten", async () => {
  const { pid } = await teamSetup();
  const { noteCreate, noteGet, noteSave, noteList, noteImportant, noteTrash, trashList, cleanBlocks, cleanIcon } = await import("../lib/teamspace");
  const id = noteCreate(pid, 1, "launch") as number;
  const n = noteGet(pid, id)!;
  assert.equal(n.icon, "🚀");
  assert.ok(n.blocks.filter((b) => b.type === "todo").length >= 5, "the review checklist template has to-dos");

  const dirty = cleanBlocks([{ id: "a1b2", type: "h1", text: "Plan" }, { id: "a1b2", type: "script", text: "<img onerror=x>" }, { type: "todo", text: "Ship", checked: 1 }, { type: "divider", text: "ignored" }, "junk"]);
  assert.deepEqual(dirty.map((b) => b.type), ["h1", "p", "todo", "divider"], "unknown types become paragraphs, junk is dropped");
  assert.notEqual(dirty[1].id, "a1b2", "duplicate ids are replaced");
  assert.equal(dirty[2].checked, true);
  assert.equal(dirty[3].text, "");
  assert.equal(cleanIcon("🎯"), "🎯");
  assert.equal(cleanIcon("<b>"), "", "icons cannot be markup or letters");

  const r1 = noteSave(pid, id, 2, { title: "Review checklist" }, n.version);
  assert.ok("version" in r1);
  const stale = noteSave(pid, id, 3, { title: "Kabir's title" }, n.version);
  assert.ok("conflict" in stale, "Kabir started from an older version, so Riya's change is not overwritten");
  if ("conflict" in stale) assert.equal(stale.conflict.title, "Review checklist");
  const forced = noteSave(pid, id, 3, { title: "Kabir's title" }, n.version, true);
  assert.ok("version" in forced, "choosing to keep yours saves it");
  assert.equal(noteGet(pid, id)!.updated_by, "Kabir Shaikh");

  const other = noteCreate(pid, 1, "blank") as number;
  noteImportant(pid, id, true);
  assert.equal(noteList(pid)[0].id, id, "important pages come first");
  noteTrash(pid, other, true);
  assert.ok(!noteList(pid).some((x) => x.id === other));
  assert.ok(trashList(pid).some((x) => x.id === other));
  noteTrash(pid, other, false);
  assert.ok(noteList(pid).some((x) => x.id === other), "restored from the trash");
});

test("tasks: a board with order, only teammates as assignees, due dates as days", async () => {
  const { pid } = await teamSetup();
  const { taskAdd, taskUpdate, taskList, taskDelete } = await import("../lib/teamspace");
  const a = taskAdd(pid, 1, "Login page") as number, b = taskAdd(pid, 1, "  RFID   driver ") as number, c = taskAdd(pid, 1, "Demo video") as number;
  assert.deepEqual(taskList(pid).map((t) => t.title), ["Login page", "RFID driver", "Demo video"]);
  assert.match(taskUpdate(pid, a, { assignee: 4 }) ?? "", /someone on the team/, "an outsider cannot be assigned");
  assert.equal(taskUpdate(pid, a, { assignee: 2, due: "2026-11-25" }), null);
  const t = taskList(pid).find((x) => x.id === a)!;
  assert.equal(t.assignee?.role, "Backend");
  assert.equal(t.due, "2026-11-25");
  assert.equal(taskUpdate(pid, c, { status: "todo", before: a }), null, "dragged to the top of To do");
  assert.deepEqual(taskList(pid).filter((x) => x.status === "todo").map((x) => x.title), ["Demo video", "Login page", "RFID driver"]);
  taskUpdate(pid, b, { status: "done" });
  const done = taskList(pid).find((x) => x.id === b)!;
  assert.equal(done.status, "done");
  assert.ok(done.done_at);
  taskUpdate(pid, b, { status: "doing" });
  assert.equal(taskList(pid).find((x) => x.id === b)!.done_at, null);
  assert.match(taskUpdate(pid, a, { title: "   " }) ?? "", /name/);
  assert.ok(taskDelete(pid, c));
  assert.equal(taskList(pid).length, 2);
});

test("team calls: the newcomer gets everyone already in, people who vanish are dropped, the last to leave ends it", async () => {
  const { run, now, pid } = await teamSetup();
  const { joinCall, leaveCall, callPeople, callStatus, activeCall, inCall } = await import("../lib/teamspace");
  const { teamMessages } = await import("../lib/teamchat");
  const r1 = joinCall(pid, { id: 1, name: "Riya Patil" }, "dev-riya-01", true);
  assert.ok("call" in r1 && r1.started && r1.peers.length === 0);
  const call = (r1 as { call: number }).call;
  assert.match(teamMessages(pid, 2).at(-1)?.text ?? "", /Riya Patil started a team video call/);
  const r2 = joinCall(pid, { id: 2, name: "Arjun Mane" }, "dev-arjun-1", false);
  assert.ok("call" in r2 && !r2.started && r2.call === call, "the second person joins the same call");
  assert.deepEqual((r2 as { peers: { user: number }[] }).peers.map((p) => p.user), [1], "and gets Riya to connect to");
  const { get } = await import("../lib/db");
  assert.equal(get("SELECT COUNT(*) n FROM team_signals WHERE to_id=1 AND type='joined' AND from_id=2")?.n, 1, "Riya is told Arjun joined");
  assert.equal(callStatus(pid)?.people.length, 2);

  // Arjun's tab disappears without saying goodbye.
  run("UPDATE team_call_people SET seen_at=? WHERE user_id=2", now() - 60);
  callStatus(pid);
  assert.deepEqual(callPeople(call).map((p) => p.user), [1]);
  assert.ok(!inCall(call, 2, "dev-arjun-1"));

  leaveCall(call, 1, "dev-riya-01");
  assert.equal(activeCall(pid), undefined, "the last person leaving ends the call");
  assert.match(teamMessages(pid, 2).at(-1)?.text ?? "", /Team video call ended/);
  assert.equal(callStatus(pid), null);
});
