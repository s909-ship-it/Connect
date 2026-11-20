/* Tiers and credit history on profiles. Run with: npm test. Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-progress-")), "test.db");
const DAY = 86400, T0 = Math.floor(Date.UTC(2026, 5, 1) / 1000);

test("tiers: credit sets the rank, and from Gold up shipped projects are needed too", async () => {
  const { tierFor } = await import("../lib/tiers");
  assert.equal(tierFor(0, 0).tier.name, "Rookie");
  assert.equal(tierFor(49, 0).tier.name, "Rookie");
  assert.equal(tierFor(50, 0).tier.name, "Bronze");
  assert.equal(tierFor(160, 1).tier.name, "Silver");
  assert.equal(tierFor(400, 1).tier.name, "Silver", "400 credit but one shipped project is not Gold");
  assert.equal(tierFor(400, 2).tier.name, "Gold");
  assert.equal(tierFor(5000, 8).tier.name, "Legend");
  const silver = tierFor(250, 1);
  assert.deepEqual(silver.needs, ["50 more credit", "1 more shipped project"]);
  assert.ok(silver.progress >= 0 && silver.progress <= 0.5, "progress counts the part that is further behind");
  assert.equal(tierFor(5000, 8).next, null);
});

test("history: earned lines in date order with a running total; held credit and gifts left out", async () => {
  const { progressOf } = await import("../lib/progress");
  const ledger = [
    { what: "P shipped", why: "", n: 40, at: T0 + 30 * DAY, pid: 1 },
    { what: "Starter credit", why: "", n: 20, at: T0 },
    { what: "Q: stake held", why: "", n: -10, held: true, pid: 2 },
    { what: "Credit received", why: "", n: 99, held: true, at: T0 + DAY },
    { what: "Accurate reviews", why: "", n: 6, at: T0 + 50 * DAY, steps: [{ at: T0 + 10 * DAY, n: 3 }, { at: T0 + 50 * DAY, n: 3 }] },
  ];
  const p = progressOf({ ledger }, T0 + 60 * DAY);
  assert.deepEqual(p.moments.map((m) => [m.what, m.n, m.total]), [["Starter credit", 20, 20], ["Accurate reviews", 3, 23], ["P shipped", 40, 63], ["Accurate reviews", 3, 66]]);
  assert.deepEqual(p.reached.map((r) => [r.tier.name, r.at]), [["Bronze", T0 + 30 * DAY]], "Bronze is reached on the day the total passes 50");
  assert.equal(p.points[p.points.length - 1].v, 66, "the graph ends at today's earned credit");
  assert.equal(p.points[0].v, 20);
  assert.ok(p.points.every((x, i) => i === 0 || x.d > p.points[i - 1].d));
});

test("the credit engine dates every earned line from its record", async () => {
  const { run } = await import("../lib/db");
  const { compute } = await import("../lib/credit");
  const user = (name: string) => Number(run("INSERT INTO users (sub, name, verified, onboarded, role, created_at) VALUES (?,?,1,1,'student',?)", `t:${name}`, name, T0).lastInsertRowid);
  const a = user("A"), b = user("B");
  const pid = Number(run("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at) VALUES ('Rover','r','shipped',?,100,?,?)", a, T0 + DAY, T0 + 20 * DAY).lastInsertRowid);
  run("INSERT INTO members (project_id, user_id) VALUES (?,?), (?,?)", pid, a, pid, b);
  run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", b, a, T0 + 25 * DAY);
  const left = Number(run("INSERT INTO projects (name, pitch, status, lead_id, created_at) VALUES ('Quit','q','building',?,?)", b, T0 + 2 * DAY).lastInsertRowid);
  run("INSERT INTO members (project_id, user_id, status, stake, left_at) VALUES (?,?,'left',10,?)", left, a, T0 + 5 * DAY);
  const L = compute().get(a)!.ledger;
  const at = (re: RegExp) => L.find((l) => re.test(l.what))?.at;
  assert.equal(at(/^Starter credit$/), T0);
  assert.equal(at(/^Rover shipped$/), T0 + 20 * DAY);
  assert.equal(L.find((l) => /^Rover shipped$/.test(l.what))?.pid, pid);
  assert.equal(at(/^Vouch from a teammate$/), T0 + 25 * DAY);
  assert.equal(at(/^Quit: stake lost$/), T0 + 5 * DAY);
});
