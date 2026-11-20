/* Tests for the credit rules. Run with: npm test
   Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-test-")), "test.db");

async function setup() {
  const { run, now, TABLES } = await import("../lib/db");
  const { compute, shares, RULES } = await import("../lib/credit");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  let n = 0;
  const user = (verified = 1, monthsOld = 0) =>
    Number(run("INSERT INTO users (sub, name, verified, onboarded, created_at) VALUES (?,?,?,1,?)", `t:${++n}`, `User ${n}`, verified, now() - monthsOld * 30 * 86400).lastInsertRowid);
  const vouch = (from: number, to: number, at = now()) => run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", from, to, at);
  const project = (status: string, pot: number, team: number[], opts: { left?: number[]; shippedAt?: number } = {}) => {
    const pid = Number(run("INSERT INTO projects (name, pitch, status, lead_id, pot, created_at, shipped_at) VALUES ('P','p',?,?,?,?,?)",
      status, team[0], pot, now(), status === "shipped" ? opts.shippedAt ?? now() : null).lastInsertRowid);
    for (const u of team) run("INSERT INTO members (project_id, user_id) VALUES (?,?)", pid, u);
    for (const u of opts.left ?? []) run("INSERT INTO members (project_id, user_id, status, stake) VALUES (?,?,'left',?)", pid, u, RULES.stake);
    return pid;
  };
  const give = (pid: number, from: number, to: number, pct: number) =>
    run("INSERT INTO allocations (project_id, from_id, to_id, pct) VALUES (?,?,?,?)", pid, from, to, pct);
  return { run, now, compute, shares, RULES, user, project, give, vouch };
}

test("a verified student starts with starter credit, an unverified one with none", async () => {
  const { compute, user, RULES } = await setup();
  const a = user(1), b = user(0);
  const S = compute();
  assert.equal(S.get(a)!.credit, RULES.starter);
  assert.equal(S.get(b)!.credit, 0);
});

test("with no splits filled in, a shipped pot is shared equally", async () => {
  const { compute, user, project, RULES } = await setup();
  const [a, b, c] = [user(), user(), user()];
  project("shipped", 90, [a, b, c]);
  const S = compute();
  for (const u of [a, b, c]) assert.equal(S.get(u)!.credit, RULES.starter + 30);
});

test("your share is the middle of what teammates gave you, and you cannot set your own", async () => {
  const { shares } = await setup();
  // 1 tries to give itself everything by starving the others: that only changes what 2 and 3 receive from 1.
  const allocs = [
    { from_id: 1, to_id: 2, pct: 0 }, { from_id: 1, to_id: 3, pct: 100 },
    { from_id: 2, to_id: 1, pct: 50 }, { from_id: 2, to_id: 3, pct: 50 },
    { from_id: 3, to_id: 1, pct: 50 }, { from_id: 3, to_id: 2, pct: 50 },
  ];
  const sh = shares([1, 2, 3], allocs);
  assert.equal(Math.round(sh.get(1)! + sh.get(2)! + sh.get(3)!), 100);
  assert.equal(Math.round(sh.get(1)!), 33); // 50 and 50 from the others, out of 150 handed out
  assert.ok(sh.get(3)! > sh.get(2)!);
});

test("a solo project earns half the pot", async () => {
  const { compute, user, project, RULES } = await setup();
  const a = user();
  project("shipped", 100, [a]);
  assert.equal(compute().get(a)!.credit, RULES.starter + 100 * RULES.soloFactor);
});

test("leaving a project loses the stake, and dropping one costs the lead", async () => {
  const { compute, user, project, RULES } = await setup();
  const [lead, mate, quitter] = [user(), user(), user()];
  project("building", 0, [lead, mate], { left: [quitter] });
  project("dropped", 0, [lead, mate]);
  const S = compute();
  assert.equal(S.get(quitter)!.credit, RULES.starter - RULES.stake);
  assert.equal(S.get(quitter)!.left, 1);
  assert.equal(S.get(lead)!.credit, RULES.starter - RULES.stake);
  assert.equal(S.get(mate)!.credit, RULES.starter);
});

test("a vouch only counts between people who shipped together, and mutual vouches count half", async () => {
  const { run, now, compute, user, project, RULES } = await setup();
  const [a, b, stranger] = [user(), user(), user()];
  project("shipped", 100, [a, b]);
  const before = compute().get(a)!.credit;
  run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", stranger, a, now());
  assert.equal(compute().get(a)!.credit, before, "a stranger's vouch is worth nothing");
  run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", b, a, now());
  const oneWay = compute().get(a)!.credit - before;
  assert.ok(oneWay >= 1 && oneWay <= RULES.vouch);
  run("INSERT INTO vouches (from_id, to_id, created_at) VALUES (?,?,?)", a, b, now());
  assert.ok(compute().get(a)!.credit - before <= oneWay, "a mutual vouch is never worth more");
});

test("credit from an old project counts half", async () => {
  const { now, compute, user, project, RULES } = await setup();
  const [a, b] = [user(), user()];
  project("shipped", 100, [a, b], { shippedAt: now() - (RULES.fadeMonths + 1) * 30 * 86400 });
  assert.equal(compute().get(a)!.credit, RULES.starter + 25);
});

test("three shipped projects with the same two people is flagged as a closed circle", async () => {
  const { compute, user, project } = await setup();
  const [a, b, c] = [user(), user(), user()];
  for (let i = 0; i < 3; i++) project("shipped", 60, [a, b, c]);
  assert.equal(compute().get(a)!.circle, true);
});

test("the board's Fits you filter matches a role to the skills a person listed", async () => {
  const { fitFor } = await import("../lib/match");
  assert.deepEqual(fitFor("Search / ML", ["Python", "ML", "FastAPI"]), ["Python", "ML"]);
  assert.deepEqual(fitFor("React frontend", ["React", "Node", "Figma"]), ["React"]);
  assert.deepEqual(fitFor("RFID hardware", ["Flutter", "Firebase"]), []);
});

test("a college email only counts for the college that owns that domain", async () => {
  const { matchCollege, onDomain, isPublicMail, isAcademic, baseDomain } = await import("../lib/domains");
  const colleges = [{ id: 1, domains: "nirmauni.ac.in" }, { id: 2, domains: "iitb.ac.in,iitb.edu" }, { id: 3, domains: "cse.nirmauni.ac.in" }];
  assert.equal(matchCollege("nirmauni.ac.in", colleges)?.id, 1);
  assert.equal(matchCollege("students.nirmauni.ac.in", colleges)?.id, 1, "a subdomain belongs to its college");
  assert.equal(matchCollege("cse.nirmauni.ac.in", colleges)?.id, 3, "the most specific domain wins");
  assert.equal(matchCollege("fakenirmauni.ac.in", colleges), undefined, "a lookalike domain is not the college");
  assert.equal(matchCollege("nirmauni.ac.in.evil.com", colleges), undefined, "a domain that only starts the same is not the college");
  assert.equal(matchCollege("iitb.edu", colleges)?.id, 2);
  assert.ok(!onDomain("xnirmauni.ac.in", "nirmauni.ac.in"));
  assert.ok(isPublicMail("gmail.com") && isPublicMail("yahoo.co.in") && !isPublicMail("nirmauni.ac.in"));
  assert.ok(isAcademic("nirmauni.ac.in") && isAcademic("mit.edu") && isAcademic("unimelb.edu.au") && !isAcademic("somecollege.com"));
  assert.equal(baseDomain("students.mit.edu"), "mit.edu");
  assert.equal(baseDomain("mit.edu"), "mit.edu");
});

test("chat attachments are accepted by what the bytes are, not by their name", async () => {
  const { sniff, cleanName } = await import("../lib/files");
  const B = (s: string | number[]) => Buffer.from(s as never);
  assert.equal(sniff(B([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "a.png")?.mime, "image/jpeg", "a JPEG named .png is still a JPEG");
  assert.equal(sniff(B([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "x")?.kind, "image");
  assert.equal(sniff(B("%PDF-1.7 ..."), "notes.pdf")?.mime, "application/pdf");
  assert.equal(sniff(B("MZ\u0090 program"), "notes.pdf"), null, "a program renamed .pdf is refused");
  assert.equal(sniff(B('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), "a.svg"), null, "SVG can carry scripts");
  assert.equal(sniff(B("<html><script></script></html>"), "a.html"), null);
  assert.equal(sniff(B("<html><script></script></html>"), "a.txt")?.mime, "text/plain", "text is fine; it is served as plain text");
  assert.equal(sniff(B([0x50, 0x4b, 0x03, 0x04, 0]), "report.docx")?.ext, "docx");
  assert.equal(sniff(B([0x50, 0x4b, 0x03, 0x04, 0]), "archive.zip"), null, "other zip files are refused");
  assert.equal(cleanName("../../etc/passwd<script>.pdf", "pdf"), ".._.._etc_passwd_script_.pdf");
});

test("videos and voice notes are recognised by their bytes too", async () => {
  const { sniff, maxFor } = await import("../lib/files");
  const B = (s: string | number[]) => Buffer.from(s as never);
  const mp4 = Buffer.concat([B([0, 0, 0, 0x18]), B("ftypisom"), B([0, 0, 0, 0])]);
  const mov = Buffer.concat([B([0, 0, 0, 0x14]), B("ftypqt  "), B([0, 0, 0, 0])]);
  const webm = B([0x1a, 0x45, 0xdf, 0xa3, 0, 0]);
  assert.equal(sniff(mp4, "clip.mp4")?.mime, "video/mp4");
  assert.equal(sniff(mov, "IMG_0001.MOV")?.mime, "video/quicktime");
  assert.equal(sniff(webm, "x.webm")?.kind, "video");
  assert.equal(sniff(webm, "voice-note.webm", true)?.mime, "audio/webm", "a recording made in the chat is a voice note");
  assert.equal(sniff(mp4, "voice-note.m4a", true)?.kind, "voice");
  assert.equal(sniff(B("OggS\0"), "a.ogg")?.kind, "voice");
  assert.ok(maxFor("video") > maxFor("file") && maxFor("voice") < maxFor("file"));
});

test("call relays: credentials come from Cloudflare or Metered, and calls still work if they are down", async () => {
  const { iceServers, turnProvider } = await import("../lib/calls");
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  const reset = () => { delete (globalThis as { __ice?: unknown }).__ice; };
  try {
    // Cloudflare: short-lived credentials, port 53 dropped.
    Object.assign(process.env, { CLOUDFLARE_TURN_KEY_ID: "key", CLOUDFLARE_TURN_API_TOKEN: "token" });
    let calls = 0, sent: RequestInit | undefined;
    globalThis.fetch = (async (_u: string, init?: RequestInit) => { calls++; sent = init; return new Response(JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" }] }), { status: 201 }); }) as typeof fetch;
    reset();
    assert.equal(turnProvider(), "cloudflare");
    const cf = await iceServers();
    const relay = cf.find((s) => s.username === "u")!;
    assert.ok(([] as string[]).concat(relay.urls).includes("turns:turn.cloudflare.com:443?transport=tcp"));
    assert.ok(!([] as string[]).concat(relay.urls).some((u) => u.includes(":53")), "port 53 is left out");
    assert.equal((sent?.headers as Record<string, string>).Authorization, "Bearer token");
    await iceServers();
    assert.equal(calls, 1, "credentials are reused for an hour");

    // Provider down: STUN only, and it tries again next time.
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    reset();
    const down = await iceServers();
    assert.equal(down.length, 1, "falls back to STUN alone");
    assert.ok(!(globalThis as { __ice?: unknown }).__ice, "a failure is not cached");

    // Metered: only the relay entries are kept.
    delete process.env.CLOUDFLARE_TURN_KEY_ID; delete process.env.CLOUDFLARE_TURN_API_TOKEN;
    Object.assign(process.env, { METERED_DOMAIN: "https://demo.metered.live/", METERED_API_KEY: "k" });
    let url = "";
    globalThis.fetch = (async (u: string) => { url = u; return new Response(JSON.stringify([{ urls: "stun:stun.relay.metered.ca:80" }, { urls: "turn:global.relay.metered.ca:80", username: "m", credential: "p" }])); }) as typeof fetch;
    reset();
    const m = await iceServers();
    assert.equal(url, "https://demo.metered.live/api/v1/turn/credentials?apiKey=k");
    assert.deepEqual(m.slice(1).map((s) => s.urls), ["turn:global.relay.metered.ca:80"]);
  } finally {
    globalThis.fetch = realFetch;
    process.env = env;
    reset();
  }
});

test("the service worker rings for calls when Connect is closed and stays quiet when it is on screen", async () => {
  const vm = await import("node:vm");
  const src = fs.readFileSync(path.join(process.cwd(), "public/sw.js"), "utf8");
  type N = { title: string; tag: string; closed: boolean; requireInteraction?: boolean; actions?: unknown[]; data?: unknown; close(): void };
  const make = (visible: boolean | null) => {
    const L: Record<string, (e: unknown) => void> = {}, notes: N[] = [], opened: string[] = [], fetched: unknown[] = [];
    const self = {
      location: { origin: "https://c.app" }, addEventListener: (t: string, f: (e: unknown) => void) => (L[t] = f), skipWaiting() {},
      registration: {
        showNotification: async (title: string, o: object) => { notes.push({ title, ...o, closed: false, close() { this.closed = true; } } as N); },
        getNotifications: async ({ tag }: { tag: string }) => notes.filter((n) => n.tag === tag && !n.closed),
      },
      clients: {
        claim() {}, openWindow: async (u: string) => opened.push(u),
        matchAll: async () => (visible === null ? [] : [{ url: "https://c.app/", visibilityState: visible ? "visible" : "hidden", focus: async () => {}, navigate: async (u: string) => opened.push(u) }]),
      },
    };
    vm.runInContext(src, vm.createContext({ self, URL, JSON, fetch: async (_u: string, o: { body: string }) => fetched.push(JSON.parse(o.body)) }));
    const fire = async (t: string, ev: object) => { let p: unknown; L[t]({ ...ev, waitUntil: (x: unknown) => (p = x) }); await p; };
    return { notes, opened, fetched, push: (d: object) => fire("push", { data: { json: () => d } }), click: (n: N, action = "") => fire("notificationclick", { notification: n, action }) };
  };
  const call = { type: "call", id: 7, video: true, from: { id: 4, name: "Tanvi" } };
  let t = make(null);
  await t.push(call);
  assert.ok(t.notes[0].requireInteraction && t.notes[0].actions?.length === 2, "closed app: a call notification with Answer and Decline");
  await t.click(t.notes[0], "answer");
  assert.equal(t.opened[0], "/messages/4?answer=7");
  t = make(null); await t.push(call); await t.click(t.notes[0], "decline");
  assert.deepEqual(t.fetched[0], { action: "decline", id: 7 });
  t = make(null); await t.push(call); await t.push({ type: "call-end", id: 7, video: true, missed: true, from: call.from });
  assert.ok(t.notes[0].closed && t.notes[1].title === "Missed video call");
  t = make(true); await t.push(call); await t.push({ type: "msg", from: call.from, text: "hi" });
  assert.equal(t.notes.length, 0, "on screen: the page handles it");
  t = make(false); await t.push({ type: "msg", from: call.from, text: "hi" });
  assert.equal(t.notes[0].title, "Tanvi");
});

/* ---------- rating redesign: credibility, vouch limits, rings ---------- */

