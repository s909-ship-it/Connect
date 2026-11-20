/* Tests that the public showcase API (lib/public.ts) shows nothing a signed-out visitor cannot already see.
   Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-public-")), "test.db");

test("public API: only shipped, unhidden projects at active colleges, and only verified students", async () => {
  const { run, now, TABLES } = await import("../lib/db");
  const P = await import("../lib/public");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  const t = now();
  const open = Number(run("INSERT INTO colleges (slug, name, domains, status, created_at) VALUES ('open','Open','open.example','active',?)", t).lastInsertRowid);
  const pending = Number(run("INSERT INTO colleges (slug, name, domains, status, created_at) VALUES ('wait','Wait','wait.example','pending',?)", t).lastInsertRowid);
  const user = (name: string, college: number, o: { verified?: number; role?: string; suspended?: number } = {}) =>
    Number(run("INSERT INTO users (sub, name, email, verified, onboarded, college_id, role, suspended, created_at) VALUES (?,?,?,?,1,?,?,?,?)",
      `t:${name}`, name, `${name}@open.example`, o.verified ?? 1, college, o.role ?? "student", o.suspended ?? 0, t).lastInsertRowid);
  const ana = user("ana", open), ben = user("ben", open, { verified: 0 }), cy = user("cy", open, { suspended: 1 }), dee = user("dee", pending);
  const project = (name: string, college: number, status: string, hidden = 0) =>
    Number(run("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at, college_id, hidden) VALUES (?,?,?,?,?,?,?,?,?)",
      name, `${name} pitch`, status, ana, status === "shipped" ? 100 : 0, t, status === "shipped" ? t : null, college, hidden).lastInsertRowid);
  const shipped = project("Shipped", open, "shipped");
  const building = project("Building", open, "building");
  const hidden = project("Hidden", open, "shipped", 1);
  const elsewhere = project("Elsewhere", pending, "shipped");
  for (const u of [ana, ben, cy]) run("INSERT INTO members (project_id, user_id, role, did, status) VALUES (?,?,?,?, 'active')", shipped, u, "Dev", `did ${u}`);
  run("INSERT INTO members (project_id, user_id, role, did, status) VALUES (?,?,?,?, 'active')", elsewhere, dee, "Dev", "x");

  assert.deepEqual(P.shippedProjects().map((p) => p.id), [shipped]);
  for (const id of [building, hidden, elsewhere]) assert.equal(P.shippedProject(id), null);

  const detail = P.shippedProject(shipped)!;
  assert.deepEqual(detail.team.map((m) => m.id), [ana]); // unverified and suspended teammates are not named
  assert.equal(detail.hiddenTeammates, 2);
  assert.equal(detail.teamSize, 3);

  assert.deepEqual(P.colleges().map((c) => c.slug), ["open"]);
  assert.equal(P.college("wait"), null);
  for (const id of [ben, cy, dee]) assert.equal(P.builder(id), null);
  assert.ok(P.builder(ana));
  assert.deepEqual(P.signedLines().map((l) => l.builder.id), [ana]);

  // No email addresses anywhere in the output.
  const all = JSON.stringify([P.overview(), P.shippedProjects(), detail, P.colleges(), P.college("open"), P.builders(), P.builder(ana), P.skills(), P.signedLines()]);
  assert.ok(!all.includes("@open.example"), "emails must never appear");
});

test("public API: ranks, history and anonymous mode", async () => {
  const { run, now, TABLES } = await import("../lib/db");
  const P = await import("../lib/public");
  const { setAnonymous } = await import("../lib/identity");
  const { get } = await import("../lib/db");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  const t = now();
  const col = Number(run("INSERT INTO colleges (slug, name, domains, status, created_at) VALUES ('open','Open','open.example','active',?)", t).lastInsertRowid);
  const user = (name: string) => Number(run("INSERT INTO users (sub, name, email, verified, onboarded, college_id, role, created_at, picture) VALUES (?,?,?,1,1,?,'student',?,?)",
    `t:${name}`, name, `${name}@open.example`, col, t - 86400 * 30, `https://lh3.googleusercontent.com/${name}`).lastInsertRowid);
  const ana = user("Ana Real"), zed = user("Zed Real");
  const project = (name: string, hidden = 0) => Number(run("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at, college_id, hidden) VALUES (?,?,'shipped',?,100,?,?,?,?)",
    name, `${name} pitch`, ana, t - 86400 * 10, t - 86400 * 5, col, hidden).lastInsertRowid);
  const open = project("Open Thing"), secret = project("Secret Thing", 1);
  for (const pid of [open, secret]) for (const u of [ana, zed]) run("INSERT INTO members (project_id, user_id, role, did, status) VALUES (?,?,'Dev',?, 'active')", pid, u, `did ${u}`);
  run("UPDATE users SET photo_key='upl0aded_key' WHERE id=?", ana);
  setAnonymous(get("SELECT * FROM users WHERE id=?", zed), true);

  // Ranks are public; every builder has one.
  for (const b of P.builders()) assert.ok(b.tier.id && b.tier.name);
  const a = P.builder(ana)!;
  assert.ok(a.rank.id);
  assert.equal(a.avatar, "/api/avatar/upl0aded_key"); // an uploaded photo shows; a sign-in provider photo never does
  // History: dated points and moves, with a private project's name kept out.
  assert.ok(a.progress && a.progress.points.length > 0);
  const hist = JSON.stringify(a.progress);
  assert.ok(!hist.includes("Secret Thing") && hist.includes("A private project"));

  // Anonymous: listed by alias and pattern, never tied to a project, a line or a history, and the real name never shows.
  const z = P.builder(zed)!;
  assert.ok(z.anonymous && /^Anon \d{8}$/.test(z.name) && z.avatar!.startsWith("/api/identicon/"));
  assert.deepEqual([z.projects.length, z.clubs.length, z.progress], [0, 0, null]);
  assert.deepEqual(P.shippedProject(open)!.team.map((m) => m.id), [ana]);
  assert.equal(P.shippedProject(open)!.hiddenTeammates, 1);
  assert.ok(!P.signedLines().some((l) => l.builder.id === zed));
  const out = JSON.stringify([P.overview(), P.shippedProjects(), P.shippedProject(open), P.builders(), a, z, P.signedLines()]);
  assert.ok(!out.includes("Zed Real"), "an anonymous person's real name must never appear");
  assert.ok(!out.includes("googleusercontent"), "sign-in provider photos must never appear");

  // The account menu: only the person themselves; nobody when signed out.
  assert.deepEqual(P.account(null), { signedIn: false });
  const me = P.account(get("SELECT * FROM users WHERE id=?", ana));
  assert.ok(me.signedIn && me.id === ana && me.rank);
});

test("public API: credentialed origins", async () => {
  const { trusted } = await import("../lib/public-http");
  process.env.PUBLIC_API_ORIGIN = "https://show.example.in";
  assert.equal(trusted("https://show.example.in"), "https://show.example.in");
  assert.equal(trusted("https://evil.example"), null);
  assert.equal(trusted(null), null);
  delete process.env.PUBLIC_API_ORIGIN;
});
