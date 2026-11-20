import { all, get, now } from "./db";
import { deviceName } from "./notify";

/* Admin analytics: how Connect is used, day by day. Counts only, never what anyone wrote.
   A "day" is a calendar day in India time, numbered as days since 1 January 1970. */
const IST = 19800, DAY = 86400;
export const dayOf = (t: number) => Math.floor((t + IST) / DAY);
const D = (col: string) => `((${col}+${IST})/${DAY})`;

export const RANGES: [id: string, label: string, days: number][] = [
  ["7d", "7 days", 7], ["30d", "30 days", 30], ["90d", "90 days", 90], ["1y", "1 year", 365], ["all", "All time", 0],
];

type Metric = {
  id: string; label: string; color: string; about: string;
  /* "total" lines climb (members so far); "count" lines show what happened that day. */
  kind: "total" | "count";
  /* Rows of (d, n). `{C}` becomes the college filter on the alias `u` (people) or `p` (projects). */
  sql: string;
};

const METRICS: Metric[] = [
  { id: "members", label: "Members", color: "green", kind: "total", about: "Everyone who finished signing up, added up over time.",
    sql: `SELECT ${D("u.created_at")} d, COUNT(*) n FROM users u WHERE u.onboarded=1 AND u.deleted=0 {C} GROUP BY d` },
  { id: "active", label: "Active people", color: "blue", kind: "count", about: "People who opened Connect or did something that day.", sql: "" },
  { id: "weekly", label: "Weekly active", color: "indigo", kind: "count", about: "People active at least once in the 7 days up to that day.", sql: "" },
  { id: "signups", label: "Sign-ups", color: "teal", kind: "count", about: "New members who finished signing up.",
    sql: `SELECT ${D("u.created_at")} d, COUNT(*) n FROM users u WHERE u.onboarded=1 AND u.deleted=0 {C} GROUP BY d` },
  { id: "visits", label: "Visits", color: "orange", kind: "count", about: "Times signed-in people opened Connect: a new tab, the installed app, a link or a reload. Moving between pages inside Connect is not counted again. Counted from the day analytics started.",
    sql: `SELECT a.day d, SUM(a.hits) n FROM activity a JOIN users u ON u.id=a.user_id WHERE 1 {C} GROUP BY d` },
  { id: "projects", label: "Projects started", color: "purple", kind: "count", about: "New projects created.",
    sql: `SELECT ${D("p.created_at")} d, COUNT(*) n FROM projects p WHERE p.hidden<>1 {P} GROUP BY d` },
  { id: "shipped", label: "Projects shipped", color: "green", kind: "count", about: "Projects that passed review and shipped.",
    sql: `SELECT ${D("p.shipped_at")} d, COUNT(*) n FROM projects p WHERE p.shipped_at IS NOT NULL AND p.hidden<>1 {P} GROUP BY d` },
  { id: "messages", label: "Messages", color: "blue", kind: "count", about: "Chat messages sent.",
    sql: `SELECT ${D("m.created_at")} d, COUNT(*) n FROM messages m JOIN users u ON u.id=m.from_id WHERE 1 {C} GROUP BY d` },
  { id: "calls", label: "Calls", color: "pink", kind: "count", about: "Voice and video calls started.",
    sql: `SELECT ${D("v.created_at")} d, COUNT(*) n FROM voice_calls v JOIN users u ON u.id=v.caller_id WHERE 1 {C} GROUP BY d` },
  { id: "posts", label: "Posts and questions", color: "orange", kind: "count", about: "Project updates plus questions and answers on projects.",
    sql: `SELECT d, SUM(n) n FROM (
      SELECT ${D("x.created_at")} d, COUNT(*) n FROM updates x JOIN projects p ON p.id=x.project_id WHERE x.created_at IS NOT NULL {P} GROUP BY d
      UNION ALL SELECT ${D("x.created_at")} d, COUNT(*) n FROM comments x JOIN projects p ON p.id=x.project_id WHERE x.created_at IS NOT NULL {P} GROUP BY d
    ) GROUP BY d` },
  { id: "vouches", label: "Vouches", color: "yellow", kind: "count", about: "Members vouching for each other.",
    sql: `SELECT ${D("x.created_at")} d, COUNT(*) n FROM vouches x JOIN users u ON u.id=x.from_id WHERE x.created_at IS NOT NULL {C} GROUP BY d` },
  { id: "follows", label: "Follows", color: "teal", kind: "count", about: "Projects followed.",
    sql: `SELECT ${D("x.created_at")} d, COUNT(*) n FROM follows x JOIN projects p ON p.id=x.project_id WHERE x.created_at IS NOT NULL {P} GROUP BY d` },
  { id: "reviews", label: "Reviews", color: "indigo", kind: "count", about: "Project reviews given by members.",
    sql: `SELECT ${D("x.created_at")} d, COUNT(*) n FROM review_log x JOIN projects p ON p.id=x.project_id WHERE 1 {P} GROUP BY d` },
  { id: "commissions", label: "Commissions", color: "red", kind: "count", about: "Paid or credit commissions posted.",
    sql: `SELECT ${D("p.created_at")} d, COUNT(*) n FROM commissions p WHERE p.hidden=0 {P} GROUP BY d` },
  { id: "feedback", label: "Feedback", color: "purple", kind: "count", about: "Messages sent through the feedback form.",
    sql: `SELECT ${D("p.created_at")} d, COUNT(*) n FROM feedback p WHERE 1 {P} GROUP BY d` },
];
export const METRIC_IDS = METRICS.map((m) => m.id);