/* The credit rules exactly as they were before the redesign. Used to prove that nobody's credit moved. */
async function creditBefore(): Promise<Map<number, number>> {
  const { all, now } = await import("../lib/db");
  const { shares, RULES } = await import("../lib/credit");
  const sum = new Map<number, number[]>(), stats = new Map<number, number>();
  for (const u of all("SELECT id, verified, role FROM users")) sum.set(u.id, u.verified && u.role === "student" ? [RULES.starter] : []);
  const members = all("SELECT * FROM members"), allocs = all("SELECT * FROM allocations");
  const shippedWith = new Map<number, Set<number>>();
  for (const p of all("SELECT * FROM projects")) {
    const team = members.filter((m) => m.project_id === p.id);
    const active = team.filter((m) => m.status === "active").map((m) => m.user_id as number);
    for (const m of team) {
      const l = sum.get(m.user_id)!;
      if (m.status === "left") { if (m.stake) l.push(-m.stake); }
      else if (p.status === "dropped") { if (m.user_id === p.lead_id) l.push(-RULES.stake); }
      else if (p.status !== "shipped" && m.stake) l.push(-m.stake);
    }
    if (p.status !== "shipped") continue;
    const sh = shares(active, allocs.filter((a) => a.project_id === p.id));
    const faded = (p.shipped_at ?? 0) < now() - RULES.fadeMonths * 30 * 86400;
    for (const id of active) {
      sum.get(id)!.push(Math.round(p.pot * (sh.get(id)! / 100) * (active.length === 1 ? RULES.soloFactor : 1) * (faded ? 0.5 : 1)));
      if (!shippedWith.has(id)) shippedWith.set(id, new Set());
      for (const o of active) if (o !== id) shippedWith.get(id)!.add(o);
    }
  }
  for (const r of all("SELECT user_id FROM requests WHERE status='pending'")) sum.get(r.user_id)?.push(-RULES.stake);
  for (const [id, l] of sum) stats.set(id, Math.max(0, l.reduce((a, b) => a + b, 0)));
  const vouches = all("SELECT * FROM vouches"), pair = new Set(vouches.map((v) => `${v.from_id}>${v.to_id}`));
  for (const v of vouches) {
    if (!sum.has(v.to_id) || !sum.has(v.from_id) || !shippedWith.get(v.to_id)?.has(v.from_id)) continue;
    let n = RULES.vouch * Math.min(1, stats.get(v.from_id)! / RULES.fullWeightAt);
    if (pair.has(`${v.to_id}>${v.from_id}`)) n /= 2;
    sum.get(v.to_id)!.push(Math.max(1, Math.round(n)));
  }
  return new Map([...sum].map(([id, l]) => [id, Math.max(0, l.reduce((a, b) => a + b, 0))]));
}

test("carry-over: the sample college has exactly the credit it had before the redesign", async () => {
  await setup();
  await import("../scripts/seed");
  const { compute } = await import("../lib/credit");
  const before = await creditBefore(), after = compute();
  assert.ok(before.size >= 10);
  for (const [id, n] of before) assert.equal(after.get(id)!.credit, n, `user ${id}`);
  assert.ok([...before.values()].some((n) => n > 100), "the sample data has real credit in it");
});

