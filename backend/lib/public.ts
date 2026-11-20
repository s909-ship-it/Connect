import { all, get, now, type Row } from "./db";
import { compute, EMPTY, type Standing } from "./credit";
import { RULES } from "./rules";
import { label } from "./skills";
import { TIERS, tierFor, type Tier } from "./tiers";
import { progressOf } from "./progress";

/* Read-only data for the public showcase site (../frontend), served as JSON from app/api/public/*.

   The rule: nothing here may be more than a signed-out visitor can already see on Connect today.
   - A college's public page (/c/slug) shows its name, counts and shipped projects (name, pitch, pot, date).
   - A verified student's resume link (/u/id?tab=resume) shows name, branch, class, earned credit, and their
     shipped projects with role, the line on what they did, how many teammates signed, and proof labels.
   - A profile also shows a rank (lib/tiers.ts) and a Progress tab: earned credit over time, with a private
     project's name replaced by "A private project".
   - Anonymous mode (lib/identity.ts): users.name is already the alias and users.picture the pattern, and the
     resume is hidden. So an anonymous builder appears only by alias, pattern, rank and totals, never tied to a
     project, a club or a dated history, and real_name / real_picture are never read here.
   So: only active colleges, only shipped and unhidden projects, only verified, active, onboarded students.
   No emails, no sign-in provider photos, no work in progress, no open roles, no messages, no self-written claims.
   A photo is shown only when the person uploaded it themselves (served publicly by /api/avatar/key). */

const PERSON = "u.role='student' AND u.verified=1 AND u.suspended=0 AND COALESCE(u.deleted,0)=0 AND u.onboarded=1";
const SHIPPED = "p.status='shipped' AND p.hidden=0 AND c.status='active'";

const NAMED = "COALESCE(u.anon,0)=0"; // people who may be tied to a project by name

/* The picture to show, as a path on Connect: an uploaded photo, the anonymous pattern, or none (initials). */
function avatar(u: Row): string | null {
  if (u.anon) return `/api/identicon/${encodeURIComponent(String(u.alias || u.name))}`;
  if (u.photo_key) return `/api/avatar/${u.photo_key}`;
  return null;
}

const tierRef = (t: Tier) => ({ id: t.id, name: t.name, note: t.note });
function rank(st: Pick<Standing, "earned" | "shipped">) {
  const r = tierFor(Math.round(st.earned), st.shipped);
  return { ...tierRef(r.tier), next: r.next ? { ...tierRef(r.next), progress: Math.round(r.progress * 100) / 100, needs: r.needs } : null };
}

const verdict = (pot: number) => (pot >= RULES.live ? "live" : "demo");
const iso = (t: number | null | undefined) => (t ? new Date(t * 1000).toISOString() : null);

function skillsFor(projectId: number): string[] {
  return all("SELECT skill FROM project_skills WHERE project_id=? ORDER BY skill", projectId).map((r) => label(String(r.skill)));
}

function projectCard(p: Row) {
  return {
    id: p.id as number,
    name: p.name as string,
    pitch: p.pitch as string,
    pot: p.pot as number,
    verdict: verdict(p.pot),
    shippedAt: iso(p.shipped_at),
    college: { slug: p.cslug as string, name: p.cname as string },
    skills: skillsFor(p.id),
    teamSize: get("SELECT COUNT(*) n FROM members WHERE project_id=? AND status='active'", p.id).n as number,
  };
}

export function overview() {
  const n = (sql: string) => (get(sql)?.n ?? 0) as number;
  return {
    stats: {
      members: n(`SELECT COUNT(*) n FROM users u WHERE ${PERSON}`),
      shipped: n(`SELECT COUNT(*) n FROM projects p JOIN colleges c ON c.id=p.college_id WHERE ${SHIPPED}`),
      building: n("SELECT COUNT(*) n FROM projects p JOIN colleges c ON c.id=p.college_id WHERE p.status IN ('recruiting','building','review') AND p.hidden=0 AND c.status='active'"),
      colleges: n("SELECT COUNT(*) n FROM colleges WHERE status='active'"),
      committedInr: n("SELECT COALESCE(SUM(amount),0) n FROM grants"),
    },
    rules: {
      starter: RULES.starter, stake: RULES.stake, live: RULES.live, demo: RULES.demo,
      reviewsNeeded: RULES.reviewsNeeded, reviewerMin: RULES.reviewerMin,
      soloFactor: RULES.soloFactor, fadeMonths: RULES.fadeMonths, vouch: RULES.vouch,
    },
    tiers: TIERS.map((t) => ({ ...tierRef(t), minCredit: t.min, minShipped: t.shipped })),
  };
}

