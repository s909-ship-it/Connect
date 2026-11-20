import type { Line, Standing } from "./credit";
import { TIERS, type Tier } from "./tiers";

/* A person's progress over time, built from their credit ledger: every dated gain or loss in order, the running total
   after each, the moments they reached a new tier, and a day-by-day line for the graph. Only earned credit counts:
   stakes held, commission rewards set aside and gifts change what someone can spend, not what they have earned.
   Amounts are today's values: a project that has faded with age shows what it counts for now. */
export type Moment = { at: number; what: string; why: string; n: number; total: number; pid?: number; shipped?: boolean };
export type Reached = { at: number; tier: Tier };
export type Progress = { moments: Moment[]; reached: Reached[]; points: { d: number; v: number }[]; step: number };

const IST = 19800, DAY = 86400;
export const dayOf = (t: number) => Math.floor((t + IST) / DAY);

export function progressOf(s: Pick<Standing, "ledger">, today: number): Progress {
  // One moment per dated part. Undated earned lines (none today) go at the end so the total still adds up.
  const parts: Omit<Moment, "total">[] = [];
  for (const l of s.ledger as Line[]) {
    if (l.held || l.n === 0) continue;
    if (l.steps?.length) for (const st of l.steps) parts.push({ at: st.at, what: l.what, why: l.why, n: st.n, pid: l.pid });
    else parts.push({ at: l.at ?? today, what: l.what, why: l.why, n: l.n, pid: l.pid, shipped: / shipped$/.test(l.what) });
  }
  parts.sort((a, b) => a.at - b.at);
  let total = 0, shipped = 0, reachedIdx = 0;
  const moments: Moment[] = [], reached: Reached[] = [];
  for (const p of parts) {
    total += p.n;
    if (p.shipped) shipped++;
    moments.push({ ...p, total: Math.max(0, total) });
    // A tier is reached the first time both its credit and its shipped projects are met. Tiers are never lost here:
    // the history shows when each was first reached, even if credit later dipped.
    for (let i = reachedIdx + 1; i < TIERS.length; i++) {
      if (Math.max(0, total) >= TIERS[i].min && shipped >= TIERS[i].shipped) { reached.push({ at: p.at, tier: TIERS[i] }); reachedIdx = i; }
      else break;
    }
  }

  // The graph: earned credit at the end of each day from the first moment to today. Long histories go week by week.
  const points: { d: number; v: number }[] = [];
  const end = dayOf(today), start = moments.length ? Math.min(dayOf(moments[0].at), end) : end;
  const len = end - start + 1, step = len > 120 ? 7 : 1;
  let i = 0, run = 0;
  for (let d = end - Math.floor((len - 1) / step) * step; d <= end; d += step) {
    while (i < moments.length && dayOf(moments[i].at) <= d) run = moments[i++].total;
    points.push({ d, v: run });
  }
  if (points.length === 1) points.unshift({ d: points[0].d - 1, v: 0 });
  return { moments, reached, points, step };
}