test("a lone 95% split is pulled to the middle of what the others gave", async () => {
  const { shares } = await setup();
  const ids = [1, 2, 3, 4];
  const even = (from: number) => ids.filter((x) => x !== from).map((to) => ({ from_id: from, to_id: to, pct: to === ids.filter((x) => x !== from)[0] ? 34 : 33 }));
  // 2 is 1's friend and gives 1 almost everything; 3 and 4 split evenly.
  const allocs = [...even(1), { from_id: 2, to_id: 1, pct: 95 }, { from_id: 2, to_id: 3, pct: 3 }, { from_id: 2, to_id: 4, pct: 2 }, ...even(3), ...even(4)];
  const sh = shares(ids, allocs);
  assert.ok(sh.get(1)! < 30, `one generous friend cannot lift a share: got ${sh.get(1)}`);
});

test("credibility starts in the middle and moves with what a person does, never with what they type", async () => {
  const { run, compute, user, project } = await setup();
  const [a, b, c, quitter] = [user(), user(), user(), user()];
  const fresh = compute().get(a)!.cred.score;
  assert.equal(fresh, 53, "a new verified student starts in the middle");
  project("shipped", 100, [a, b, c], { left: [quitter] });
  const S = compute();
  assert.ok(S.get(a)!.cred.score > fresh, "finishing raises it");
  assert.ok(S.get(quitter)!.cred.score < fresh, "leaving lowers it");
  // Everything a person can type about themselves.
  const snap = () => { const s = compute().get(quitter)!; return [s.credit, s.earned, s.cred.score].join(); };
  const was = snap();
  run("UPDATE users SET skills='React, Rust, ML, PCB design', about='10x founder', github='https://github.com/torvalds', linkedin='https://linkedin.com/in/x', branch='CSE' WHERE id=?", quitter);
  for (let i = 0; i < 10; i++) run("INSERT INTO claims (user_id, text) VALUES (?,?)", quitter, "Won everything");
  run("UPDATE members SET did='Built all of it', role='Chief architect' WHERE user_id=?", quitter);
  assert.equal(snap(), was);
});

test("account age and an upheld report move credibility; a dismissed report does not", async () => {
  const { run, now, compute, user } = await setup();
  const [young, old, reported, cleared] = [user(), user(1, 12), user(1, 12), user(1, 12)];
  run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, created_at) VALUES (?,?,?,?,0,'upheld',?)", old, "user", reported, "x", now());
  run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, created_at) VALUES (?,?,?,?,0,'dismissed',?)", old, "user", cleared, "x", now());
  const S = compute(), RULES = (await import("../lib/rules")).RULES;
  assert.equal(S.get(old)!.cred.score - S.get(young)!.cred.score, 10);
  assert.equal(S.get(old)!.cred.score - S.get(reported)!.cred.score, RULES.cred.reportPenalty);
  assert.equal(S.get(cleared)!.cred.score, S.get(old)!.cred.score);
});

test("a vouch weighs as much as the voucher can be trusted, and only the five strongest count", async () => {
  const { run, now, compute, user, project, vouch, RULES } = await setup();
  const star = user(), mates = [1, 2, 3, 4, 5, 6, 7].map(() => user(1, 12));
  for (const m of mates) project("shipped", 60, [star, m]);
  const before = compute().get(star)!.credit;
  const flaky = mates[0];
  for (let i = 0; i < 4; i++) project("building", 0, [star], { left: [flaky] }); // flaky keeps leaving projects
  for (let i = 0; i < 2; i++) run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, created_at) VALUES (?,?,?,?,0,'upheld',?)", star, "user", flaky, "x", now());
  const S = compute();
  assert.ok(S.get(flaky)!.cred.score < S.get(mates[1])!.cred.score);
  vouch(flaky, star);
  const fromFlaky = compute().get(star)!.credit - before;
  for (const m of mates.slice(1)) vouch(m, star);
  const all = compute().get(star)!.ledger.filter((l) => l.what.startsWith("Vouch")).map((l) => l.n);
  assert.equal(all.length, RULES.vouchesCounted, "seven people vouched, five count");
  assert.ok(Math.min(...all) > fromFlaky, "the weakest vouch is the one left out");
  assert.ok(all.every((n) => n <= RULES.vouch));
});

test("a closed vouch ring is flagged and its vouches count a quarter", async () => {
  const { compute, user, project, vouch, RULES } = await setup();
  const ring = [user(1, 12), user(1, 12), user(1, 12)], open = [user(1, 12), user(1, 12), user(1, 12)], outsider = user(1, 12);
  for (let i = 0; i < RULES.ringMinProjects; i++) { project("shipped", 100, ring); project("shipped", 100, open); }
  project("shipped", 60, [open[0], outsider]); // one of the open group has shipped with someone else
  for (const g of [ring, open]) for (const a of g) for (const b of g) if (a !== b) vouch(a, b);
  const S = compute();
  const vouchCredit = (id: number) => S.get(id)!.ledger.filter((l) => l.what.startsWith("Vouch")).reduce((a, l) => a + l.n, 0);
  for (const id of ring) assert.equal(S.get(id)!.ring, true);
  for (const id of open) assert.equal(S.get(id)!.ring, false);
  assert.ok(vouchCredit(ring[1]) < vouchCredit(open[1]), `ring ${vouchCredit(ring[1])} vs open ${vouchCredit(open[1])}`);
  assert.ok(S.get(ring[1])!.cred.score < S.get(open[1])!.cred.score);
});

test("reviews that match the outcome earn a little and build credibility; ones that miss lose it", async () => {
  const { run, now, compute, user, RULES } = await setup();
  const [good, bad] = [user(), user()];
  const base = compute().get(good)!.cred.score;
  for (let i = 0; i < 8; i++) {
    run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at) VALUES (?,?,?,?,?)", 100 + i, good, 60, 60, now());
    run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at) VALUES (?,?,?,?,?)", 100 + i, bad, 100, 60, now());
  }
  const S = compute();
  assert.equal(S.get(good)!.earned, RULES.starter + RULES.reviewRewardCap, "capped per 30 days");
  assert.equal(S.get(bad)!.earned, RULES.starter);
  assert.ok(S.get(good)!.cred.score > base && S.get(bad)!.cred.score < base);
});

test("a held stake lowers what you can spend, not what you have earned", async () => {
  const { run, compute, user, project, RULES } = await setup();
  const [lead, joiner] = [user(), user()];
  const pid = project("building", 0, [lead]);
  run("INSERT INTO members (project_id, user_id, stake) VALUES (?,?,?)", pid, joiner, RULES.stake);
  const s = compute().get(joiner)!;
  assert.equal(s.credit, RULES.starter - RULES.stake);
  assert.equal(s.earned, RULES.starter);
});

/* ---------- rating redesign: competency per skill ---------- */

async function skillKit() {
  const k = await setup();
  const { competency, rate, canon, parseSkills } = await import("../lib/skills");
  const tick = (pid: number, to: number, skill: string, by: number) => k.run("INSERT OR IGNORE INTO member_skills (project_id, user_id, skill, by_id) VALUES (?,?,?,?)", pid, to, skill, by);
  /* A shipped team project where every teammate ticks `skill` for every other. */
  const shipWith = (team: number[], skill: string, pot = 100, shippedAt?: number) => {
    const pid = k.project("shipped", pot, team, { shippedAt });
    for (const a of team) for (const b of team) if (a !== b) tick(pid, a, skill, b);
    return pid;
  };
  const skill = (id: number, name: string) => competency(k.compute()).get(id)?.get(name);
  return { ...k, competency, rate, canon, parseSkills, tick, shipWith, skill };
}

test("skill names: different spellings are one skill", async () => {
  const { canon, parseSkills } = await skillKit();
  assert.equal(canon(" NextJS "), "next.js");
  assert.equal(canon("React.js"), canon("react"));
  assert.deepEqual(parseSkills("React, react.js, Node,  , PCB"), ["react", "node", "pcb design"]);
});

test("the skill formula starts at the prior and needs weight to move", async () => {
  const { rate, RULES } = await skillKit();
  const K = (await import("../lib/rules")).RULES.skill;
  assert.equal(rate([]).score, K.prior);
  assert.equal(rate([]).conf, 0);
  const one = rate([{ q: 1, w: 1 }]);
  assert.ok(Math.abs(one.score - (100 * (K.k * 0.3 + 1)) / (K.k + 1)) < 1e-9);
  assert.ok(rate([{ q: 1, w: 0.2 }]).score < one.score, "less trusted evidence moves the score less");
  assert.ok(rate([{ q: 0.1, w: 3 }]).score < K.prior, "poor work lowers a score");
  assert.ok(RULES.live > RULES.demo);
});