/* Who did something on which day: an open page, or any action that leaves a dated row. */
const ACTIVE_PAIRS = `SELECT DISTINCT a.d d, a.uid n FROM (
  SELECT day d, user_id uid FROM activity
  UNION SELECT ${D("created_at")}, from_id FROM messages
  UNION SELECT ${D("created_at")}, caller_id FROM voice_calls
  UNION SELECT ${D("created_at")}, user_id FROM comments WHERE created_at IS NOT NULL
  UNION SELECT ${D("created_at")}, user_id FROM updates WHERE created_at IS NOT NULL AND user_id IS NOT NULL
  UNION SELECT ${D("created_at")}, user_id FROM follows WHERE created_at IS NOT NULL
  UNION SELECT ${D("created_at")}, from_id FROM vouches WHERE created_at IS NOT NULL
  UNION SELECT ${D("created_at")}, user_id FROM feedback
  UNION SELECT ${D("created_at")}, user_id FROM evidence
  UNION SELECT ${D("created_at")}, user_id FROM commission_apps WHERE created_at IS NOT NULL
  UNION SELECT ${D("created_at")}, from_id FROM gifts
  UNION SELECT ${D("created_at")}, reviewer_id FROM review_log
  UNION SELECT ${D("created_at")}, id FROM users WHERE onboarded=1
  UNION SELECT ${D("last_login_at")}, id FROM users WHERE last_login_at IS NOT NULL
) a JOIN users u ON u.id=a.uid WHERE u.deleted=0 AND a.d IS NOT NULL {C}`;

export type Point = { d: number; v: number };
export type Series = { id: string; label: string; color: string; about: string; kind: "total" | "count"; step: number; points: Point[]; total: number; change: number | null };

