import Link from "next/link";
import { redirect } from "next/navigation";
import { all, now } from "@/lib/db";
import { currentUser, standings, skillScores } from "@/lib/auth";
import { collegeById, isMember } from "@/lib/college";
import { EMPTY, RULES } from "@/lib/credit";
import { ties, pathTo } from "@/lib/graph";
import { timeAgo } from "@/lib/notify";
import { needsFor, fitsMe, type Need } from "@/lib/relevance";
import { rankBoard, viewerSignals, type FeedProject } from "@/lib/feed";
import { Board, Count, type BoardItem } from "./client";
import { Landing } from "./landing";

/* Below this many verified students, the board asks people to bring their classmates. */
const INVITE_UNTIL = 25;
import { Av, skillsOf } from "./ui";
import { ShareLink } from "./messages/media";

export default async function Home({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const me = await currentUser();
  if (!me) return <Landing />;
  if (!me.onboarded || !isMember(me)) redirect("/onboarding");
  const cid = me.college_id, college = collegeById(cid)!;
  const S = standings(), mine = S.get(me.id) ?? EMPTY;
  const canReview = !!me.verified && (!!me.admin || mine.earned >= RULES.reviewerMin);

  const members = all("SELECT m.project_id, u.id, u.name, u.picture FROM members m JOIN users u ON u.id=m.user_id JOIN projects p ON p.id=m.project_id WHERE m.status='active' AND p.college_id=?", cid);
  const roles = all("SELECT r.id, r.project_id, r.title FROM roles r JOIN projects p ON p.id=r.project_id WHERE r.open=1 AND p.college_id=?", cid);
  const ms = new Map(all("SELECT project_id, COUNT(*) total, SUM(done) done FROM milestones GROUP BY project_id").map((m) => [m.project_id, m]));
  const funded = new Set(all("SELECT project_id FROM grants").map((g) => g.project_id));
  const last = new Map(all("SELECT project_id, MAX(created_at) t FROM updates GROUP BY project_id").map((x) => [x.project_id, x.t]));
  // "Fits you" looks at the skills others confirmed for you first, then the ones you listed.
  const mySkills = me.role === "student" ? [...new Set([...[...(skillScores().get(me.id)?.values() ?? [])].sort((a, b) => b.score - a.score).map((k) => k.label), ...skillsOf(me)])] : [];
  const needs = new Map<number, Need[]>();
  for (const n of all("SELECT rs.* FROM role_skills rs JOIN roles r ON r.id=rs.role_id JOIN projects p ON p.id=r.project_id WHERE r.open=1 AND p.college_id=? ORDER BY rs.importance DESC", cid))
    needs.set(n.role_id, [...(needs.get(n.role_id) ?? []), { skill: n.skill, importance: n.importance }]);
  const followed = new Set(all("SELECT project_id FROM follows WHERE user_id=?", me.id).map((r) => r.project_id as number));
  const items: BoardItem[] = all("SELECT * FROM projects WHERE college_id=? ORDER BY created_at DESC", cid)
    .map((p) => {
      const team = members.filter((m) => m.project_id === p.id).map(({ id, name, picture }) => ({ id, name, picture }));
      const openRoles = roles.filter((r) => r.project_id === p.id), open = openRoles.map((r) => r.title);
      const t = Math.max(last.get(p.id) ?? 0, p.created_at ?? 0);
      const live = p.status === "recruiting" || p.status === "building";
      return {
        id: p.id, name: p.name, pitch: p.pitch, status: p.status, hidden: p.hidden, image: p.image ?? null,
        done: ms.get(p.id)?.done ?? 0, total: ms.get(p.id)?.total ?? 0, team,
        open, funded: funded.has(p.id), mine: team.some((u) => u.id === me.id), followed: followed.has(p.id),
        fit: [...new Set(openRoles.flatMap((r) => fitsMe(needsFor(r.title, needs.get(r.id) ?? []), r.title, mySkills)))],
        active: live && t ? timeAgo(t) : "", quiet: live && t > 0 && now() - t > 14 * 86400,
      };
    })
    .filter((p) => !p.hidden || p.mine || me.admin);

  // People two steps away: shipped with someone you shipped with.
  const T = ties();
  const names = new Map(all("SELECT id, name FROM users WHERE college_id=?", cid).map((u) => [u.id, u.name]));

  // For you: this person's own order of the board, with the reason for each card (lib/feed.ts).
  const raw = new Map(all("SELECT id, lead_id, created_at FROM projects WHERE college_id=?", cid).map((p) => [p.id as number, p]));
  const skillsOfProject = new Map<number, string[]>();
  for (const r of all("SELECT ps.project_id, ps.skill FROM project_skills ps JOIN projects p ON p.id=ps.project_id WHERE p.college_id=?", cid))
    skillsOfProject.set(r.project_id, [...(skillsOfProject.get(r.project_id) ?? []), r.skill]);
  for (const r of roles) for (const n of needs.get(r.id) ?? [])
    if (!skillsOfProject.get(r.project_id)?.includes(n.skill)) skillsOfProject.set(r.project_id, [...(skillsOfProject.get(r.project_id) ?? []), n.skill]);
  const second = new Map<number, string>();
  for (const [mid, tiesWith] of T.get(me.id) ?? []) {
    if (!tiesWith.some((x) => x.shipped)) continue;
    for (const [other, t2] of T.get(mid) ?? []) if (other !== me.id && t2.some((x) => x.shipped) && !second.has(other)) second.set(other, names.get(mid) ?? "");
  }
  const feedProjects: FeedProject[] = items.filter((p) => !p.hidden).map((p) => ({
    id: p.id, lead: raw.get(p.id)?.lead_id ?? 0, status: p.status, created: raw.get(p.id)?.created_at ?? 0,
    lastActive: Math.max(last.get(p.id) ?? 0, raw.get(p.id)?.created_at ?? 0), team: p.team.map((u) => u.id),
    openRoles: p.open.length, fit: p.fit, skills: skillsOfProject.get(p.id) ?? [], followed: !!p.followed, mine: p.mine,
  }));
  const ranked = me.role === "student"
    ? rankBoard(feedProjects, { id: me.id, direct: new Set(T.get(me.id)?.keys() ?? []), second, names, ...viewerSignals(me.id, skillsOfProject) })
    : [];
  const forYou = ranked.map((r) => ({ id: r.id, why: r.why }));
  const near = all("SELECT * FROM users WHERE role='student' AND verified=1 AND suspended=0 AND college_id=? AND id<>?", cid, me.id)
    .filter((u) => !T.get(me.id)?.has(u.id))
    .map((u) => ({ u, path: pathTo(T, me.id, u.id, names) }))
    .filter((x) => !x.path.startsWith("No one"))
    .slice(0, 3);
  const feed = all(
    `SELECT up.*, p.name FROM updates up JOIN projects p ON p.id=up.project_id
     WHERE p.hidden=0 AND p.status<>'dropped' AND p.college_id=? ORDER BY up.created_at DESC, up.id DESC LIMIT 8`, cid);

  const classmates = Number(all("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='student' AND verified=1 AND suspended=0 AND deleted=0", cid)[0]?.n ?? 0);
  return (
    <>
      <div className="head">
        <div className="stack tight">
          <span className="label college-tag">{college.name}</span>
          <h1>Projects in your community</h1>
          <p>One board for everyone at {college.name}, and only them. Every project shows who is on it, what is built so far and what it still needs.</p>
        </div>
        {me.role === "student" && <Link className="btn" href="/projects/new">Post a project</Link>}
      </div>
      {me.role === "student" && (() => {
            const steps: [boolean, string, string][] = [
              [!!me.verified, "Verify your college or work email", "/onboarding"],
              [!!(me.skills && (me.github || me.linkedin)), "Add your skills and a GitHub or LinkedIn link", "/onboarding?edit=1"],
              [mine.joined > 0, "Join a project or post your own", items.some((p) => p.open.length) ? "/?f=open" : "/projects/new"],
              [mine.shipped > 0, "Ship it and get it reviewed", "/credit"],
            ];
            const left = steps.filter((x) => !x[0]).length;
            if (!left) return null;
            return (
              <div className="card start">
                <span className="label">Getting started · {steps.length - left} of {steps.length}</span>
                <span className="meter"><b style={{ width: `${(100 * (steps.length - left)) / steps.length}%` }} /></span>
                <div className="steps-row">
                {steps.map(([ok, label, href]) => (
                  <Link key={label} href={href} className={`step ${ok ? "ok" : ""}`}>
                    <span aria-hidden="true">{ok ? "✓" : "○"}</span>{label}
                  </Link>
                ))}
                </div>
              </div>
            );
          })()}
      <div className="cols">
        <Board items={items} canReview={canReview} forYou={forYou} initial={(await searchParams).f ?? (forYou.length ? "foryou" : "all")} />
        <aside className="stack">
          {classmates < INVITE_UNTIL && (
            <div className="card invite">
              <span className="label">{college.name} is new on Connect</span>
              <p className="small">{classmates <= 1 ? "You are the first one here." : `${classmates} members are here so far.`} A board works when the rest of your community is on it. Send them the link.</p>
              <ShareLink path={`/c/${college.slug}`} title={`${college.name} on Connect`} text={`Join ${college.name} on Connect: find teammates and earn credit only for what ships.`} label="Invite your community" />
            </div>
          )}
          {me.role === "student" && (
            <div className="card">
              <span className="label">Your standing</span>
              <div className="stat"><b><Count to={mine.credit} /></b><span className="muted small">credit</span></div>
              <span className="small muted">{mine.shipped} shipped of {mine.joined} joined</span>
              <Link href="/credit">See your ledger</Link>
            </div>
          )}
          {feed.length > 0 && (
            <div className="card">
              <span className="label">Happening in your community</span>
              <div className="feed">
                {feed.map((x) => (
                  <div key={x.id} className={`item ${x.kind === "post" ? "post" : x.text.startsWith("Shipped") ? "ship" : ""}`}>
                    <span className="dot" />
                    <span><Link href={`/projects/${x.project_id}`}>{x.name}</Link> <span className="muted">· {timeAgo(x.created_at)}</span><br />{x.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {near.length > 0 && (
            <div className="card">
              <span className="label">People you could build with</span>
              {near.map(({ u, path }) => (
                <div key={u.id} className="row nowrap" style={{ alignItems: "start" }}>
                  <Av u={u} />
                  <div className="stack" style={{ gap: 2 }}><Link href={`/u/${u.id}`}>{u.name}</Link><span className="small muted">{path}</span></div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