test("typing a skill gives no score; teammates confirming it does", async () => {
  const { run, user, project, tick, skill, competency, compute } = await skillKit();
  const [a, b, c] = [user(1, 12), user(1, 12), user(1, 12)];
  const pid = project("shipped", 100, [a, b, c]);
  run("INSERT INTO project_skills (project_id, skill) VALUES (?, 'react')", pid);
  run("UPDATE users SET skills='React, Rust, ML' WHERE id=?", a);
  assert.equal(competency(compute()).get(a), undefined, "a listed skill and a project skill list are worth nothing");
  tick(pid, a, "react", a);
  assert.equal(skill(a, "react"), undefined, "ticking your own skill does nothing");
  tick(pid, a, "react", b);
  const s = skill(a, "react")!;
  assert.ok(s.score > 30 && s.why === "based on 1 shipped project");
  assert.equal(skill(a, "rust"), undefined);
});

test("a skill needs half the teammates, and outsiders cannot tick it", async () => {
  const { user, project, tick, skill } = await skillKit();
  const team = [user(), user(), user(), user(), user()], outsider = user();
  const pid = project("shipped", 100, team);
  tick(pid, team[0], "react", team[1]);
  tick(pid, team[0], "react", outsider);
  assert.equal(skill(team[0], "react"), undefined, "one of four teammates is not half");
  tick(pid, team[0], "react", team[2]);
  assert.ok(skill(team[0], "react"));
});

test("one project cannot make an expert; more projects raise the score and the confidence", async () => {
  const { user, shipWith, skill } = await skillKit();
  const [a, b, c] = [user(1, 12), user(1, 12), user(1, 12)];
  shipWith([a, b, c], "react");
  const one = skill(a, "react")!;
  assert.ok(one.score < 50, `one project gave ${one.score}`);
  assert.equal(one.band, "low");
  shipWith([a, b, c], "react"); shipWith([a, b, c], "react"); shipWith([a, b, c], "react");
  const four = skill(a, "react")!;
  assert.ok(four.score > one.score && four.conf > one.conf);
  assert.ok(four.score < 90, "even four live projects do not reach the top");
  assert.equal(four.why, "based on 4 shipped projects");
});

test("old work counts half after 18 months, demo work counts less than live, and a bigger share counts more", async () => {
  const { now, user, shipWith, skill, give, RULES } = await skillKit();
  const K = (await import("../lib/rules")).RULES.skill;
  const [a, b, c, d] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  shipWith([a, b], "react");
  shipWith([a, b], "node", 100, now() - K.halfLifeMonths * 30 * 86400);
  shipWith([a, b], "figma", RULES.demo);
  assert.ok(Math.abs(skill(a, "node")!.items[0].w / skill(a, "react")!.items[0].w - 0.5) < 0.01);
  assert.ok(skill(a, "figma")!.score < skill(a, "react")!.score);
  const pid = shipWith([b, c, d], "python");
  give(pid, b, c, 80); give(pid, b, d, 20); give(pid, d, c, 80); give(pid, d, b, 20); give(pid, c, b, 50); give(pid, c, d, 50);
  assert.ok(skill(c, "python")!.score > skill(d, "python")!.score, "the person teammates say did most scores higher");
});

test("a skill signed by people who cannot be trusted counts for less", async () => {
  const { run, now, user, shipWith, project, skill } = await skillKit();
  const [a, good, b, shady] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  for (let i = 0; i < 3; i++) run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, created_at) VALUES (?,?,?,?,0,'upheld',?)", a, "user", shady, "x", now());
  for (let i = 0; i < 4; i++) project("building", 0, [a], { left: [shady] });
  shipWith([a, good], "react");
  shipWith([b, shady], "react");
  assert.ok(skill(b, "react")!.score < skill(a, "react")!.score);
});

test("a solo project's skills count only when a reviewer or admin ticks them, and at half weight", async () => {
  const { run, now, user, project, tick, skill, shipWith } = await skillKit();
  const [solo, reviewer, friend, mate] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  const pid = project("shipped", 100, [solo]);
  tick(pid, solo, "rust", friend);
  assert.equal(skill(solo, "rust"), undefined, "a friend who did not review it cannot sign");
  run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at) VALUES (?,?,100,100,?)", pid, reviewer, now());
  tick(pid, solo, "rust", reviewer);
  shipWith([mate, friend], "rust");
  assert.ok(skill(solo, "rust")!.score < skill(mate, "rust")!.score);
  assert.equal(skill(solo, "rust")!.why, "based on 1 solo project");
});

/* ---------- rating redesign: evidence tiers, reviewers, live links, split flags ---------- */

test("outside evidence counts only once verified, and for less than work Connect saw happen", async () => {
  const { run, now, user, shipWith, skill, compute } = await skillKit();
  const [a, b, c, admin] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  run("UPDATE users SET admin=1 WHERE id=?", admin);
  const ev = (who: number, status: string, kind = "hackathon", value = "won", skills = "python") =>
    Number(run("INSERT INTO evidence (user_id, kind, title, skills, value, status, method, decided_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)", who, kind, "Hack", skills, value, status, "admin", admin, now()).lastInsertRowid);
  const cred = (id: number) => compute().get(id)!.cred.score, base = cred(a);
  ev(a, "pending");
  assert.equal(skill(a, "python"), undefined, "waiting items count for nothing");
  assert.equal(cred(a), base);
  ev(a, "verified");
  const tierB = skill(a, "python")!;
  assert.equal(tierB.why, "based on 1 hackathon");
  assert.ok(cred(a) > base, "evidence that checked out builds credibility");
  // The same skill from a live shipped project, signed by teammates, moves the score more.
  const d = user(1, 12);
  shipWith([b, c, d], "python");
  assert.ok(skill(b, "python")!.score > tierB.score && skill(b, "python")!.conf > tierB.conf);
  ev(c, "rejected", "internship", "", "rust");
  assert.equal(skill(c, "rust"), undefined);
  assert.ok(cred(c) < cred(b), "a rejected item costs credibility");
  // Marks are not evidence of any kind.
  ev(a, "verified", "cgpa", "9.8", "data structures");
  assert.equal(skill(a, "data structures"), undefined, "a CGPA row is ignored even if one were stored");
});

test("reviewers come from outside the team's network, and trusted people are picked more often", async () => {
  const { all } = await import("../lib/db");
  const { user, project, compute } = await setup();
  const { eligibleReviewers, teamTies, pickWeighted } = await import("../lib/reviewers");
  const [lead, mate, friend, poor, far1, far2, helper] = [user(), user(), user(), user(), user(), user(), user()];
  project("shipped", 100, [lead, friend]);   // friend has shipped with the lead
  project("shipped", 100, [far1, far2]);     // far1 and far2 have credit and no tie to the team
  project("shipped", 100, [friend, helper]); // so friend has enough credit, and so does helper
  const pid = project("review", 0, [lead, mate]);
  const S = compute();
  const team = all("SELECT user_id FROM members WHERE project_id=?", pid).map((r) => r.user_id);
  const ok = eligibleReviewers(all("SELECT * FROM users"), team, teamTies(all("SELECT project_id, user_id FROM members")), S).sort();
  assert.deepEqual(ok, [far1, far2, helper].sort(), "not the team, not their past teammates, not people without credit");
  assert.ok(!ok.includes(friend) && !ok.includes(poor));
  // With a fixed "random" number the heavier person is taken first; nobody is picked twice.
  assert.deepEqual(pickWeighted([1, 2, 3], (id) => (id === 3 ? 10 : 0.1), 2, () => 0.5)[0], 3);
  assert.equal(new Set(pickWeighted([1, 2, 3, 4, 5], () => 1, 4)).size, 4);
  assert.equal(pickWeighted([1, 2], () => 1, 4).length, 2);
});

test("two matching reviews decide; a disagreement waits for a third and the middle verdict wins; an admin settles it", async () => {
  await setup();
  const { verdictOf } = await import("../lib/reviewers");
  assert.equal(verdictOf([{ verdict: 100 }]), null);
  assert.equal(verdictOf([{ verdict: 100 }, { verdict: 100 }]), 100);
  assert.equal(verdictOf([{ verdict: 100 }, { verdict: 60 }]), null);
  assert.equal(verdictOf([{ verdict: 100 }, { verdict: 60 }, { verdict: 60 }]), 60);
  assert.equal(verdictOf([{ verdict: 100 }, { verdict: 0 }, { verdict: 60 }]), 60, "one harsh and one soft reviewer are both outvoted");
  assert.equal(verdictOf([{ verdict: 100 }, { verdict: 100 }, { verdict: 0, admin: 1 }]), 0);
  assert.equal(verdictOf([{ verdict: 60, admin: 1 }]), 60);
});

test("the live check only ever opens public https links", async () => {
  const { isPublicAddress, liveUrl, checkLive } = await import("../lib/live");
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "not-an-ip"])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) assert.equal(isPublicAddress(ip), true, ip);
  for (const u of ["http://example.com", "https://localhost/x", "https://127.0.0.1/", "https://[::1]/", "https://user:pw@example.com", "https://example.com:8443/", "https://intranet", "ftp://example.com", "https://db.internal/"])
    assert.equal(liveUrl(u), null, u);
  assert.ok(liveUrl("https://busping.example.com/map"));
  assert.equal((await checkLive("https://127.0.0.1/admin")).ok, false);
});

