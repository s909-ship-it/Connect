import { all, get, now } from "@/lib/db";

const DAY = 86400;

/* A college at a glance, for its admins: who is here, what is being built, and what ships. Counts only, never names. */
export function CollegeOverview({ cid }: { cid: number }) {
  const n = (sql: string, ...a: unknown[]): number => get(sql, ...a)?.n ?? 0;
  const t = now();
  const students = n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='student' AND verified=1 AND suspended=0 AND deleted=0", cid);
  const newStudents = n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='student' AND verified=1 AND deleted=0 AND created_at>?", cid, t - 30 * DAY);
  const alumni = n("SELECT COUNT(*) n FROM users WHERE college_id=? AND role='alum' AND verified=1 AND deleted=0", cid);
  const onProject = n(
    `SELECT COUNT(DISTINCT m.user_id) n FROM members m JOIN projects p ON p.id=m.project_id JOIN users u ON u.id=m.user_id
     WHERE p.college_id=? AND m.status='active' AND p.status IN ('recruiting','building','review') AND u.role='student' AND u.deleted=0`, cid);
  const byStatus = new Map(all("SELECT status, COUNT(*) n FROM projects WHERE college_id=? AND hidden<>1 GROUP BY status", cid).map((r) => [r.status as string, r.n as number]));
  const open = (byStatus.get("recruiting") ?? 0) + (byStatus.get("building") ?? 0);
  const shipped90 = n("SELECT COUNT(*) n FROM projects WHERE college_id=? AND status='shipped' AND shipped_at>?", cid, t - 90 * DAY);
  const openRoles = n("SELECT COUNT(*) n FROM roles r JOIN projects p ON p.id=r.project_id WHERE p.college_id=? AND r.open=1 AND p.hidden<>1 AND p.status IN ('recruiting','building')", cid);

  // Skills students list about themselves: what the college has on paper, before anyone confirms it.
  const tally = new Map<string, { label: string; n: number }>();
  for (const u of all("SELECT skills FROM users WHERE college_id=? AND role='student' AND verified=1 AND deleted=0 AND skills<>''", cid))
    for (const raw of String(u.skills).split(",")) {
      const label = raw.trim(), key = label.toLowerCase();
      if (!label || label.length > 40) continue;
      const e = tally.get(key) ?? { label, n: 0 };
      e.n++;
      tally.set(key, e);
    }
  // Only skills two or more students share say something about the college; one-offs are noise.
  const skills = [...tally.values()].filter((s) => s.n >= 2).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label)).slice(0, 8);
  const top = skills[0]?.n ?? 1;
  const pct = students ? Math.round((onProject / students) * 100) : 0;

  const figures: [value: string, label: string][] = [
    [String(students), newStudents ? `verified members, ${newStudents} new this month` : "verified members"],
    [`${pct}%`, `of members on an open project (${onProject})`],
    [String(open), byStatus.get("review") ? `projects open, ${byStatus.get("review")} in review` : "projects open"],
    [String(byStatus.get("shipped") ?? 0), shipped90 ? `shipped, ${shipped90} in the last 90 days` : "shipped"],
  ];
  return (
    <section className="card overview" aria-labelledby="overview-h">
      <div className="row between">
        <h2 id="overview-h">Your community at a glance</h2>
        <span className="small muted">{alumni} approved alumni · {openRoles} open roles</span>
      </div>
      <div className="ov-figures">
        {figures.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
      </div>
      {skills.length === 0 && tally.size > 0 && <span className="small muted">No skill is listed by more than one member yet.</span>}
      {skills.length > 0 && (
        <div className="stack tight">
          <span className="small muted">Skills members list most (self-listed, not yet confirmed)</span>
          <ul className="ov-skills">
            {skills.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className="ov-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, Math.round((s.n / top) * 100))}%` }} /></span>
                <span className="mono">{s.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
