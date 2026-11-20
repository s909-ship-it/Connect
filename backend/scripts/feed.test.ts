import { test } from "node:test";
import assert from "node:assert/strict";
import { FEED, learnInterest, rankBoard, score, type FeedProject, type FeedViewer } from "../lib/feed";

const DAY = 86400, T = 1_800_000_000;
const proj = (o: Partial<FeedProject> & { id: number }): FeedProject => ({
  lead: 100 + o.id, status: "building", created: T - 30 * DAY, lastActive: T - 30 * DAY, team: [100 + o.id], openRoles: 0,
  fit: [], skills: [], followed: false, mine: false, ...o,
});
const viewer = (o: Partial<FeedViewer> = {}): FeedViewer => ({
  id: 1, direct: new Set(), second: new Map(), names: new Map(), interest: new Map(), seen: new Map(), ...o,
});

test("For you: your own, dropped and hidden projects are left out", () => {
  const v = viewer({ seen: new Map([[3, { views: 0, last: T, hidden: true, asked: false }]]) });
  assert.equal(score(proj({ id: 1, mine: true }), v, T), null);
  assert.equal(score(proj({ id: 2, status: "dropped" }), v, T), null);
  assert.equal(score(proj({ id: 3 }), v, T), null);
  assert.ok(score(proj({ id: 4 }), v, T));
});

test("For you: a role that needs your confirmed skill ranks above one that does not, and says so", () => {
  const a = score(proj({ id: 1, openRoles: 1, fit: ["React"] }), viewer(), T)!;
  const b = score(proj({ id: 2, openRoles: 1 }), viewer(), T)!;
  assert.ok(a.score > b.score);
  assert.equal(a.why[0], "Needs your React");
});

test("For you: popularity is not an input, so a new quiet project is not buried", () => {
  // Nothing about other people's views, follows or credit exists in FeedProject: the type itself rules it out.
  const fresh = score(proj({ id: 1, created: T - DAY, lastActive: T - DAY, openRoles: 1 }), viewer(), T)!;
  const old = score(proj({ id: 2, openRoles: 1 }), viewer(), T)!;
  assert.ok(fresh.score > old.score);
  assert.ok(fresh.why.includes("New this week") || fresh.why.includes("Moving this week"));
});

test("For you: knowing the team counts, directly more than through a friend", () => {
  const names = new Map([[50, "Riya Patil"], [60, "Kabir Shaikh"]]);
  const mate = score(proj({ id: 1, team: [50] }), viewer({ direct: new Set([50]), names }), T)!;
  const friend = score(proj({ id: 2, team: [70] }), viewer({ second: new Map([[70, "Kabir Shaikh"]]), names }), T)!;
  const none = score(proj({ id: 3 }), viewer({ names }), T)!;
  assert.ok(mate.score > friend.score && friend.score > none.score);
  assert.equal(mate.why[0], "Riya, who you worked with, is on it");
  assert.equal(friend.why[0], "Kabir has shipped with this team");
});

test("For you: it learns from what you open, and hiding pushes a skill down", () => {
  const learned = learnInterest([
    { skills: ["React"], kind: "view", at: T }, { skills: ["React", "Node"], kind: "follow", at: T },
    { skills: ["PCB design"], kind: "hide", at: T },
  ], T);
  assert.equal(learned.get("react"), 1);
  assert.ok((learned.get("node") ?? 0) > 0 && (learned.get("node") ?? 0) < 1);
  assert.equal(learned.has("pcb design"), false);
  const v = viewer({ interest: learned });
  assert.ok(score(proj({ id: 1, skills: ["React"] }), v, T)!.score > score(proj({ id: 2, skills: ["PCB design"] }), v, T)!.score);
});

test("For you: older actions teach less (half every three weeks)", () => {
  const w = learnInterest([{ skills: ["Go"], kind: "view", at: T - FEED.interestHalfLifeDays * DAY }, { skills: ["Rust"], kind: "view", at: T }], T);
  assert.equal(w.get("rust"), 1);
  assert.ok(Math.abs((w.get("go") ?? 0) - 0.5) < 0.01);
});

test("For you: a project opened again and again without acting on it slips down", () => {
  const seen = new Map([[1, { views: 5, last: T - DAY, hidden: false, asked: false }]]);
  assert.ok(score(proj({ id: 1 }), viewer({ seen }), T)!.score < score(proj({ id: 1 }), viewer(), T)!.score);
});

test("For you: one lead's projects are not shown back to back when there is a choice", () => {
  const ps = [proj({ id: 1, lead: 9, openRoles: 1, fit: ["React"] }), proj({ id: 2, lead: 9, openRoles: 1, fit: ["React"] }), proj({ id: 3, lead: 8 })];
  const order = rankBoard(ps, viewer(), T).map((r) => r.id);
  assert.deepEqual(order, [2, 3, 1]);
});