test("a big share with nothing on the record is flagged for an admin, and changes no numbers", async () => {
  const { run, now, user, project, give, compute } = await setup();
  const { splitFlags } = await import("../lib/reviewers");
  const [a, b, c, d] = [user(), user(), user(), user()];
  const pid = project("shipped", 100, [a, b, c, d]);
  run("UPDATE projects SET college_id=1 WHERE id=?", pid);
  run("UPDATE members SET did='Did things' WHERE project_id=? AND user_id<>?", pid, d);
  for (const u of [a, b, c]) run("INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?,?,'event','Milestone done: x',?)", pid, u, now());
  // a, b and c all hand most of their split to d, who did nothing anyone can see.
  for (const from of [a, b, c]) for (const to of [a, b, c, d]) if (to !== from) give(pid, from, to, to === d ? 80 : 10);
  give(pid, d, a, 34); give(pid, d, b, 33); give(pid, d, c, 33);
  const before = compute().get(d)!.credit;
  const flags = splitFlags(1);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].user_id, d);
  assert.equal(compute().get(d)!.credit, before);
  run("UPDATE members SET did='Built the backend' WHERE project_id=? AND user_id=?", pid, d);
  run("INSERT INTO updates (project_id, user_id, kind, text, created_at) VALUES (?,?,'post','Shipped the API',?)", pid, d, now());
  assert.equal(splitFlags(1).length, 0, "the flag clears once the record shows their work");
});

/* ---------- rating redesign: relevance for a role ---------- */

test("relevance: confirmed skills rank people, listed skills never do, and every suggestion explains itself", async () => {
  const { run, user, shipWith, project, compute, competency } = await skillKit();
  const { rank, needsFor, needsFromList, fit, availability } = await import("../lib/relevance");
  const [pro, mate, once, mate2, lister, quitter, mate3, busy, mate4] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => user(1, 12));
  for (let i = 0; i < 3; i++) shipWith([pro, mate], "react");
  shipWith([once, mate2], "react");
  run("UPDATE users SET skills='React, Next.js, TypeScript, Node, GraphQL' WHERE id=?", lister);
  shipWith([quitter, mate3], "react"); shipWith([quitter, mate3], "react"); shipWith([quitter, mate3], "react");
  for (let i = 0; i < 4; i++) project("building", 0, [mate3], { left: [quitter] });
  for (let i = 0; i < 3; i++) shipWith([busy, mate4], "react");
  for (let i = 0; i < 5; i++) project("building", 0, [busy]);
  const S = compute(), K = competency(S);
  const person = (id: number, extra = {}) => {
    const st = S.get(id)!;
    return { id, skills: K.get(id), listed: id === lister ? ["React", "Next.js", "TypeScript", "Node", "GraphQL"] : [], finishRate: st.cred.finishRate,
      finished: st.shipped, ended: st.shipped + st.left, open: true, load: st.building, ...extra };
  };
  const people = [lister, quitter, once, busy, pro].map((id) => person(id));
  const needs = needsFor("React frontend", needsFromList(["React", "Node"]));
  const { ranked, fresh } = rank(needs, "React frontend", people);
  assert.equal(ranked[0].id, pro, "three confirmed projects and a clean record come first");
  assert.ok(ranked.findIndex((x) => x.id === once) > 0);
  assert.ok(!ranked.some((x) => x.id === lister), "someone who only listed five skills is not ranked at all");
  assert.deepEqual(fresh.map((x) => x.id), [lister], "they are shown apart, as new with no proof");
  const at = (id: number) => ranked.find((x) => x.id === id)!.score;
  assert.ok(at(quitter) < at(pro), "leaving projects lowers fit");
  assert.ok(at(busy) < at(pro), "someone on five projects ranks lower than the same record with free time");
  for (const f of ranked) assert.match(f.reason, /^Fits: React \d+, from \d shipped projects?.* · finished \d+ of \d+ joined/);
  // The small parts of the formula.
  assert.equal(availability(true, 2), 1);
  assert.ok(availability(true, 3) < 1 && availability(false, 0) < 1 && availability(true, 50) > 0);
  const plain = fit(needs, person(pro))!, known = fit(needs, person(pro, { shippedWith: "with Riya before" }))!;
  assert.ok(known.score > plain.score && known.reason.includes("shipped with Riya before"));
  // A role with no listed skills falls back to its title.
  const guessed = rank(needsFor("React frontend", []), "React frontend", people);
  assert.equal(guessed.ranked[0].id, pro);
  assert.deepEqual(guessed.fresh.map((x) => x.id), [lister]);
});

test("the Fits you filter uses a role's listed skills when it has them", async () => {
  const { fitsMe, needsFor, needsFromList } = await import("../lib/relevance");
  assert.deepEqual(fitsMe(needsFor("Wizard", needsFromList(["NextJS", "Figma"])), "Wizard", ["Next.js", "Python"]), ["Next.js"]);
  assert.deepEqual(fitsMe(needsFor("React frontend", []), "React frontend", ["React", "Python"]), ["React"]);
});

/* ---------- rating redesign: commissions and gifts ---------- */

async function commKit() {
  const k = await skillKit();
  const comm = (client: number, doer: number | null, o: { status?: string; reward?: number; rating?: number; minted?: number; skills?: string[]; closedAt?: number } = {}) => {
    const status = o.status ?? "done", reward = o.reward ?? 20;
    const id = Number(k.run(
      "INSERT INTO commissions (college_id, client_id, title, brief, deadline, reward, minted, status, doer_id, rating, paid_credit, created_at, closed_at) VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?)",
      client, "Job", "brief", k.now() + 86400, reward, o.minted ?? 0, status, doer, o.rating ?? null, status === "done" ? reward : null, k.now(), status === "done" ? o.closedAt ?? k.now() : null).lastInsertRowid);
    for (const sk of o.skills ?? []) k.run("INSERT INTO commission_skills (commission_id, skill, importance) VALUES (?,?,2)", id, sk);
    return id;
  };
  return { ...k, comm };
}

test("a commission's reward is set aside from the client's free credit, paid to the doer on sign-off, and returned on cancel", async () => {
  const { run, user, project, compute, comm, RULES } = await commKit();
  const [client, mate, doer] = [user(1, 12), user(1, 12), user(1, 12)];
  project("shipped", 100, [client, mate]);
  const start = compute().get(client)!;
  const id = comm(client, null, { status: "open", reward: 20 });
  let S = compute();
  assert.equal(S.get(client)!.credit, start.credit - 20, "set aside while open");
  assert.equal(S.get(client)!.earned, start.earned, "spending never lowers what was earned");
  run("UPDATE commissions SET status='done', doer_id=?, paid_credit=20, rating=4, closed_at=? WHERE id=?", doer, Date.now() / 1000 | 0, id);
  S = compute();
  assert.equal(S.get(client)!.credit, start.credit - 20);
  assert.equal(S.get(doer)!.earned, RULES.starter + 20, "the doer earns it");
  run("UPDATE commissions SET status='cancelled', doer_id=NULL, paid_credit=NULL WHERE id=?", id);
  assert.equal(compute().get(client)!.credit, start.credit, "a cancelled commission gives the reward back");
});

test("the same two people can only pass so much credit through commissions", async () => {
  const { now } = await commKit();
  const { pairBlock, pairUse } = await import("../lib/commissions");
  const { RULES, MONTH } = await import("../lib/rules");
  const C = RULES.comm, t = now();
  const row = (client: number, doer: number, status: string, reward: number, closed = t) => ({ client_id: client, doer_id: doer, status, reward, paid_credit: status === "done" ? reward : null, closed_at: closed, created_at: closed });
  assert.equal(pairBlock([], 1, 2, 20, t), null);
  const two = [row(1, 2, "done", 20), row(2, 1, "done", 20)];
  assert.deepEqual(pairUse(two, 1, 2, t), { count: 2, credit: 40 }, "both directions count");
  assert.match(pairBlock(two, 1, 2, 5, t)!, /already done 2/);
  assert.equal(pairBlock(two, 1, 3, 5, t), null, "a different person is fine");
  assert.match(pairBlock([row(1, 2, "done", 50)], 2, 1, 20, t)!, new RegExp(`At most ${C.pairMaxCredit}`));
  assert.match(pairBlock([row(1, 2, "assigned", 20), row(1, 2, "delivered", 20)], 1, 2, 5, t)!, /already/, "running ones count, so you cannot start several at once");
  const old = t - (C.pairWindowMonths + 1) * MONTH;
  assert.equal(pairBlock([row(1, 2, "done", 30, old), row(1, 2, "done", 30, old)], 1, 2, 20, t), null, "the window moves on");
  assert.equal(pairBlock([row(1, 2, "cancelled", 30), row(1, 2, "refunded", 30)], 1, 2, 20, t), null);
});

test("an alum's commissions award credit from a monthly allowance", async () => {
  const { now } = await commKit();
  const { alumUsed } = await import("../lib/commissions");
  const t = now(), r = (status: string, reward: number, minted = 1) => ({ client_id: 9, doer_id: 2, status, reward, paid_credit: status === "done" ? reward : null, minted, created_at: t });
  assert.equal(alumUsed([r("open", 20), r("done", 15), r("cancelled", 30), r("open", 10, 0)], 9, t), 35);
});