export function shippedProjects(opts: { college?: string; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const rows = opts.college
    ? all(`SELECT p.*, c.slug cslug, c.name cname FROM projects p JOIN colleges c ON c.id=p.college_id WHERE ${SHIPPED} AND c.slug=? ORDER BY p.shipped_at DESC LIMIT ?`, opts.college, limit)
    : all(`SELECT p.*, c.slug cslug, c.name cname FROM projects p JOIN colleges c ON c.id=p.college_id WHERE ${SHIPPED} ORDER BY p.shipped_at DESC LIMIT ?`, limit);
  return rows.map(projectCard);
}

export function shippedProject(id: number) {
  const p = get(`SELECT p.*, c.slug cslug, c.name cname FROM projects p JOIN colleges c ON c.id=p.college_id WHERE ${SHIPPED} AND p.id=?`, id);
  if (!p) return null;
  // Only teammates whose own public profile is visible (verified students) are named. Anonymous ones are counted
  // with the rest, never named, because their resume (the record tying them to projects) is hidden.
  const team = all(
    `SELECT u.id, u.name, u.branch, u.grad_year, u.anon, u.alias, u.photo_key, m.role, m.did FROM members m JOIN users u ON u.id=m.user_id
     WHERE m.project_id=? AND m.status='active' AND ${PERSON} AND ${NAMED} ORDER BY m.rowid`, id);
  const s = compute();
  const teamSize = get("SELECT COUNT(*) n FROM members WHERE project_id=? AND status='active'", id).n as number;
  return {
    ...projectCard(p),
    proof: all("SELECT label FROM proofs WHERE project_id=?", id).map((r) => String(r.label)),
    team: team.map((t) => ({
      id: t.id as number, name: t.name as string, branch: (t.branch || "") as string, classOf: t.grad_year ?? null,
      role: (t.role || "") as string, did: (t.did || "") as string, signedBy: Math.max(teamSize - 1, 0),
      avatar: avatar(t), tier: tierRef(tierFor(Math.round((s.get(t.id) ?? EMPTY).earned), (s.get(t.id) ?? EMPTY).shipped).tier),
    })),
    hiddenTeammates: teamSize - team.length,
  };
}

function collegeCounts(id: number) {
  const n = (sql: string) => (get(sql, id)?.n ?? 0) as number;
  return {
    members: n(`SELECT COUNT(*) n FROM users u WHERE u.college_id=? AND ${PERSON}`),
    shipped: n("SELECT COUNT(*) n FROM projects WHERE college_id=? AND status='shipped' AND hidden=0"),
    building: n("SELECT COUNT(*) n FROM projects WHERE college_id=? AND status IN ('recruiting','building','review') AND hidden=0"),
    alumni: n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='alum' AND verified=1"),
  };
}

export function colleges() {
  return all("SELECT * FROM colleges WHERE status='active' ORDER BY name").map((c) => ({
    slug: c.slug as string, name: c.name as string, since: iso(c.created_at), ...collegeCounts(c.id),
  }));
}

export function college(slug: string) {
  const c = get("SELECT * FROM colleges WHERE slug=? AND status='active'", slug);
  if (!c) return null;
  return {
    slug: c.slug as string, name: c.name as string, since: iso(c.created_at),
    domains: String(c.domains).split(",").map((d) => d.trim()).filter(Boolean),
    counts: collegeCounts(c.id),
    shipped: shippedProjects({ college: slug, limit: 50 }),
  };
}

export function builders(limit = 20) {
  const s = compute();
  return all(`SELECT u.id, u.name, u.branch, u.grad_year, u.anon, u.alias, u.photo_key, c.slug cslug, c.name cname FROM users u JOIN colleges c ON c.id=u.college_id WHERE ${PERSON} AND c.status='active'`)
    .map((u) => {
      const st = s.get(u.id) ?? EMPTY;
      return {
        id: u.id as number, name: u.name as string, branch: (u.branch || "") as string, classOf: u.grad_year ?? null,
        college: { slug: u.cslug as string, name: u.cname as string },
        earned: Math.round(st.earned), shipped: st.shipped, joined: st.joined,
        anonymous: !!u.anon, avatar: avatar(u), tier: tierRef(tierFor(Math.round(st.earned), st.shipped).tier),
      };
    })
    .filter((b) => b.shipped > 0)
    .sort((a, b) => b.earned - a.earned || b.shipped - a.shipped)
    .slice(0, Math.min(Math.max(limit, 1), 100));
}

export function builder(id: number) {
  const u = get(`SELECT u.*, c.slug cslug, c.name cname FROM users u JOIN colleges c ON c.id=u.college_id WHERE u.id=? AND ${PERSON} AND c.status='active'`, id);
  if (!u) return null;
  const st = compute().get(id) ?? EMPTY;
  const anonymous = !!u.anon;
  const base = {
    id, name: u.name as string, college: { slug: u.cslug as string, name: u.cname as string },
    earned: Math.round(st.earned), shipped: st.shipped, joined: st.joined,
    anonymous, avatar: avatar(u), rank: rank(st),
  };
  // Anonymous: Connect hides the resume, so nothing that could tie the alias to a person or a project.
  if (anonymous) return { ...base, branch: "", classOf: null, projects: [], clubs: [], progress: null };
  const projects = all(
    `SELECT p.id, p.name, p.pitch, p.pot, p.shipped_at, m.role, m.did FROM members m JOIN projects p ON p.id=m.project_id
     JOIN colleges c ON c.id=p.college_id WHERE m.user_id=? AND m.status='active' AND ${SHIPPED} ORDER BY p.shipped_at DESC`, id);
  return {
    ...base, branch: (u.branch || "") as string, classOf: u.grad_year ?? null,
    projects: projects.map((p) => ({
      id: p.id as number, name: p.name as string, pitch: p.pitch as string, verdict: verdict(p.pot), shippedAt: iso(p.shipped_at),
      role: (p.role || "") as string, did: (p.did || "") as string,
      signedBy: get("SELECT COUNT(*) n FROM members WHERE project_id=? AND status='active' AND user_id<>?", p.id, id).n as number,
      proof: all("SELECT label FROM proofs WHERE project_id=?", p.id).map((r) => String(r.label)),
    })),
    clubs: all("SELECT c.name, cm.role FROM club_members cm JOIN clubs c ON c.id=cm.club_id WHERE cm.user_id=? AND cm.confirmed=1 AND c.status='active'", id)
      .map((c) => ({ name: c.name as string, role: c.role as string })),
    progress: history(id, st),
  };
}

/* The Progress tab, as a signed-out visitor sees it: earned credit over time, ranks reached, the latest moves.
   A private or hidden project's name reads "A private project", as on Connect. */
function history(id: number, st: Standing) {
  const secret = new Map<number, string>(
    all("SELECT p.id, p.name FROM members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND p.hidden<>0", id).map((p) => [p.id as number, String(p.name)]));
  const mask = (what: string, pid?: number) => (pid && secret.has(pid) ? what.replace(secret.get(pid)!, "A private project") : what);
  const pr = progressOf(st, now());
  const day = (d: number) => new Date(d * 86400 * 1000).toISOString().slice(0, 10);
  return {
    step: pr.step, // 1: a point per day; 7: per week
    points: pr.points.map((p) => ({ day: day(p.d), credit: p.v })),
    reached: pr.reached.map((r) => ({ at: iso(r.at), tier: tierRef(r.tier) })),
    recent: pr.moments.slice(-8).reverse().map((m) => ({ at: iso(m.at), what: mask(m.what, m.pid), why: m.why, n: m.n, total: m.total })),
  };
}

/* Skills used across shipped projects, most used first. */
export function skills() {
  return all(
    `SELECT ps.skill, COUNT(*) n FROM project_skills ps JOIN projects p ON p.id=ps.project_id JOIN colleges c ON c.id=p.college_id
     WHERE ${SHIPPED} GROUP BY ps.skill ORDER BY n DESC, ps.skill`)
    .map((r) => ({ skill: label(String(r.skill)), projects: r.n as number }));
}

/* Lines members wrote about what they did on a shipped project, signed off by teammates. Shown like testimonials. */
export function signedLines(limit = 6) {
  return all(
    `SELECT u.id uid, u.name, u.photo_key, u.anon, u.alias, m.role, m.did, p.id pid, p.name pname, p.shipped_at,
       (SELECT COUNT(*) FROM members x WHERE x.project_id=p.id AND x.status='active' AND x.user_id<>u.id) signed
     FROM members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id JOIN colleges c ON c.id=p.college_id
     WHERE m.status='active' AND COALESCE(m.did,'')<>'' AND ${SHIPPED} AND ${PERSON} AND ${NAMED}
     ORDER BY signed DESC, p.shipped_at DESC LIMIT ?`, Math.min(Math.max(limit, 1), 20))
    .map((r) => ({
      builder: { id: r.uid as number, name: r.name as string, avatar: avatar(r) }, role: (r.role || "") as string, did: r.did as string,
      project: { id: r.pid as number, name: r.pname as string }, shippedAt: iso(r.shipped_at), signedBy: r.signed as number,
    }));
}

/* The signed-in person, for the account menu on the showcase. Only ever their own details, sent only to them. */
export function account(u: Row | null) {
  if (!u) return { signedIn: false as const };
  const st = compute().get(u.id) ?? EMPTY;
  const c = u.college_id ? get("SELECT slug, name FROM colleges WHERE id=? AND status='active'", u.college_id) : null;
  return {
    signedIn: true as const, id: u.id as number, name: u.name as string, picture: (u.picture || null) as string | null,
    anonymous: !!u.anon, onboarded: !!u.onboarded, verified: !!u.verified, role: (u.role || "student") as string,
    college: c ? { slug: c.slug as string, name: c.name as string } : null,
    earned: Math.round(st.earned), shipped: st.shipped,
    rank: u.verified && u.role === "student" ? rank(st) : null,
  };
}
