import { all, get, run, now } from "./db";
import { canon } from "./skills";

/* "For you": the order of the board for one person.

   It borrows what makes a good feed work (it learns from what you open, it mixes in new things so they are not
   buried, it does not show the same lead three times in a row) and leaves out what makes feeds bad for this
   place. Popularity never ranks anything: how many people opened, followed or vouched for a project is not an
   input, so a loud project cannot buy its way up and a quiet new one is not buried. Every card says why it is
   there, and "Not for me" takes a project out and teaches the order.

   What it remembers (which projects you opened and hid) is private to you, is in your data download, and is
   erased with your account. */

export const FEED = {
  fit: 3,            // per open role skill that matches skills others confirmed for you (at most 2 count)
  teammate: 2.5,     // someone you have worked with is on the team
  friendOfTeam: 1.2, // someone you shipped with shipped with someone on the team
  interest: 2,       // × how close the project's skills are to what you have been opening (0 to 1)
  interestHalfLifeDays: 21,
  momentum: 1.5,     // × 0.5 ^ (days since the last update / 7)
  momentumHalfLifeDays: 7,
  needsPeople: 1.5,  // still recruiting or building, with an open role
  newness: 1.2,      // × 0.5 ^ (days since posted / 5), so new posts get seen before anyone has opened them
  newHalfLifeDays: 5,
  followed: 0.8,
  shipped: -1,       // finished: nothing to join, so lower unless you know the team
  seenOften: -1,     // opened 3+ times in two weeks and still not followed or asked to join
  seenOftenViews: 3,
  // How much each thing you do teaches the order about a project's skills.
  learn: { view: 1, follow: 2, ask: 3, hide: -3 },
};
const DAY = 86400;
const half = (days: number, hl: number) => Math.pow(0.5, Math.max(0, days) / hl);

export type FeedProject = {
  id: number; lead: number; status: string; created: number; lastActive: number;
  team: number[]; openRoles: number; fit: string[]; skills: string[]; followed: boolean; mine: boolean;
};
export type FeedViewer = {
  id: number;
  direct: Set<number>;                 // people you have worked with
  second: Map<number, string>;         // people one shipped step away, with the name of the shared teammate
  names: Map<number, string>;
  interest: Map<string, number>;       // learned, 0 to 1 per skill
  seen: Map<number, { views: number; last: number; hidden: boolean; asked: boolean }>;
};
export type Ranked = { id: number; score: number; why: string[] };

/* Scores one project for one person. Returns null when it should not be in "For you" at all. */
export function score(p: FeedProject, v: FeedViewer, t: number): Ranked | null {
  const s = v.seen.get(p.id);
  if (p.mine || p.status === "dropped" || s?.hidden) return null;
  const parts: [number, string][] = [];
  const add = (n: number, why = "") => parts.push([n, why]);

  if (p.openRoles > 0 && p.fit.length) add(FEED.fit * Math.min(2, p.fit.length), `Needs your ${p.fit.slice(0, 2).join(" and ")}`);
  const mate = p.team.find((u) => v.direct.has(u));
  const friend = mate ? undefined : p.team.find((u) => v.second.has(u));
  if (mate) add(FEED.teammate, `${first(v.names.get(mate))}, who you worked with, is on it`);
  else if (friend) add(FEED.friendOfTeam, `${first(v.second.get(friend))} has shipped with this team`);
  const like = p.skills.map((k) => [k, v.interest.get(canon(k)) ?? 0] as const).sort((a, b) => b[1] - a[1]);
  if (like[0] && like[0][1] > 0.15) add(FEED.interest * like[0][1], `Like projects you opened: ${like[0][0]}`);
  const live = p.status === "recruiting" || p.status === "building";
  if (live && p.lastActive) {
    const m = half((t - p.lastActive) / DAY, FEED.momentumHalfLifeDays);
    add(FEED.momentum * m, m > 0.5 ? "Moving this week" : "");
  }
  if (live && p.openRoles > 0) add(FEED.needsPeople, "Looking for people");
  const age = (t - p.created) / DAY;
  if (age < 14) add(FEED.newness * half(age, FEED.newHalfLifeDays), age < 7 ? "New this week" : "");
  if (p.followed) add(FEED.followed, "You follow it");
  if (p.status === "shipped" && !mate && !friend) add(FEED.shipped);
  if (s && s.views >= FEED.seenOftenViews && t - s.last < 14 * DAY && !p.followed && !s.asked) add(FEED.seenOften);

  const total = parts.reduce((a, [n]) => a + n, 0);
  const why = parts.filter(([n, w]) => w && n > 0).sort((a, b) => b[0] - a[0]).map(([, w]) => w).slice(0, 2);
  return { id: p.id, score: Math.round(total * 100) / 100, why };
}
const first = (n?: string) => (n ?? "Someone").split(" ")[0];