test("a signed-off commission counts towards the doer's skills, weighted by the client's credibility", async () => {
  const { run, now, user, comm, skill } = await commKit();
  const [good, shady, a, b] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  for (let i = 0; i < 3; i++) run("INSERT INTO reports (by_id, kind, target_id, reason, open, result, created_at) VALUES (?,?,?,?,0,'upheld',?)", good, "user", shady, "x", now());
  comm(good, a, { rating: 5, skills: ["figma"] });
  comm(shady, b, { rating: 5, skills: ["figma"] });
  comm(good, b, { status: "assigned", rating: 5, skills: ["react"] });
  assert.equal(skill(a, "figma")!.why, "based on 1 commission");
  assert.ok(skill(b, "figma")!.score < skill(a, "figma")!.score);
  assert.equal(skill(b, "react"), undefined, "work in progress counts for nothing");
  comm(good, b, { rating: 1, skills: ["css"] });
  assert.ok(skill(b, "css")!.score < 30, "a poor rating lowers the skill");
});

test("gifts move free credit only, inside their limits", async () => {
  const { run, now, user, project, compute, RULES } = await commKit();
  const { giftBlock } = await import("../lib/commissions");
  const G = RULES.gift, t = now();
  const [rich, mate, friend, fresh] = [user(1, 12), user(1, 12), user(1, 12), user(1, 0)];
  project("shipped", 100, [rich, mate]);
  const before = compute();
  run("INSERT INTO gifts (from_id, to_id, amount, created_at) VALUES (?,?,?,?)", rich, friend, 15, t);
  const S = compute();
  assert.equal(S.get(friend)!.credit, before.get(friend)!.credit + 15);
  assert.equal(S.get(friend)!.earned, before.get(friend)!.earned, "a gift is not earned");
  assert.equal(S.get(friend)!.cred.score, before.get(friend)!.cred.score);
  assert.equal(S.get(rich)!.earned, before.get(rich)!.earned);
  assert.equal(S.get(rich)!.credit, before.get(rich)!.credit - 15);
  const p = (id: number, earned = 100, credit = 100, created = t - 365 * 86400) => ({ id, earned, credit, created_at: created });
  const g = (from: number, to: number, amount: number) => ({ from_id: from, to_id: to, amount, created_at: t });
  assert.equal(giftBlock([], p(1), p(2), 10, t), null);
  assert.match(giftBlock([], p(1, G.minSenderCredit - 1), p(2), 5, t)!, /earned credit/);
  assert.match(giftBlock([], p(1), p(2, 0, 0, t), 5, t)!, /days old/, "new accounts cannot be used as mules");
  assert.match(giftBlock([], p(1, 100, 4), p(2), 5, t)!, /free credit/);
  assert.match(giftBlock([g(2, 1, 15)], p(1), p(2), 10, t)!, /same two people/, "both directions count");
  assert.match(giftBlock([g(1, 3, 20), g(1, 4, 15)], p(1), p(2), 10, t)!, /You can send/);
  assert.match(giftBlock([g(3, 2, 20), g(4, 2, 15)], p(1), p(2), 10, t)!, /They can receive/);
  assert.match(giftBlock([], p(1), p(1), 5, t)!, /yourself/);
  assert.equal(giftBlock([{ ...g(1, 2, 20), created_at: t - (G.windowDays + 1) * 86400 }], p(1), p(2), 15, t), null);
  void fresh;
});

test("the rules page states every rule from the same numbers the code uses", async () => {
  const { SECTIONS } = await import("../app/rule-list");
  const { RULES } = await import("../lib/rules");
  const text = SECTIONS.flatMap((s) => [s.intro, ...s.rules.flat()]).join(" ");
  for (const n of [RULES.starter, RULES.stake, RULES.live, RULES.demo, RULES.reviewerMin, RULES.vouchesCounted, RULES.comm.pairMaxCount, RULES.comm.pairMaxCredit,
    RULES.comm.minClientCredit, RULES.comm.reviewerAbove, RULES.gift.pairMax, RULES.skill.prior, RULES.skill.halfLifeMonths, RULES.cred.reportPenalty])
    assert.ok(new RegExp(`\\b${n}\\b`).test(text), `${n} is explained`);
  assert.ok(!/undefined|NaN/.test(text));
  assert.match(text, /coursework/);
  assert.match(text, /CGPA, grades and exam results are not part of any score/);
});

test("the sample-person sign-in only switches on for a test copy, never the real site", async () => {
  const { demoAllowed } = await import("../lib/auth");
  assert.equal(demoAllowed("1", "https://connect-staging-e918ea27.up.railway.app"), true);
  assert.equal(demoAllowed("1", "https://demo.connect.example"), true);
  assert.equal(demoAllowed("1", "http://localhost:3000"), true);
  assert.equal(demoAllowed("1", "http://test.localhost:3000"), true);
  // The real site stays closed even if the switch is set by mistake.
  assert.equal(demoAllowed("1", "https://connect-production-77ec4d79.up.railway.app"), false);
  assert.equal(demoAllowed("1", "https://demographics.example"), false);
  assert.equal(demoAllowed("1", "https://localhost.evil.example"), false);
  assert.equal(demoAllowed("1", "not a url"), false);
  // And a test address alone is not enough without the switch.
  assert.equal(demoAllowed(undefined, "https://connect-staging-e918ea27.up.railway.app"), false);
  assert.equal(demoAllowed("true", "https://connect-staging-e918ea27.up.railway.app"), false);
});

test("following a project brings its main moments to the inbox, never to its own team or the author", async () => {
  const { run, now, user, project } = await setup();
  const { logUpdate } = await import("../lib/notify");
  const { get } = await import("../lib/db");
  const lead = user(), mate = user(), fan = user();
  const pid = project("building", 0, [lead, mate]);
  run("INSERT INTO follows (project_id, user_id, created_at) VALUES (?,?,?)", pid, fan, now());
  run("INSERT INTO follows (project_id, user_id, created_at) VALUES (?,?,?)", pid, mate, now()); // a teammate who also follows
  const notes = (u: number) => get("SELECT COUNT(*) n FROM notifications WHERE user_id=?", u).n as number;
  logUpdate(pid, lead, "Two benches are live", "post");
  logUpdate(pid, lead, "Milestone done: Booking flow");
  logUpdate(pid, lead, "Renamed from Old name"); // not worth an alert
  assert.equal(notes(fan), 2);
  assert.equal(notes(mate), 0);
  assert.equal(notes(lead), 0);
  // A hidden project tells no one.
  run("UPDATE projects SET hidden=1 WHERE id=?", pid);
  logUpdate(pid, lead, "Shipped with a pot of 100");
  assert.equal(notes(fan), 2);
});

test("feedback reaches the site admins, and their answer reaches the sender", async () => {
  const { run, user } = await setup();
  const { addFeedback, answerFeedback, cleanPage } = await import("../lib/feedback");
  const { get } = await import("../lib/db");
  const sender = user(), boss = user(), other = user();
  run("UPDATE users SET super=1 WHERE id=?", boss);
  const notes = (u: number) => get("SELECT COUNT(*) n FROM notifications WHERE user_id=?", u).n as number;
  const id = addFeedback({ id: sender, college_id: null }, "bug", "The board does not load on my phone.", "/projects/3?tab=team");
  const f = get("SELECT * FROM feedback WHERE id=?", id);
  assert.equal(f.kind, "bug");
  assert.equal(f.status, "new");
  assert.equal(f.page, "/projects/3"); // the query string is dropped
  assert.equal(notes(boss), 1);
  assert.equal(notes(other), 0);
  // An unknown kind is filed as "other", and an outside address is never kept as the page.
  assert.equal(get("SELECT kind FROM feedback WHERE id=?", addFeedback({ id: sender }, "nonsense", "Just saying hello there.")).kind, "other");
  assert.equal(cleanPage("https://evil.example/x"), "");
  assert.equal(cleanPage("//evil.example"), "");
  // Answering tells the sender once; saving the same thing again tells nobody.
  assert.equal(answerFeedback({ id: boss }, id, "planned", "Thanks, we are fixing it this week."), null);
  assert.equal(notes(sender), 1);
  answerFeedback({ id: boss }, id, "planned", "Thanks, we are fixing it this week.");
  assert.equal(notes(sender), 1);
  answerFeedback({ id: boss }, id, "done", "Thanks, we are fixing it this week.");
  assert.equal(notes(sender), 2);
  assert.equal(get("SELECT status FROM feedback WHERE id=?", id).status, "done");
  assert.equal(answerFeedback({ id: boss }, 99999, "done", ""), "That feedback is gone.");
});

