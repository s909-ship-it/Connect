/* Tests for the AI proof check. GitHub, the website and Gemini are stand-ins: nothing leaves this machine.
   Run with: npm test. Uses a throwaway database, never the real one. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "connect-proof-")), "test.db");

const T0 = Math.floor(Date.UTC(2026, 9, 1) / 1000); // 1 Oct 2026
const repo = (over: Record<string, unknown> = {}) => ({
  url: "https://github.com/riya/attend", full: "riya/attend", ok: true, fork: false, parent: null,
  createdAt: T0 + 86400, pushedAt: T0 + 40 * 86400, languages: [{ name: "C++", pct: 81 }, { name: "Python", pct: 19 }],
  contributors: [
    { login: "riya", name: null, email: null, commits: 60, bot: false },
    { login: null, name: "Arjun M", email: "arjun@college.edu", commits: 20, bot: false },
    { login: "meera-dev", name: null, email: null, commits: 10, bot: false },
    { login: "stranger", name: null, email: null, commits: 10, bot: false },
    { login: "dependabot[bot]", name: null, email: null, commits: 5, bot: true },
    { login: "acme-release-bot", name: null, email: null, commits: 7, bot: false },
  ],
  totalCommits: 105,
  recent: [
    { login: "riya", name: "Riya Patil", email: "riya@users.noreply.github.com", at: T0 + 30 * 86400, message: "Add RFID reader driver" },
    { login: "meera-dev", name: "Meera Shah", email: "m@personal.example", at: T0 + 20 * 86400, message: "Attendance export to CSV" },
    { login: null, name: "Arjun M", email: "arjun@college.edu", at: T0 + 10 * 86400, message: "Dashboard layout" },
  ],
  readme: "# Attend\nRFID attendance for classrooms.",
  ...over,
});
const team = [
  { userId: 1, name: "Riya Patil", emails: ["riya@college.edu"], login: "riya", role: "Lead", did: "Firmware and reader driver" },
  { userId: 2, name: "Arjun Mane", emails: ["arjun@college.edu"], login: null, role: "Frontend", did: "Dashboard" },
  { userId: 3, name: "Meera Shah", emails: ["meera@college.edu"], login: null, role: "Data", did: "CSV export" },
];

test("GitHub links: repos are recognised, everything else is not", async () => {
  const { parseRepo, githubLogin } = await import("../lib/github");
  assert.deepEqual(parseRepo("https://github.com/riya/attend"), { owner: "riya", repo: "attend" });
  assert.deepEqual(parseRepo("https://github.com/riya/attend.git"), { owner: "riya", repo: "attend" });
  assert.deepEqual(parseRepo("https://www.github.com/riya/attend/tree/main/src"), { owner: "riya", repo: "attend" });
  assert.equal(parseRepo("https://github.com/riya"), null);
  assert.equal(parseRepo("https://github.com/orgs/acme/people"), null);
  assert.equal(parseRepo("https://gitlab.com/riya/attend"), null);
  assert.equal(parseRepo("not a link"), null);
  assert.equal(githubLogin("https://github.com/riya-p"), "riya-p");
  assert.equal(githubLogin("github.com/riya/"), "riya");
  assert.equal(githubLogin("@riya"), "riya");
  assert.equal(githubLogin("riya patil"), null);
  assert.equal(githubLogin(""), null);
});

test("sources: the live link first, repos, videos, and links Connect cannot read", async () => {
  const { sources } = await import("../lib/proofcheck");
  const s = sources([
    { url: "https://github.com/riya/attend" }, { url: "https://github.com/riya/attend/" }, { url: "https://youtu.be/abc123" },
    { url: "https://www.figma.com/file/xyz" }, { url: "https://docs.google.com/document/d/1" }, { url: "https://attend.example.com" },
  ], "https://attend.example.com/");
  assert.deepEqual(s.repos, [{ owner: "riya", repo: "attend" }], "the same repo twice counts once");
  assert.deepEqual(s.sites, ["https://attend.example.com/"], "the live link, once");
  assert.deepEqual(s.videos, ["https://youtu.be/abc123"]);
  assert.deepEqual(s.unread, ["a Figma file", "a Google Drive file"]);
});

test("commits are matched to teammates by GitHub profile, then email, then name; bots never count", async () => {
  const { matchTeam } = await import("../lib/proofcheck");
  const { members, outsiders, total } = matchTeam(team, [repo() as never]);
  assert.equal(total, 100, "the bots' commits are left out, including a release bot GitHub does not mark as one");
  const [riya, arjun, meera] = members;
  assert.equal(riya.commits, 60); assert.equal(riya.matchedBy, "GitHub profile");
  assert.equal(arjun.commits, 20); assert.equal(arjun.matchedBy, "email");
  assert.equal(meera.commits, 10); assert.equal(meera.matchedBy, "name", "her GitHub account committed under her full name");
  assert.deepEqual(outsiders.map((o) => [o.who, o.commits]), [["stranger", 10]]);
  assert.equal(riya.lastAt, T0 + 30 * 86400);
  assert.equal(riya.share, 0.6);
});

test("a first name alone never matches: two people can share it", async () => {
  const { matchTeam } = await import("../lib/proofcheck");
  const r = repo({ contributors: [{ login: null, name: "Riya", email: null, commits: 9, bot: false }], recent: [] });
  const { members, outsiders } = matchTeam([{ ...team[0], login: null, name: "Riya" }], [r as never]);
  assert.equal(members[0].commits, 0);
  assert.equal(outsiders[0].who, "Riya");
});

test("automatic checks flag a fork, a one-go upload, an old repo, a missing README and code by outsiders", async () => {
  const { matchTeam, autoChecks } = await import("../lib/proofcheck");
  const raw = repo({
    fork: true, parent: "someone/attendance-system", createdAt: T0 - 400 * 86400, readme: undefined, totalCommits: 3,
    contributors: [{ login: "stranger", name: null, email: null, commits: 3, bot: false }],
    recent: [1, 2, 3].map((i) => ({ login: "stranger", name: "S", email: "s@x.example", at: T0 + i * 60, message: "upload" })),
  });
  const withGit = team.map((m) => ({ ...m, login: m.login ?? m.name.split(" ")[0].toLowerCase() }));
  const { members, outsiders, total, repoTeam } = matchTeam(withGit, [raw as never]);
  const summary = [{ url: raw.url, full: raw.full, ok: true, fork: true, parent: raw.parent, createdAt: raw.createdAt as number, pushedAt: raw.pushedAt as number,
    totalCommits: 3, teamCommits: repoTeam[raw.full], sinceStart: 0, hasReadme: false }];
  const checks = autoChecks({ name: "Attend", created_at: T0 }, summary, [raw as never],
    [{ url: "https://attend.example.com", ok: true, status: 200, note: "Answered", appShell: true }], [], ["a Figma file"], members, outsiders, total);
  const has = (status: string, re: RegExp) => assert.ok(checks.some((c) => c.status === status && re.test(c.text)), `expected ${status}: ${re}\n${JSON.stringify(checks, null, 1)}`);
  has("bad", /fork\) of someone\/attendance-system\. 0 of its commits/);
  has("warn", /only 3 commits/);
  has("warn", /within one day/);
  has("warn", /long before this project started/);
  has("warn", /no README/);
  has("bad", /Only 0% of the commits are by this team\. Most are by stranger \(100%\)/);
  has("unknown", /builds itself in the browser/);
  has("unknown", /cannot read a Figma file/);
});

test("Gemini's answer is checked before it is shown", async () => {
  const { parseAi } = await import("../lib/proofcheck");
  const good = parseAi('```json\n{"summary":"Code matches.","claims":[{"claim":"Pitch: RFID attendance","evidence":"commit \\"Add RFID reader driver\\"","status":"supported"},{"claim":"Member 2: dashboard","evidence":"20 commits","status":"maybe"}],"questions":["Who wrote the CSV export?"]}\n```');
  assert.ok(good);
  assert.equal(good!.claims.length, 2);
  assert.equal(good!.claims[1].status, "unclear", "an unknown status falls back to unclear");
  assert.equal(parseAi("not json"), null);
  assert.equal(parseAi('{"summary":"","claims":[],"questions":[]}'), null, "an empty answer counts as none");
});

test("reading a page: title, description, headings and text, with scripts left out", async () => {
  const { pageFacts } = await import("../lib/live");
  const f = pageFacts(`<html><head><title>Attend &amp; Track</title><meta content="RFID attendance for classrooms" name="description">
    <script>window.secret = "do not read me"</script><style>.x{}</style></head>
    <body><h1>Attend</h1><p>Tap your card &mdash; done.</p><script>alert(1)</script></body></html>`);
  assert.equal(f.title, "Attend & Track");
  assert.equal(f.description, "RFID attendance for classrooms");
  assert.deepEqual(f.headings, ["Attend"]);
  assert.match(f.text!, /Tap your card — done\./);
  assert.ok(!/secret|alert/.test(f.text!));
  assert.equal(f.appShell, false);
  assert.equal(pageFacts('<html><head><title>App</title></head><body><div id="root"></div><script type="module" src="/a.js"></script></body></html>').appShell, true);
});

test("the whole check: saves a report, and never sends a teammate's name or email to Gemini", async () => {
  const { run, now, TABLES } = await import("../lib/db");
  const { checkProof, latestCheck } = await import("../lib/proofcheck");
  for (const t of TABLES) run(`DELETE FROM ${t}`);
  for (const m of team)
    run("INSERT INTO users (id, sub, name, email, college_email, github, verified, onboarded, created_at) VALUES (?,?,?,?,?,?,1,1,?)",
      m.userId, `t:${m.userId}`, m.name, m.emails[0].replace("college", "gmail"), m.emails[0], m.login ? `https://github.com/${m.login}` : "", now());
  const pid = Number(run("INSERT INTO projects (name, pitch, status, lead_id, created_at) VALUES ('Attend','RFID attendance for classrooms','review',1,?)", T0).lastInsertRowid);
  for (const m of team) run("INSERT INTO members (project_id, user_id, role, did) VALUES (?,?,?,?)", pid, m.userId, m.role, m.did);
  run("INSERT INTO milestones (project_id, title, done) VALUES (?, 'Reader works', 1)", pid);
  run("INSERT INTO proofs (project_id, label, url) VALUES (?, 'Repo', 'https://github.com/riya/attend'), (?, 'Demo', 'https://youtu.be/abc123')", pid, pid);

  let sent = "";
  const answer = { summary: "Member 1 wrote most of the code.", claims: [{ claim: "Member 2: dashboard", evidence: "20 commits by email", status: "supported" }], questions: ["Can Member 3 show the export?"] };
  const deps = {
    readRepo: async () => repo() as never,
    readSite: async () => { throw new Error("no site in this test"); },
    readVideo: async (url: string) => ({ url, ok: true, title: "Attend demo", channel: "Riya" }),
    ask: async (_system: string, user: string) => { sent = user; await new Promise((r) => setTimeout(r, 20)); return { text: JSON.stringify(answer) }; },
  };
  const [first, second] = await Promise.all([checkProof(pid, 1, deps), checkProof(pid, 1, deps)]);
  assert.ok(first.id, JSON.stringify(first));
  assert.match(second.error ?? "", /already running/, "two checks of one project never run at once");
  for (const m of team) {
    assert.ok(!sent.includes(m.name), `${m.name} was sent to Gemini`);
    for (const e of m.emails) assert.ok(!sent.includes(e), `${e} was sent to Gemini`);
  }
  assert.ok(sent.includes("Member 2") && sent.includes("Dashboard"), "roles and claims go, as Member N");
  const saved = latestCheck(pid)!;
  assert.equal(saved.report.ai?.claims[0].status, "supported");
  assert.equal(saved.report.members[1].commits, 20);
  assert.ok(saved.report.checks.some((c) => /Demo video: “Attend demo”/.test(c.text)));

  // Gemini down: the automatic checks are still saved, with the reason.
  await checkProof(pid, 1, { ...deps, ask: async () => ({ error: "Gemini is very busy right now. Try again in a minute." }) });
  const down = latestCheck(pid)!.report;
  assert.equal(down.ai, undefined);
  assert.match(down.aiError!, /busy/);
  assert.ok(down.checks.length > 0);

  // Nothing to read: no check.
  run("DELETE FROM proofs WHERE project_id=?", pid);
  assert.match((await checkProof(pid, 1, deps)).error ?? "", /nothing for the check to read/);
});

test("GitHub's hourly limit is reported as a limit, not as a missing repo", async () => {
  const { readRepo } = await import("../lib/github");
  const limited = async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(T0) } });
  const r = await readRepo("riya", "attend", limited);
  assert.equal(r.ok, false); assert.equal(r.limited, true); assert.match(r.error!, /hourly limit/);
  const gone = await readRepo("riya", "nope", async () => new Response("{}", { status: 404 }));
  assert.equal(gone.limited, undefined); assert.match(gone.error!, /Not found, or private/);
});
