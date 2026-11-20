import { RULES, MONTH } from "./rules";

/* Credibility: how much to trust what a person says and signs, from 0 to 100.
   It multiplies the weight of their vouches, reviews, skill ticks and client ratings.
   Nothing a person types about themselves is an input here. */

export type CredInput = {
  shipped: number; left: number; // projects finished, and projects left or dropped as lead
  commDone?: number; commDropped?: number; // commissions signed off, and ones an admin found they let down
  mates: number; // distinct people shipped with
  circle: boolean; ring: boolean;
  reviewsMatched: number; reviewsTotal: number; // reviews that have a final outcome
  evidenceOk: number; evidenceBad: number; // items sent for checking that were verified or rejected
  createdAt: number;
  upheld: number[]; // times of reports an admin upheld against them
};
export type CredLine = { what: string; why: string; n: number };
export type Cred = { score: number; lines: CredLine[]; finishRate: number };

/* A rate that starts at `prior` and moves towards good/total as events come in, so one event cannot swing it. */
export const smoothed = (good: number, total: number, prior: number, k = RULES.cred.k) => (good + k * prior) / (total + k);

export function credibility(i: CredInput, t: number): Cred {
  const C = RULES.cred, W = C.weights;
  const done = i.shipped + (i.commDone ?? 0), ended = done + i.left + (i.commDropped ?? 0);
  const finish = smoothed(done, ended, C.priorFinish);
  const reviews = smoothed(i.reviewsMatched, i.reviewsTotal, C.priorReviews);
  const claims = smoothed(i.evidenceOk, i.evidenceOk + i.evidenceBad, C.priorClaims);
  const months = Math.max(0, t - i.createdAt) / MONTH;
  const age = Math.min(1, months / C.ageFullMonths);
  const breadth = Math.min(1, i.mates / C.breadthFullAt);
  const pts = (w: number, v: number) => Math.round(100 * w * v);
  const lines: CredLine[] = [
    { what: "Finishing what they join", why: ended ? `Finished ${done} of ${ended}${i.commDone || i.commDropped ? ", counting commissions" : ""}` : "Nothing finished or left yet", n: pts(W.finish, finish) },
    { what: "Accurate reviews", why: i.reviewsTotal ? `${i.reviewsMatched} of ${i.reviewsTotal} reviews matched the final outcome` : "No reviews yet", n: pts(W.reviews, reviews) },
    { what: "Evidence that checked out", why: i.evidenceOk + i.evidenceBad ? `${i.evidenceOk} of ${i.evidenceOk + i.evidenceBad} items sent for checking were verified` : "Nothing sent for checking yet", n: pts(W.claims, claims) },
    { what: "Time on Connect", why: months >= C.ageFullMonths ? `Over ${C.ageFullMonths} months` : `${Math.floor(months)} of ${C.ageFullMonths} months`, n: pts(W.age, age) },
    { what: "Different people shipped with", why: `${i.mates} of ${C.breadthFullAt}`, n: pts(W.breadth, breadth) },
  ];
  const reports = i.upheld.reduce((a, at) => a + C.reportPenalty * Math.pow(0.5, Math.max(0, t - at) / (RULES.skill.halfLifeMonths * MONTH)), 0);
  if (reports) lines.push({ what: "Reports upheld by admins", why: `${i.upheld.length} upheld; each fades over time`, n: -Math.round(reports) });
  if (i.circle) lines.push({ what: "Closed circle", why: "All shipped work is with the same one or two people", n: -C.circlePenalty });
  if (i.ring) lines.push({ what: "Vouch ring", why: "A small group that only vouches for each other", n: -C.ringPenalty });
  const score = Math.max(0, Math.min(100, lines.reduce((a, l) => a + l.n, 0)));
  return { score, lines, finishRate: finish };
}

/* Credibility as a multiplier on someone's signature. */
export const credWeight = (score: number | undefined) => Math.max(RULES.cred.floor, (score ?? 0) / 100);

/* Vouch rings: a group of 3 to 6 people who all vouch inside the group, each backed by at least two of the others,
   with no vouch crossing the group's edge and no one having shipped with anyone outside it, that has shipped
   at least `ringMinProjects` team projects with nobody from outside on them. A team that shipped once and vouches
   for each other is just a team; the same closed group shipping again and again is the pattern.
   The moment one of them ships with someone new, the group stops being a ring. */
export function rings(vouches: { from_id: number; to_id: number }[], shippedWith: Map<number, Set<number>>, teams: number[][]): Set<number> {
  const near = new Map<number, Set<number>>(), into = new Map<number, Set<number>>();
  const link = (m: Map<number, Set<number>>, a: number, b: number) => { if (!m.has(a)) m.set(a, new Set()); m.get(a)!.add(b); };
  for (const v of vouches) { link(near, v.from_id, v.to_id); link(near, v.to_id, v.from_id); link(into, v.to_id, v.from_id); }
  const seen = new Set<number>(), out = new Set<number>();
  for (const start of near.keys()) {
    if (seen.has(start)) continue;
    const group = new Set<number>([start]), todo = [start];
    while (todo.length) for (const o of near.get(todo.pop()!) ?? []) if (!group.has(o)) { group.add(o); todo.push(o); }
    for (const g of group) seen.add(g);
    if (group.size < RULES.ringMin || group.size > RULES.ringMax) continue;
    const closed = [...group].every((g) => (into.get(g)?.size ?? 0) >= 2 && [...(shippedWith.get(g) ?? [])].every((o) => group.has(o)));
    const inside = teams.filter((t) => t.length > 1 && t.every((m) => group.has(m))).length;
    if (closed && inside >= RULES.ringMinProjects) for (const g of group) out.add(g);
  }
  return out;
}