test("settings: quiet following, and chats only from people you have built with", async () => {
  const { run, now, user, project } = await setup();
  const { logUpdate } = await import("../lib/notify");
  const { canMessage } = await import("../lib/chat");
  const { get } = await import("../lib/db");
  const cid = Number(run("INSERT INTO colleges (slug, name, domains, created_at) VALUES ('s','S','s.example',?)", now()).lastInsertRowid);
  const lead = user(), mate = user(), fan = user(), stranger = user();
  run("UPDATE users SET college_id=?", cid);
  const me = (id: number) => get("SELECT * FROM users WHERE id=?", id);
  const pid = project("building", 0, [lead, mate]);
  // Following quietly: still a follower, but nothing lands in the inbox.
  run("INSERT INTO follows (project_id, user_id, created_at) VALUES (?,?,?)", pid, fan, now());
  run("UPDATE users SET follow_notes=0 WHERE id=?", fan);
  logUpdate(pid, lead, "Milestone done: Booking flow");
  assert.equal(get("SELECT COUNT(*) n FROM notifications WHERE user_id=?", fan).n, 0);
  // By default anyone verified at the college can write.
  assert.ok("them" in canMessage(me(stranger), lead));
  run("UPDATE users SET dm_from='team' WHERE id=?", lead);
  assert.ok("error" in canMessage(me(stranger), lead));
  assert.ok("them" in canMessage(me(mate), lead)); // a teammate still can
  // And once the lead writes first, the stranger can reply.
  run("INSERT INTO messages (from_id, to_id, text, created_at) VALUES (?,?,?,?)", lead, stranger, "Hi", now());
  assert.ok("them" in canMessage(me(stranger), lead));
});

test("signing out everywhere makes older sign-in cookies stop working", async () => {
  await setup();
  const { sessionToken, tokenOk } = await import("../lib/auth");
  const old = sessionToken(7); // made before the counter existed
  assert.ok(tokenOk(old, 7, 0));
  assert.equal(tokenOk(old, 7, 1), false); // the counter went up: the old cookie is dead
  assert.ok(tokenOk(sessionToken(7, 1), 7, 1));
  assert.equal(tokenOk(sessionToken(7, 1), 7, 2), false);
  assert.equal(tokenOk(sessionToken(8), 7, 0), false); // someone else's cookie
  assert.equal(tokenOk("7.", 7, 0), false);
  assert.equal(tokenOk("7", 7, 0), false);
});

