/* Anonymous mode, the patterns that replace photos, and project covers. Run with: npm test. Throwaway database. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-identity-")), "test.db");

async function setup() {
  const { run, get, now, TABLES } = await import("../lib/db");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  run("INSERT INTO users (id, sub, name, picture, verified, onboarded, created_at) VALUES (1,'google:1','Riya Patil','https://lh3.example/riya.jpg',1,1,?)", now());
  return { run, get };
}

test("aliases look like Anon 48213097 and never repeat someone's name or alias", async () => {
  const { run } = await setup();
  const { newAlias } = await import("../lib/identity");
  for (let i = 0; i < 30; i++) assert.match(newAlias(), /^Anon [1-9]\d{7}$/);
  // The first pick is already taken, so the next one is used instead.
  run("UPDATE users SET alias='Anon 10000000' WHERE id=1");
  let calls = 0;
  const alias = newAlias((n) => (calls++ < 8 ? 0 : 5 % n));
  assert.equal(alias, "Anon 65555555");
});

test("the pattern is the same for the same alias, mirrored like GitHub's, and changes with the alias", async () => {
  const { identicon } = await import("../lib/identity");
  const a = identicon("Anon 48213097"), b = identicon("Anon 48213097"), c = identicon("Anon 77120394");
  assert.equal(a, b);
  assert.notEqual(a, c);
  const cells = [...a.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="1"/g)].map((m) => [Number(m[1]) - 0.5, Number(m[2]) - 0.5]);
  for (const [x, y] of cells) assert.ok(cells.some(([x2, y2]) => x2 === 4 - x && y2 === y), `cell ${x},${y} has its mirror`);
});

test("project covers are drawn from the name and cannot carry markup", async () => {
  const { cover } = await import("../lib/identity");
  assert.equal(cover("BusPing"), cover("busping "), "same name, same cover");
  assert.notEqual(cover("BusPing"), cover("MessMate"));
  assert.ok(!cover("<script>").includes("<script"), "a name starting with < cannot inject markup");
});

test("going anonymous swaps the name and photo everyone sees; going back restores them", async () => {
  const { get } = await setup();
  const { setAnonymous, identiconUrl } = await import("../lib/identity");
  const alias = setAnonymous(get("SELECT * FROM users WHERE id=1"), true)!;
  let u = get("SELECT * FROM users WHERE id=1");
  assert.equal(u.name, alias);
  assert.equal(u.picture, identiconUrl(alias));
  assert.equal(u.real_name, "Riya Patil");
  assert.equal(u.real_picture, "https://lh3.example/riya.jpg");
  const next = setAnonymous(u, true, true)!;
  u = get("SELECT * FROM users WHERE id=1");
  assert.notEqual(next, alias, "a new alias on request");
  assert.equal(u.name, next);
  assert.equal(u.real_name, "Riya Patil", "the real name is never replaced by an alias");
  setAnonymous(u, false);
  u = get("SELECT * FROM users WHERE id=1");
  assert.equal(u.name, "Riya Patil");
  assert.equal(u.picture, "https://lh3.example/riya.jpg");
  assert.equal(u.anon, 0);
});

test("signing in never puts the real photo back while anonymous, and never replaces an uploaded photo", async () => {
  const { get, run } = await setup();
  const { setAnonymous, identiconUrl } = await import("../lib/identity");
  const { upsertUser } = await import("../lib/auth");
  const alias = setAnonymous(get("SELECT * FROM users WHERE id=1"), true)!;
  upsertUser({ sub: "google:1", name: "Riya Patil", picture: "https://lh3.example/riya-new.jpg" });
  let u = get("SELECT * FROM users WHERE id=1");
  assert.equal(u.picture, identiconUrl(alias), "everyone still sees the pattern");
  assert.equal(u.real_picture, "https://lh3.example/riya-new.jpg", "the kept real photo is refreshed");
  setAnonymous(u, false);
  run("UPDATE users SET photo_key='abcdefghijklmnopqrstuvwx', picture='/api/avatar/abcdefghijklmnopqrstuvwx' WHERE id=1");
  upsertUser({ sub: "google:1", name: "Riya Patil", picture: "https://lh3.example/riya-newer.jpg" });
  u = get("SELECT * FROM users WHERE id=1");
  assert.equal(u.picture, "/api/avatar/abcdefghijklmnopqrstuvwx", "an uploaded photo stays");
});
