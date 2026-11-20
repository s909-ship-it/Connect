import { all, type Row } from "./db";
import { RULES } from "./rules";
import { shares, type Standing } from "./credit";
import { credWeight } from "./credibility";

/* Who reviews a project, how their verdicts become an outcome, and which credit splits deserve a second look. */

/* Everyone each person has ever been on a team with. */
export function teamTies(members: Row[]): Map<number, Set<number>> {
  const byProject = new Map<number, number[]>();
  for (const m of members) byProject.set(m.project_id, [...(byProject.get(m.project_id) ?? []), m.user_id]);
  const T = new Map<number, Set<number>>();
  for (const team of byProject.values()) for (const a of team) for (const b of team) if (a !== b) T.set(a, (T.get(a) ?? new Set()).add(b));
  return T;
}

/* People who may review: verified, enough earned credit, never on the project, and never on a team with anyone
   who is. Friends of the team do not get to decide what the team's work is worth. */
export function eligibleReviewers(pool: Row[], team: number[], ties: Map<number, Set<number>>, S: Map<number, Standing>): number[] {
  const on = new Set(team);
  return pool.filter((u) => u.verified && !u.suspended && !u.deleted && u.role === "student" && !on.has(u.id)
    && (S.get(u.id)?.earned ?? 0) >= RULES.reviewerMin
    && ![...(ties.get(u.id) ?? [])].some((o) => on.has(o))).map((u) => u.id as number);
}

/* Picks up to n people at random, each with a chance in proportion to how far their word can be trusted. */
export function pickWeighted(ids: number[], weight: (id: number) => number, n: number, rnd: () => number = Math.random): number[] {
  const left = ids.map((id) => ({ id, w: Math.max(0.0001, weight(id)) })), out: number[] = [];
  while (left.length && out.length < n) {
    let r = rnd() * left.reduce((a, x) => a + x.w, 0), i = 0;
    while (i < left.length - 1 && (r -= left[i].w) > 0) i++;
    out.push(left.splice(i, 1)[0].id);
  }
  return out;
}
export const pickReviewers = (eligible: number[], S: Map<number, Standing>, rnd?: () => number) =>
  pickWeighted(eligible, (id) => credWeight(S.get(id)?.cred.score), RULES.review.invited, rnd);

/* The outcome of a review round, or null while it is still open.
   An admin's verdict settles it. Otherwise two reviewers who agree settle it; if they disagree a third is needed
   and the middle verdict wins, so a harsh reviewer and a soft one are judged by the same rule. */
export function verdictOf(reviews: { verdict: number; admin?: number | boolean }[]): number | null {
  const admin = reviews.filter((r) => r.admin).pop();
  if (admin) return admin.verdict;
  const v = reviews.map((r) => r.verdict).sort((a, b) => a - b);
  if (v.length < RULES.reviewsNeeded) return null;
  if (v.length === 2) return v[0] === v[1] ? v[0] : null;
  return v[Math.floor((v.length - 1) / 2)];
}

export type SplitFlag = { project_id: number; name: string; user_id: number; share: number; equal: number; why: string };

/* Splits that look wrong: someone got at least twice an equal share, yet nothing on the project's record shows
   them doing anything (no milestone they ticked, no update they posted, and nothing written under "what I did").
   A flag changes no numbers. It puts the split in front of an admin. */
export function splitFlags(collegeId: number): SplitFlag[] {
  const out: SplitFlag[] = [];
  for (const p of all("SELECT id, name FROM projects WHERE status='shipped' AND college_id=? ORDER BY shipped_at DESC LIMIT 200", collegeId)) {
    const team = all("SELECT user_id, did FROM members WHERE project_id=? AND status='active'", p.id);
    if (team.length < 3) continue; // with two people, the only possible split is whatever the other one says
    const sh = shares(team.map((m) => m.user_id), all("SELECT * FROM allocations WHERE project_id=?", p.id)), equal = 100 / team.length;
    const acted = new Set(all("SELECT DISTINCT user_id FROM updates WHERE project_id=? AND user_id IS NOT NULL AND text NOT LIKE '%joined as%'", p.id).map((r) => r.user_id));
    for (const m of team) {
      const share = sh.get(m.user_id) ?? 0;
      if (share < RULES.review.splitFlagAt * equal) continue;
      const missing = [!acted.has(m.user_id) && "no milestone or update from them", !String(m.did || "").trim() && "nothing written under “what I did”"].filter(Boolean);
      if (missing.length) out.push({ project_id: p.id, name: p.name, user_id: m.user_id, share, equal, why: missing.join(", ") });
    }
  }
  return out;
}
