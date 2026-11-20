import { RULES } from "./rules";
import { roleSkills, fitFor } from "./match";
import { canon, label, type SkillScore } from "./skills";

/* Relevance: how well a person fits one role or commission.
   It is built from skill scores other people confirmed, whether the person finishes what they join, and whether
   they have room for more work. The skills a person lists themselves never rank them. */

export type Need = { skill: string; importance: number };
/* `all`: the lead listed the skills, so each one matters by its importance.
   `any`: the skills were guessed from the role's title, so they are alternatives and the best two count. */
export type Needs = { mode: "all" | "any"; list: Need[] };

export type Person = {
  id: number;
  skills: Map<string, SkillScore> | undefined; // confirmed skills, from competency()
  listed: string[]; // what they typed on their profile: used only to find newcomers, never to rank
  finishRate: number; finished: number; ended: number; // smoothed rate, and the plain counts for the explanation
  open: boolean; load: number; // marked open to projects; active projects and commissions right now
  shippedWith?: string; // "BusPing with Riya", when they have shipped with someone already on the team
};
export type Fit = { id: number; score: number; reason: string; matched: string[] };

/* A typed list, most important first: the first skill is a must (3), the second matters (2), the rest help (1). */
export const needsFromList = (skills: string[]): Need[] => skills.map((s, i) => ({ skill: canon(s), importance: Math.max(1, 3 - i) }));

/* What a role needs: the skills its lead listed, or a guess from its title when there are none. */
export function needsFor(title: string, listed: Need[]): Needs {
  if (listed.length) return { mode: "all", list: listed };
  return { mode: "any", list: [...new Set([...roleSkills(title)].map(canon))].map((skill) => ({ skill, importance: 2 })) };
}

/* Ranked by how much of a score is backed by evidence: the starting score, plus the distance above it times how
   sure we are. A 90 from one old project ranks below a 50 with recent work behind it. A needed skill with no
   proof at all counts as half the starting score. */
const worth = (s: SkillScore | undefined) => {
  const P = RULES.skill.prior;
  return s ? (P + (s.score - P) * s.conf) / 100 : (P / 100) * RULES.fit.missing;
};
export function availability(open: boolean, load: number): number {
  const F = RULES.fit;
  return (open ? 1 : F.notOpen) * Math.max(F.loadMin, 1 - F.loadStep * Math.max(0, load - F.freeLoad));
}

/* A person's fit, or null when nothing anyone confirmed matches what is needed. */
export function fit(needs: Needs, p: Person): Fit | null {
  const have = needs.list.filter((n) => p.skills?.has(n.skill));
  if (!have.length) return null;
  let skillFit: number;
  if (needs.mode === "all") {
    const total = needs.list.reduce((a, n) => a + n.importance, 0);
    skillFit = needs.list.reduce((a, n) => a + n.importance * worth(p.skills?.get(n.skill)), 0) / total;
  } else {
    const best = have.map((n) => worth(p.skills!.get(n.skill))).sort((a, b) => b - a).slice(0, 2);
    skillFit = (best[0] + (best[1] ?? worth(undefined))) / 2;
  }
  const score = skillFit * p.finishRate * availability(p.open, p.load) * (1 + (p.shippedWith ? RULES.fit.teamBonus : 0));
  // The explanation is made from the same records as the score.
  const top = [...have].sort((a, b) => b.importance * worth(p.skills!.get(b.skill)) - a.importance * worth(p.skills!.get(a.skill))).slice(0, 2);
  const proof = top.map((n) => { const s = p.skills!.get(n.skill)!; return `${label(n.skill)} ${s.score}, ${s.why.replace("based on ", "from ")}`; });
  const bits = [
    proof.join("; "),
    p.ended ? `finished ${p.finished} of ${p.ended} joined` : "nothing finished or left yet",
    p.shippedWith && `shipped ${p.shippedWith}`,
    p.load > RULES.fit.freeLoad && `busy: on ${p.load} things now`,
    !p.open && "not marked open to projects",
  ].filter(Boolean);
  return { id: p.id, score, reason: "Fits: " + bits.join(" · "), matched: have.map((n) => n.skill) };
}

/* Ranked suggestions, plus newcomers: people nobody has confirmed anything for yet, who listed a matching skill.
   Newcomers are shown apart and in no order, so they can be found without a typed word outranking proof. */
export function rank(needs: Needs, title: string, people: Person[], limit = 4): { ranked: Fit[]; fresh: Fit[] } {
  const ranked: Fit[] = [], fresh: Fit[] = [];
  const wanted = new Set(needs.list.map((n) => n.skill));
  for (const p of people) {
    const f = fit(needs, p);
    if (f) { ranked.push(f); continue; }
    const says = needs.mode === "all" ? p.listed.filter((k) => wanted.has(canon(k))) : fitFor(title, p.listed);
    if (says.length) fresh.push({ id: p.id, score: 0, matched: says.map(canon), reason: `New here: lists ${says.join(", ")}, with no proof yet` });
  }
  return { ranked: ranked.sort((a, b) => b.score - a.score).slice(0, limit), fresh: fresh.sort((a, b) => a.id - b.id).slice(0, limit) };
}

/* For the board: which of a person's skills (confirmed or listed) an open role asks for. This only filters
   the viewer's own board, so their listed skills are allowed here. */
export function fitsMe(needs: Needs, title: string, mine: string[]): string[] {
  if (needs.mode === "any") return fitFor(title, mine);
  const wanted = new Set(needs.list.map((n) => n.skill));
  return mine.filter((k) => wanted.has(canon(k)));
}