export function analytics(cid: number | null, range: string) {
  const today = dayOf(now());
  const filter = (sql: string) => sql.replace("{C}", cid ? "AND u.college_id=?" : "").replace(/\{P\}/g, cid ? "AND p.college_id=?" : "");
  const argsFor = (sql: string) => (cid ? Array((sql.match(/\{[CP]\}/g) ?? []).length).fill(cid) : []);
  const rows = (sql: string) => all(filter(sql), ...argsFor(sql)) as { d: number; n: number }[];

  const pairs = rows(ACTIVE_PAIRS).map((r) => ({ d: r.d, u: r.n }));
  const first = Math.min(today, get(filter(`SELECT MIN(${D("u.created_at")}) d FROM users u WHERE 1 {C}`), ...(cid ? [cid] : []))?.d ?? today);
  const r = RANGES.find(([id]) => id === range) ?? RANGES[1];
  const start = r[2] ? today - r[2] + 1 : first;
  const len = today - start + 1;
  // Long ranges are drawn week by week so the line reads as a trend, not noise.
  const step = len > 120 ? 7 : 1;

  const byDay = new Map<number, Set<number>>();
  for (const p of pairs) {
    if (!byDay.has(p.d)) byDay.set(p.d, new Set());
    byDay.get(p.d)!.add(p.u);
  }
  const dau = (d: number) => byDay.get(d)?.size ?? 0;
  const activeIn = (from: number, to: number) => {
    const s = new Set<number>();
    for (let d = from; d <= to; d++) for (const u of byDay.get(d) ?? []) s.add(u);
    return s.size;
  };

  const series: Series[] = METRICS.map((m) => {
    let daily: Map<number, number>;
    if (m.id === "active") daily = new Map([...byDay].map(([d, s]) => [d, s.size]));
    else if (m.id === "weekly") {
      daily = new Map();
      for (let d = start - 7; d <= today; d++) daily.set(d, activeIn(d - 6, d));
    } else daily = new Map(rows(m.sql).map((x) => [x.d, x.n]));
    const at = (d: number) => daily.get(d) ?? 0;
    const sumIn = (a: number, b: number) => { let s = 0; for (const [d, n] of daily) if (d >= a && d <= b) s += n; return s; };
    const before = (d: number) => { let s = 0; for (const [k, n] of daily) if (k < d) s += n; return s; };

    const points: Point[] = [];
    if (m.kind === "total") {
      let run = before(start);
      for (let d = start; d <= today; d++) {
        run += at(d);
        if ((today - d) % step === 0) points.push({ d, v: run });
      }
      const total = run;
      // "All time" has nothing before it to compare with.
      return { ...m, step, points, total, change: r[2] ? total - before(start) : null } satisfies Series;
    }
    for (let d = today - Math.floor((len - 1) / step) * step; d <= today; d += step) {
      // On long ranges a point is the week ending that day: the sum for counts, the distinct people for "active",
      // and the 7-day level itself for "weekly active".
      const from = Math.max(start, d - step + 1);
      const v = m.id === "weekly" ? at(d) : m.id === "active" ? activeIn(from, d) : sumIn(from, d);
      points.push({ d, v });
    }
    const total = m.id === "weekly" ? at(today) : m.id === "active" ? activeIn(start, today) : sumIn(start, today);
    const prev = m.id === "weekly" ? at(start - 1) : m.id === "active" ? activeIn(start - len, start - 1) : sumIn(start - len, start - 1);
    return { ...m, step, points, total, change: r[2] ? total - prev : null } satisfies Series;
  });

  // Headline figures that do not depend on the range.
  const members = series.find((s) => s.id === "members")!.total;
  const dau1 = dau(today), wau = activeIn(today - 6, today), mau = activeIn(today - 29, today);

  // Of the people who joined 8 to 37 days ago, how many came back on a later day.
  const joined = rows(`SELECT u.id d, ${D("u.created_at")} n FROM users u WHERE u.onboarded=1 AND u.deleted=0 AND u.created_at BETWEEN ${(today - 37) * DAY - IST} AND ${(today - 7) * DAY - IST} {C}`);
  const cameBack = joined.filter((j) => pairs.some((p) => p.u === j.d && p.d > j.n)).length;

  const one = (sql: string) => (get(filter(sql), ...argsFor(sql))?.n as number) ?? 0;
  const calls = get(filter(`SELECT COUNT(*) n, SUM(v.answered_at IS NOT NULL) answered, SUM(v.video) video,
      AVG(CASE WHEN v.answered_at IS NOT NULL AND v.ended_at IS NOT NULL THEN v.ended_at-v.answered_at END) secs
      FROM voice_calls v JOIN users u ON u.id=v.caller_id WHERE v.created_at>=${start * DAY - IST} {C}`), ...(cid ? [cid] : []));
  const statuses = rows(`SELECT p.status d, COUNT(*) n FROM projects p WHERE p.hidden<>1 {P} GROUP BY p.status`) as unknown as { d: string; n: number }[];
  const roles = rows(`SELECT u.role d, COUNT(*) n FROM users u WHERE u.onboarded=1 AND u.deleted=0 {C} GROUP BY u.role`) as unknown as { d: string; n: number }[];
  const verified = one(`SELECT COUNT(*) n FROM users u WHERE u.onboarded=1 AND u.deleted=0 AND u.verified=1 {C}`);
  const devices = new Map<string, number>();
  for (const u of all(filter(`SELECT u.last_login_ua ua FROM users u WHERE u.deleted=0 AND u.last_login_ua<>'' {C}`), ...(cid ? [cid] : []))) {
    const label = String(u.ua).includes("/") ? deviceName(u.ua) : String(u.ua);
    devices.set(label, (devices.get(label) ?? 0) + 1);
  }
  // Busiest hours, from messages, posts and calls in the range (India time).
  const hours = Array(24).fill(0) as number[];
  for (const h of rows(`SELECT ((t+${IST})%${DAY})/3600 d, COUNT(*) n FROM (
      SELECT m.created_at t, m.from_id uid FROM messages m UNION ALL SELECT created_at, caller_id FROM voice_calls
      UNION ALL SELECT created_at, user_id FROM comments WHERE created_at IS NOT NULL UNION ALL SELECT created_at, user_id FROM updates WHERE created_at IS NOT NULL
    ) x JOIN users u ON u.id=x.uid WHERE x.t>=${start * DAY - IST} {C} GROUP BY d`)) hours[h.d] = h.n;
  const colleges = cid ? [] : all(`SELECT c.id, c.name,
      (SELECT COUNT(*) FROM users u WHERE u.college_id=c.id AND u.onboarded=1 AND u.deleted=0) members,
      (SELECT COUNT(*) FROM projects p WHERE p.college_id=c.id AND p.hidden<>1) projects,
      (SELECT COUNT(*) FROM projects p WHERE p.college_id=c.id AND p.status='shipped' AND p.hidden=0) shipped
      FROM colleges c WHERE c.status='active' ORDER BY members DESC, c.name LIMIT 50`).map((c) => {
    const ids = new Set(all("SELECT id FROM users WHERE college_id=?", c.id).map((u) => u.id as number));
    const act = new Set<number>();
    for (const p of pairs) if (p.d > today - 30 && ids.has(p.u)) act.add(p.u);
    return { ...c, active: act.size };
  });

  return {
    today, start, step, range: r[0], series,
    now: { members, dau: dau1, wau, mau, stickiness: mau ? Math.round((dau1 / mau) * 100) : 0, verified,
      retention: joined.length ? Math.round((cameBack / joined.length) * 100) : null, retentionOf: joined.length },
    calls: { n: calls?.n ?? 0, answered: calls?.answered ?? 0, video: calls?.video ?? 0, secs: Math.round(calls?.secs ?? 0) },
    statuses: Object.fromEntries(statuses.map((s) => [s.d, s.n])) as Record<string, number>,
    roles: Object.fromEntries(roles.map((s) => [s.d, s.n])) as Record<string, number>,
    devices: [...devices].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    hours, colleges,
  };
}