/* Orders a whole board: best first, then nudged so one lead's projects are not shown back to back. */
export function rankBoard(projects: FeedProject[], v: FeedViewer, t = now()): Ranked[] {
  const lead = new Map(projects.map((p) => [p.id, p.lead]));
  const ranked = projects.map((p) => score(p, v, t)).filter((r): r is Ranked => !!r)
    .sort((a, b) => b.score - a.score || b.id - a.id);
  const out: Ranked[] = [];
  const rest = [...ranked];
  while (rest.length) {
    const prev = out.length ? lead.get(out[out.length - 1].id) : undefined;
    const i = rest.findIndex((r) => lead.get(r.id) !== prev);
    out.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

/* What someone has been opening, following, asking to join and hiding, turned into a weight per skill (0 to 1).
   Older actions count less (half every three weeks). Hiding pushes a skill down. */
export function learnInterest(events: { skills: string[]; kind: keyof typeof FEED.learn; at: number }[], t = now()): Map<string, number> {
  const w = new Map<string, number>();
  for (const e of events) {
    const n = FEED.learn[e.kind] * half((t - e.at) / DAY, FEED.interestHalfLifeDays);
    for (const k of new Set(e.skills.map(canon))) w.set(k, (w.get(k) ?? 0) + n);
  }
  const top = Math.max(0, ...w.values());
  const out = new Map<string, number>();
  if (top > 0) for (const [k, n] of w) if (n > 0) out.set(k, n / top);
  return out;
}

/* ---------- the records behind it ---------- */

/* Called when someone opens a project page. One row per person and project; opening it again within half an hour
   (for example after posting a question) is the same visit. */
export function noteView(userId: number, projectId: number) {
  run(`INSERT INTO project_seen (user_id, project_id, views, last_at) VALUES (?,?,1,?)
       ON CONFLICT (user_id, project_id) DO UPDATE SET views=CASE WHEN excluded.last_at - last_at > 1800 THEN MIN(views+1, 50) ELSE views END, last_at=excluded.last_at`, userId, projectId, now());
}
export function setHidden(userId: number, projectId: number, on: boolean) {
  run(`INSERT INTO project_seen (user_id, project_id, views, last_at, hidden) VALUES (?,?,0,?,?)
       ON CONFLICT (user_id, project_id) DO UPDATE SET hidden=excluded.hidden, last_at=excluded.last_at`, userId, projectId, now(), on ? 1 : 0);
}
export const hiddenCount = (userId: number) => Number(get("SELECT COUNT(*) n FROM project_seen WHERE user_id=? AND hidden=1", userId)?.n ?? 0);

/* Everything rankBoard needs to know about the viewer, read from the database. */
export function viewerSignals(userId: number, skillsOf: Map<number, string[]>): Pick<FeedViewer, "interest" | "seen"> {
  const seenRows = all("SELECT * FROM project_seen WHERE user_id=?", userId);
  const asked = new Set(all("SELECT project_id FROM requests WHERE user_id=?", userId).map((r) => r.project_id as number));
  const follows = all("SELECT project_id, created_at FROM follows WHERE user_id=?", userId);
  const t = now();
  const events: { skills: string[]; kind: keyof typeof FEED.learn; at: number }[] = [];
  for (const r of seenRows) {
    const sk = skillsOf.get(r.project_id) ?? [];
    if (r.views > 0) events.push({ skills: sk, kind: "view", at: r.last_at });
    if (r.hidden) events.push({ skills: sk, kind: "hide", at: r.last_at });
  }
  for (const f of follows) events.push({ skills: skillsOf.get(f.project_id) ?? [], kind: "follow", at: f.created_at ?? t });
  for (const id of asked) events.push({ skills: skillsOf.get(id) ?? [], kind: "ask", at: t - 7 * DAY });
  return {
    interest: learnInterest(events, t),
    seen: new Map(seenRows.map((r) => [r.project_id as number, { views: r.views, last: r.last_at, hidden: !!r.hidden, asked: asked.has(r.project_id) }])),
  };
}
