/* Tests for the club rules (lib/clubs.ts). Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-clubs-")), "test.db");

async function setup() {
  const { run, get, now, TABLES } = await import("../lib/db");
  const C = await import("../lib/clubs");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  const college = Number(run("INSERT INTO colleges (slug, name, domains, status, created_at) VALUES ('t','T','t.example','active',?)", now()).lastInsertRowid);
  let n = 0;
  const user = (o: { admin?: number; verified?: number; role?: string } = {}) => {
    const id = Number(run("INSERT INTO users (sub, name, verified, onboarded, college_id, admin, role, created_at) VALUES (?,?,?,1,?,?,?,?)",
      `t:${++n}`, `User ${n}`, o.verified ?? 1, college, o.admin ?? 0, o.role ?? "student", now()).lastInsertRowid);
    return get("SELECT * FROM users WHERE id=?", id)!;
  };
  const club = (id: number) => get("SELECT * FROM clubs WHERE id=?", id)!;
  const member = (c: number, u: number) => get("SELECT * FROM club_members WHERE club_id=? AND user_id=?", c, u);
  return { C, user, club, member, run, get };
}

test("clubs: a member's new club waits for an admin, even with only them in it", async () => {
  const { C, user, club } = await setup();
  const me = user(), other = user();
  const id = C.requestClub(me, "Chess Club", "We play chess") as number;
  assert.equal(typeof id, "number");
  const c = club(id);
  assert.equal(c.status, "pending");
  assert.equal(C.seesClub(c, me), true, "the person who asked can see it");
  assert.equal(C.seesClub(c, other), false, "nobody else can until it is approved");
  assert.match(String(C.askToJoin(other, c)), /not open/);
  assert.match(String(C.inviteMember(me, c, other.id)), /once an admin approves/);
});

test("clubs: only an admin approves; a decline needs a reason the person sees", async () => {
  const { C, user, club, get } = await setup();
  const me = user(), admin = user({ admin: 1 });
  const id = C.requestClub(me, "Film Club", "") as number;
  assert.match(String(C.decideClub(me, club(id), true)), /Only an admin/);
  assert.match(String(C.decideClub(admin, club(id), false, "")), /why/i);
  assert.equal(C.decideClub(admin, club(id), true), null);
  assert.equal(club(id).status, "active");
  assert.ok(get("SELECT 1 FROM notifications WHERE user_id=? AND text LIKE '%approved%'", me.id));
});

test("clubs: an admin's own club opens straight away; names must be unique and limits hold", async () => {
  const { C, user, club } = await setup();
  const admin = user({ admin: 1 }), me = user(), alum = user({ role: "alum" }), unverified = user({ verified: 0 });
  assert.equal(club(C.requestClub(admin, "Quiz Club", "") as number).status, "active");
  assert.match(String(C.requestClub(me, "quiz club", "")), /already exists/);
  assert.match(String(C.requestClub(alum, "Alum Club", "")), /verified members/);
  assert.match(String(C.requestClub(unverified, "Ghost Club", "")), /verified members/);
  C.requestClub(me, "One Club", ""); C.requestClub(me, "Two Club", "");
  assert.match(String(C.requestClub(me, "Three Club", "")), /waiting/);
});

test("clubs: leads add members by invitation, and nobody is in until they say yes", async () => {
  const { C, user, club, member } = await setup();
  const lead = user(), admin = user({ admin: 1 }), friend = user(), stranger = user();
  const id = C.requestClub(lead, "Dance Club", "") as number;
  C.decideClub(admin, club(id), true);
  assert.equal(C.inviteMember(lead, club(id), friend.id), null);
  assert.equal(member(id, friend.id).confirmed, 0);
  assert.match(String(C.inviteMember(stranger, club(id), friend.id)), /lead or co-leads/);
  assert.equal(C.answerInvite(friend, club(id), true), null);
  assert.equal(member(id, friend.id).confirmed, 1);
});

test("clubs: co-leads help run it, but only the lead hands over, makes co-leads or deletes", async () => {
  const { C, user, club, member } = await setup();
  const lead = user(), admin = user({ admin: 1 }), co = user(), plain = user(), next = user();
  const id = C.requestClub(lead, "Space Club", "") as number;
  C.decideClub(admin, club(id), true);
  for (const u of [co, plain, next]) { C.inviteMember(lead, club(id), u.id); C.answerInvite(u, club(id), true); }
  assert.equal(C.setMember(lead, club(id), co.id, "Events head", true), null);
  assert.equal(C.manages(club(id), co), true);
  assert.equal(C.manages(club(id), plain), false);
  assert.equal(C.updateClub(co, club(id), "Space and Astronomy Club", "Night sky"), null, "a co-lead can edit");
  C.setMember(co, club(id), plain.id, "Member", true);
  assert.equal(member(id, plain.id).manage, 0, "a co-lead cannot make others co-leads");
  assert.match(String(C.removeMember(co, club(id), lead.id)), /lead cannot/);
  assert.match(String(C.transferLead(co, club(id), next.id)), /Only the lead/);
  assert.match(String(C.deleteClub(co, club(id), "Space and Astronomy Club")), /Only the lead/);
  assert.equal(C.transferLead(lead, club(id), next.id), null);
  assert.equal(club(id).lead_id, next.id);
  assert.equal(member(id, lead.id).manage, 1, "the old lead stays as a co-lead");
});

test("clubs: plans need a day; deleting asks for the exact name and clears roster and plans", async () => {
  const { C, user, club, get } = await setup();
  const lead = user(), admin = user({ admin: 1 }), mate = user();
  const id = C.requestClub(lead, "Art Club", "") as number;
  C.decideClub(admin, club(id), true);
  C.inviteMember(lead, club(id), mate.id); C.answerInvite(mate, club(id), true);
  const day = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  assert.match(String(C.addPlan(lead, club(id), "Sketch walk", "", "", "")), /day/);
  assert.match(String(C.addPlan(lead, club(id), "Sketch walk", "", "2001-01-01", "")), /today or/);
  assert.equal(C.addPlan(lead, club(id), "Sketch walk", "Bring pencils", day, "Main gate"), null);
  assert.match(String(C.addPlan(mate, club(id), "My plan", "", day, "")), /lead or co-leads/);
  assert.ok(get("SELECT 1 FROM notifications WHERE user_id=? AND text LIKE '%Sketch walk%'", mate.id), "members are told about plans");
  assert.match(String(C.deleteClub(lead, club(id), "art")), /exactly/);
  assert.equal(C.deleteClub(lead, club(id), "art club"), null);
  assert.equal(get("SELECT 1 FROM clubs WHERE id=?", id), undefined);
  assert.equal(get("SELECT 1 FROM club_plans WHERE club_id=?", id), undefined);
  assert.equal(get("SELECT 1 FROM club_members WHERE club_id=?", id), undefined);
});