test("a new sign-in is noted and, after the first, announced in the inbox with the device", async () => {
  const { user } = await setup();
  const { recordLogin } = await import("../lib/auth");
  const { deviceName, notify } = await import("../lib/notify");
  const { get } = await import("../lib/db");
  assert.equal(deviceName("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"), "Chrome on Windows");
  assert.equal(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "Safari on iPhone or iPad");
  assert.equal(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0"), "Edge on Mac");
  assert.equal(deviceName(""), "an unknown device");
  const u = user();
  const notes = () => get("SELECT COUNT(*) n FROM notifications WHERE user_id=?", u).n as number;
  assert.equal(recordLogin(u, "Chrome on Windows", notify), true); // the first sign-in is not news
  assert.equal(notes(), 0);
  assert.equal(recordLogin(u, "Safari on iPhone or iPad", notify), false);
  assert.equal(notes(), 1);
  const row = get("SELECT last_login_ua, last_login_at FROM users WHERE id=?", u);
  assert.equal(row.last_login_ua, "Safari on iPhone or iPad");
  assert.ok(row.last_login_at > 0);
});

test("two-step sign-in: a code works once, expires, locks after five wrong tries, and a trusted device skips it", async () => {
  const { run, now, user } = await setup();
  process.env.TWO_STEP_DEV = "1";
  const T = await import("../lib/twostep");
  const { get } = await import("../lib/db");
  const id = user();
  run("UPDATE users SET college_email='a.student@college.example' WHERE id=?", id);
  const me = () => get("SELECT * FROM users WHERE id=?", id);
  // A verified member on an unknown device is asked; switching the setting off, or not being verified, is not.
  assert.equal(T.needsCode(me()), true);
  run("UPDATE users SET two_step=0 WHERE id=?", id);
  assert.equal(T.needsCode(me()), false);
  run("UPDATE users SET two_step=1, verified=0 WHERE id=?", id);
  assert.equal(T.needsCode(me()), false);
  run("UPDATE users SET verified=1 WHERE id=?", id);
  // The code itself is never stored, only a hash.
  const code = T.newLoginCode(id);
  assert.match(code, /^\d{6}$/);
  assert.ok(!String(get("SELECT code_hash FROM login_codes WHERE user_id=?", id).code_hash).includes(code));
  assert.equal(T.checkLoginCode(id, code === "111111" ? "222222" : "111111"), "wrong");
  assert.equal(T.checkLoginCode(id, ` ${code.slice(0, 3)} ${code.slice(3)} `), "ok"); // spaces are fine
  assert.equal(T.checkLoginCode(id, code), "expired"); // used once, gone
  // Five wrong tries lock that code, even for the right answer.
  const c2 = T.newLoginCode(id);
  for (let i = 0; i < 5; i++) assert.equal(T.checkLoginCode(id, "000000" === c2 ? "000001" : "000000"), "wrong");
  assert.equal(T.checkLoginCode(id, c2), "locked");
  // An old code is refused.
  const c3 = T.newLoginCode(id);
  run("UPDATE login_codes SET expires=? WHERE user_id=?", now() - 1, id);
  assert.equal(T.checkLoginCode(id, c3), "expired");
  // Another person's code is no use.
  const other = user();
  assert.equal(T.checkLoginCode(other, T.newLoginCode(id)), "expired");
  // A trusted device is not asked again; someone else's device cookie, an old one, or a forgotten one is.
  const device = T.trustDevice(id, "Chrome on Windows");
  assert.equal(T.needsCode(me(), device), false);
  assert.equal(T.needsCode(me(), "made-up"), true);
  assert.equal(T.needsCode(get("SELECT * FROM users WHERE id=?", other), device), false); // other has no college email, so never asked
  run("UPDATE trusted_devices SET created_at=? WHERE user_id=?", now() - 91 * 86400, id);
  assert.equal(T.needsCode(me(), device), true);
  const d2 = T.trustDevice(id, "Safari on Mac");
  T.forgetDevices(id);
  assert.equal(T.needsCode(me(), d2), true);
  // The waiting cookie is signed and short-lived.
  assert.equal(T.readPending(T.pendingToken(id)), id);
  assert.equal(T.readPending(T.pendingToken(id, now() - 1)), null);
  assert.equal(T.readPending(T.pendingToken(id).replace(/^\d+/, String(other))), null);
  assert.equal(T.readPending("junk"), null);
  assert.equal(T.maskEmail("a.student@college.example"), "a.••••••@college.example");
  delete process.env.TWO_STEP_DEV;
});

test("a college domain that cannot receive email is caught before a code is sent", async () => {
  const { domainTakesMail } = await import("../lib/twostep");
  const fails = (code: string) => async () => { throw Object.assign(new Error(code), { code }); };
  assert.equal(await domainTakesMail("typo.example", fails("ENOTFOUND")), false); // no such domain
  assert.equal(await domainTakesMail("web-only.example", fails("ENODATA")), false); // a domain with no mail servers
  assert.equal(await domainTakesMail("empty.example", async () => []), false);
  assert.equal(await domainTakesMail("nullmx.example", async () => [{ exchange: "." }]), false); // says outright it takes no mail
  assert.equal(await domainTakesMail("college.example", async () => [{ exchange: "mx.college.example" }]), true);
  // If the lookup itself breaks, the student is not blocked: the emailed code is still the real proof.
  assert.equal(await domainTakesMail("college.example", fails("ETIMEOUT")), true);
});

/* ---------- rating lab: P0 to P8 (docs/rating-lab/COLLAB.md) ---------- */

test("P0: an honest team that ships and vouches for each other is not a ring; the same closed group shipping again and again is", async () => {
  const { compute, user, project, vouch, RULES } = await setup();
  const team = [user(1, 12), user(1, 12), user(1, 12)];
  for (const a of team) for (const b of team) if (a !== b) vouch(a, b);
  const ringed = () => team.map((id) => compute().get(id)!.ring);
  project("shipped", 100, team);
  assert.deepEqual(ringed(), [false, false, false], "first project together");
  project("shipped", 100, team);
  assert.deepEqual(ringed(), [false, false, false], "two projects is still a normal team");
  for (let i = 2; i < RULES.ringMinProjects; i++) project("shipped", 100, team);
  assert.deepEqual(ringed(), [true, true, true]);
});

test("P0: a newcomer cannot shield a ring, and solo projects do not count towards one", async () => {
  const { compute, user, project, vouch } = await setup();
  const [a, b, rookie] = [user(1, 12), user(1, 12), user(1, 12)];
  for (let i = 0; i < 2; i++) project("shipped", 100, [a, b]);
  project("shipped", 100, [a, b, rookie]);
  for (const x of [a, b, rookie]) for (const y of [a, b, rookie]) if (x !== y) vouch(x, y);
  assert.equal(compute().get(rookie)!.ring, true, "three team projects inside the group, even though the rookie joined one");
  const [c, d, e] = [user(1, 12), user(1, 12), user(1, 12)];
  project("shipped", 100, [c, d, e]);
  for (const x of [c, d, e]) project("shipped", 60, [x]);
  for (const x of [c, d, e]) for (const y of [c, d, e]) if (x !== y) vouch(x, y);
  assert.equal(compute().get(c)!.ring, false, "one team project and some solo work is not a pattern");
});

test("P5: rings of up to six people are caught", async () => {
  const { compute, user, project, vouch, RULES } = await setup();
  const six = [1, 2, 3, 4, 5, 6].map(() => user(1, 12)), seven = [1, 2, 3, 4, 5, 6, 7].map(() => user(1, 12));
  for (const g of [six, seven]) {
    for (let i = 0; i < RULES.ringMinProjects; i++) project("shipped", 100, g);
    for (const a of g) for (const b of g) if (a !== b) vouch(a, b);
  }
  const S = compute();
  assert.equal(S.get(six[0])!.ring, true);
  assert.equal(S.get(seven[0])!.ring, false, "above ringMax a closed group is more likely a club");
});

test("P1: old work makes Connect less sure faster than it lowers the score", async () => {
  const { rate } = await skillKit();
  const { recency, recencyScore } = await import("../lib/skills");
  const t = 1_800_000_000, at = t - 36 * 30 * 86400;
  assert.equal(recency(at, t), 0.25);
  assert.equal(recencyScore(at, t), 0.5);
  const now = rate([{ q: 0.9, w: recency(at, t), ws: recencyScore(at, t) }]), both = rate([{ q: 0.9, w: recency(at, t) }]);
  assert.equal(Math.round(now.score), 42);
  assert.equal(Math.round(both.score), 37, "if the score faded as fast as confidence");
  assert.equal(now.conf, both.conf);
});

test("P1: each skill says when it was last confirmed", async () => {
  const { user, shipWith, skill, now } = await skillKit();
  const [a, b, c] = [user(1, 12), user(1, 12), user(1, 12)];
  const then = now() - 5 * 30 * 86400;
  shipWith([a, b, c], "react", 100, then);
  assert.equal(skill(a, "react")!.last, then);
});

test("P2: suggestions rank by how much of a score is backed by evidence", async () => {
  const { fit } = await import("../lib/relevance");
  const s = (score: number, conf: number) => new Map([["react", { skill: "react", label: "React", score, conf, band: "low" as const, why: "based on 1 shipped project", items: [], last: 0 }]]);
  const person = (id: number, score: number, conf: number) => ({ id, skills: s(score, conf), listed: [], finishRate: 1, finished: 1, ended: 1, open: true, load: 0 });
  const needs = { mode: "all" as const, list: [{ skill: "react", importance: 3 }] };
  const stale = fit(needs, person(1, 90, 0.1))!, active = fit(needs, person(2, 50, 0.4))!;
  assert.ok(Math.abs(stale.score - 0.36) < 1e-9 && Math.abs(active.score - 0.38) < 1e-9);
  assert.ok(active.score > stale.score, "an active junior beats a stale star");
});

test("P3: a pair confirming each other counts part until someone outside the pair agrees", async () => {
  const { user, shipWith, skill, RULES } = await skillKit();
  const [a, b, c, d] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  const early = 1_700_000_000;
  shipWith([a, b], "react", 100, early);
  const pairOnly = skill(a, "react")!.items.find((i) => i.at === early)!.w;
  shipWith([a, c, d], "react");
  const backed = skill(a, "react")!.items.find((i) => i.at === early)!.w;
  assert.ok(Math.abs(pairOnly / backed - RULES.skill.pairFactor) < 1e-9, "backed by a bigger team, the pair's project counts in full");
});

test("P3: the same people ticking the same skill again counts less", async () => {
  const { user, shipWith, skill, RULES } = await skillKit();
  const [a, b, c] = [user(1, 12), user(1, 12), user(1, 12)];
  shipWith([a, b, c], "react", 100, 1_700_000_000);
  shipWith([a, b, c], "react", 100, 1_700_000_100);
  const [first, second] = skill(a, "react")!.items.sort((x, y) => x.at - y.at);
  assert.ok(Math.abs(second.w / first.w - RULES.skill.repeatTick) < 0.01);
  const fresh = user(1, 12);
  shipWith([a, b, fresh], "react", 100, 1_700_000_200);
  const third = skill(a, "react")!.items.sort((x, y) => x.at - y.at)[2];
  assert.ok(third.w > second.w * 1.5, "a tick from someone new counts in full");
});

test("P4: upholding a report can take back a person's vouches or reset a split, and the ledger says so", async () => {
  const { run, now, compute, user, project, give, vouch, RULES } = await setup();
  const [a, b, c] = [user(1, 12), user(1, 12), user(1, 12)];
  const pid = project("shipped", 90, [a, b, c]);
  give(pid, a, b, 90); give(pid, a, c, 10); give(pid, c, b, 90); give(pid, c, a, 10); give(pid, b, a, 50); give(pid, b, c, 50);
  vouch(b, a); vouch(c, a);
  const before = compute();
  assert.ok(before.get(b)!.earned > RULES.starter + 30);
  run("INSERT INTO revoked (kind, target_id, report_id, created_at) VALUES ('split',?,1,?)", pid, now());
  run("INSERT INTO revoked (kind, target_id, report_id, created_at) VALUES ('vouches',?,2,?)", b, now());
  const S = compute();
  for (const id of [a, b, c]) assert.ok(S.get(id)!.ledger.some((l) => l.why.includes("split reset to equal")));
  assert.equal(S.get(b)!.ledger.find((l) => l.what.endsWith("shipped"))!.n, 30);
  const vouchesTo = (id: number) => S.get(id)!.ledger.filter((l) => l.what === "Vouch from a teammate").length;
  assert.equal(vouchesTo(a), 1, "only c's vouch is left");
  assert.equal(S.get(b)!.ledger.find((l) => l.what === "Vouches removed")!.n, 0, "the explanation line moves nothing");
});

test("P6: the sign-off checklist feeds commission quality, dropped commissions count as unfinished, and hire-again stays private", async () => {
  const { commissionQuality } = await import("../lib/skills");
  const { hireAgainOf } = await import("../lib/commissions");
  const { credibility } = await import("../lib/credibility");
  assert.equal(commissionQuality(5), 1, "old sign-offs use the rating alone");
  assert.equal(commissionQuality(5, 1, 1), 1);
  assert.equal(commissionQuality(5, 0, 0), 0.5, "five stars cannot hide late, off-brief work");
  assert.equal(commissionQuality(2, 0, 0), 0.2);
  const base = { shipped: 1, left: 0, mates: 2, circle: false, ring: false, reviewsMatched: 0, reviewsTotal: 0, evidenceOk: 0, evidenceBad: 0, createdAt: 0, upheld: [] };
  const fin = (x: object) => credibility({ ...base, ...x }, 1e10).finishRate;
  assert.equal(fin({ commDone: 1, commDropped: 1 }), (2 + 2 * 0.7) / 5);
  assert.ok(fin({ commDone: 1, commDropped: 1 }) < fin({ commDone: 1 }));
  const rows = [1, 2].map((client) => ({ client_id: client, doer_id: 9, hire_again: 0 }));
  assert.equal(hireAgainOf(rows, 9), null, "two clients' answers would give each one away");
  assert.deepEqual(hireAgainOf([...rows, { client_id: 3, doer_id: 9, hire_again: 1 }], 9), { yes: 1, total: 3 });
});

test("P7: only independent rounds measure reviewer accuracy, and a spot check overrides the reviewers", async () => {
  const { run, now, compute, user, project } = await setup();
  const [x, y, breaker, z, w] = [user(1, 12), user(1, 12), user(1, 12), user(1, 12), user(1, 12)];
  const log = (pid: number, who: number, verdict: number, outcome: number, decider: number, at: number) =>
    run("INSERT INTO review_log (project_id, reviewer_id, verdict, outcome, created_at, decider) VALUES (?,?,?,?,?,?)", pid, who, verdict, outcome, at, decider);
  const base = compute().get(x)!.cred.score;
  // Two who agree decide the round themselves: no accuracy either way.
  log(501, x, 100, 100, 0, 1); log(501, y, 100, 100, 1, 1);
  assert.equal(compute().get(x)!.cred.score, base);
  // A tie-break: the two first reviewers are judged, the one who broke the tie is not.
  log(502, x, 100, 60, 0, 2); log(502, y, 60, 60, 0, 2); log(502, breaker, 60, 60, 1, 2);
  let S = compute();
  assert.ok(S.get(x)!.cred.score < base && S.get(y)!.cred.score > base);
  assert.equal(S.get(breaker)!.cred.score, base);
  // A spot check: the admin's verdict is the truth for both reviewers, and the pot follows it.
  const pid = project("shipped", 60, [user(1, 12), user(1, 12)]);
  log(pid, z, 100, 100, 0, 3); log(pid, w, 100, 100, 1, 3);
  run("INSERT INTO audits (project_id, admin_id, verdict, old_pot, note, created_at) VALUES (?,?,60,100,'demo only',?)", pid, x, now());
  S = compute();
  assert.ok(S.get(z)!.cred.score < base && S.get(w)!.cred.score < base, "both were wrong about a demo they called live");
  assert.ok(!S.get(z)!.ledger.some((l) => l.what === "Accurate reviews"), "no reward for a verdict the spot check overturned");
});

test("P8: commissions are rated one way only; there is no way for the doer to rate the client", async () => {
  const { all } = await import("../lib/db");
  const cols = all("PRAGMA table_info(commissions)").map((c) => c.name as string);
  assert.ok(cols.includes("rating"));
  assert.ok(!cols.some((c) => /client_rating|doer_rating|rating_by_doer/.test(c)));
  const actions = fs.readFileSync(path.join(__dirname, "../app/actions.ts"), "utf8");
  assert.ok(!/rateClient|rateTheClient/.test(actions));
});
