import { all, now, type Row } from "./db";
import { RULES, MONTH } from "./rules";
import { shares, type Standing } from "./credit";
import { credWeight } from "./credibility";

/* Competency: how good someone is at one skill, from 0 to 100, with how sure we are.
   A skill only counts when someone else confirmed the person used it: teammates on a shipped project,
   reviewers on a solo one, the client of a commission, or whoever verified a piece of outside evidence.
   The skills a person lists on their own profile are never an input. */

/* ---------- skill names ---------- */
const ALIASES: Record<string, string> = {
  "nextjs": "next.js", "next": "next.js", "reactjs": "react", "react.js": "react", "node.js": "node", "nodejs": "node",
  "js": "javascript", "ts": "typescript", "py": "python", "postgresql": "postgres", "machine learning": "ml",
  "ui/ux": "ui design", "ux": "ui design", "ui": "ui design", "pcb": "pcb design", "3d print": "3d printing",
  "c++": "c++", "cpp": "c++", "embedded": "embedded c", "tf": "tensorflow", "rn": "react native",
};
const LABELS: Record<string, string> = {
  "next.js": "Next.js", "ml": "ML", "ai": "AI", "pcb design": "PCB design", "ui design": "UI design", "esp32": "ESP32", "stm32": "STM32",
  "fpga": "FPGA", "cad": "CAD", "3d printing": "3D printing", "sql": "SQL", "css": "CSS", "html": "HTML", "api": "API", "pid": "PID",
  "ios": "iOS", "fastapi": "FastAPI", "javascript": "JavaScript", "typescript": "TypeScript", "pytorch": "PyTorch", "tensorflow": "TensorFlow",
  "embedded c": "Embedded C", "rfid": "RFID", "matlab": "MATLAB",
};
/* One spelling per skill, so "NextJS" and "next.js" are the same thing. */
export function canon(s: string): string {
  const k = s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 30);
  return ALIASES[k] ?? k;
}
export const label = (k: string) => LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
/* A typed list ("React, Node, figma") as distinct skill names, in the order given. */
export const parseSkills = (text: string, max = 8): string[] =>
  [...new Set(String(text || "").split(/[,\n]/).map(canon).filter((k) => k.length > 1))].slice(0, max);

/* A code sent to a work address proves the person has a mailbox at that company, not what they did there. */
export const WORK_EMAIL_TRUST = 0.7;

/* ---------- the formula ---------- */
export type Evidence = {
  skill: string; q: number; w: number; tier: "A" | "B";
  kind: "project" | "solo" | "commission" | "hackathon" | "internship";
  label: string; at: number;
  ws?: number; // the weight towards the score, which fades more slowly than `w` (the weight towards confidence)
};
export type SkillScore = { skill: string; label: string; score: number; conf: number; band: "low" | "medium" | "high"; why: string; items: Evidence[]; last: number };

/* A weighted average that starts at the prior and needs real weight behind it to move:
   score = (k·prior + Σ ws·q) / (k + Σ ws), confidence = Σ w / (Σ w + k). One lucky project cannot make an expert.
   Old work stops making us sure faster than it stops counting: being busy for a year does not make you worse. */
export function rate(items: { q: number; w: number; ws?: number }[]): { score: number; conf: number } {
  const K = RULES.skill, ws = (i: { w: number; ws?: number }) => i.ws ?? i.w;
  const sw = items.reduce((a, i) => a + i.w, 0), sws = items.reduce((a, i) => a + ws(i), 0), swq = items.reduce((a, i) => a + ws(i) * i.q, 0);
  return { score: (100 * (K.k * K.prior / 100 + swq)) / (K.k + sws), conf: sw / (sw + K.k) };
}
const half = (at: number, t: number, months: number) => Math.pow(0.5, Math.max(0, t - at) / (months * MONTH));
export const recency = (at: number, t: number) => half(at, t, RULES.skill.halfLifeMonths);
export const recencyScore = (at: number, t: number) => half(at, t, RULES.skill.scoreHalfLifeMonths);
export const band = (conf: number): SkillScore["band"] => (conf < RULES.skill.confLow ? "low" : conf < RULES.skill.confHigh ? "medium" : "high");

const NOUN: Record<Evidence["kind"], [string, string]> = {
  project: ["shipped project", "shipped projects"], solo: ["solo project", "solo projects"], commission: ["commission", "commissions"],
  hackathon: ["hackathon", "hackathons"], internship: ["internship", "internships"],
};
/* "based on 3 shipped projects and 1 commission" */
export function reason(items: Evidence[]): string {
  const parts = (Object.keys(NOUN) as Evidence["kind"][]).map((k) => [k, items.filter((i) => i.kind === k).length] as const)
    .filter(([, n]) => n > 0).map(([k, n]) => `${n} ${NOUN[k][n === 1 ? 0 : 1]}`);
  return "based on " + (parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]);
}
export function summarise(items: Evidence[]): Map<string, SkillScore> {
  const by = new Map<string, Evidence[]>();
  for (const i of items) by.set(i.skill, [...(by.get(i.skill) ?? []), i]);
  const out = new Map<string, SkillScore>();
  for (const [skill, list] of by) {
    const r = rate(list);
    out.set(skill, { skill, label: label(skill), score: Math.round(r.score), conf: r.conf, band: band(r.conf), why: reason(list), items: list, last: Math.max(...list.map((i) => i.at)) });
  }
  return out;
}

/* ---------- evidence from the records ---------- */
/* How good the work was, for one person on one shipped project: the reviewers' verdict, nudged by their share. */
export function projectQuality(pot: number, share: number, equal: number): number {
  const K = RULES.skill, base = pot >= RULES.live ? K.qLive : K.qDemo;
  const nudge = Math.max(0.6, Math.min(1.1, 1 - K.shareBoost + K.shareBoost * (share / equal)));
  return Math.min(1, base * nudge);
}

/* A signed-off commission: half from the 1 to 5 rating, a quarter each from "on time" and "matched the brief".
   Commissions signed off before the two questions existed use the rating alone. */
export function commissionQuality(rating: number, onTime?: number | null, matched?: number | null): number {
  const stars = Math.max(1, Math.min(5, rating)) / 5;
  return onTime == null && matched == null ? stars : 0.5 * stars + 0.25 * (onTime ? 1 : 0) + 0.25 * (matched ? 1 : 0);
}

/* Which skills count for whom on a project, and who signed for them. A teammate's skill needs ticks from at least
   half of the others on the team. A solo project needs a tick from one of its reviewers or an admin. */
export function confirmedSkills(team: number[], ticks: Row[], reviewers: Set<number>, admins: Set<number>): Map<number, Map<string, number[]>> {
  const out = new Map<number, Map<string, number[]>>();
  for (const x of team) {
    const others = team.filter((y) => y !== x), solo = team.length === 1;
    const need = solo ? 1 : Math.max(1, Math.ceil(others.length / 2));
    const by = new Map<string, number[]>();
    for (const t of ticks) {
      if (t.user_id !== x || t.by_id === x) continue;
      if (solo ? !(reviewers.has(t.by_id) || admins.has(t.by_id)) : !others.includes(t.by_id)) continue;
      by.set(t.skill, [...new Set([...(by.get(t.skill) ?? []), t.by_id as number])]);
    }
    out.set(x, new Map([...by].filter(([, who]) => who.length >= need)));
  }
  return out;
}

/* Everyone's skill scores, worked out from the raw records. Nothing is stored. */
export function competency(S: Map<number, Standing>): Map<number, Map<string, SkillScore>> {
  const t = now(), K = RULES.skill;
  const items = new Map<number, Evidence[]>();
  const add = (id: number, e: Evidence) => { if (e.w > 0) items.set(id, [...(items.get(id) ?? []), e]); return e; };
  // Weight from age, for both confidence and score.
  const aged = (base: number, at: number) => ({ w: base * recency(at, t), ws: base * recencyScore(at, t) });
  const trust = (ids: number[], admins: Set<number>) =>
    ids.length ? ids.reduce((a, id) => a + (admins.has(id) ? 1 : credWeight(S.get(id)?.cred.score)), 0) / ids.length : 0;

  const admins = new Set<number>(all("SELECT id FROM users WHERE admin=1").map((u) => u.id));
  const members = all("SELECT * FROM members WHERE status='active'"), allocs = all("SELECT * FROM allocations");
  const ticks = all("SELECT * FROM member_skills");
  const reviewers = new Map<number, Set<number>>();
  for (const r of [...all("SELECT project_id, reviewer_id FROM reviews"), ...all("SELECT project_id, reviewer_id FROM review_log")])
    reviewers.set(r.project_id, (reviewers.get(r.project_id) ?? new Set()).add(r.reviewer_id));

  const evenSplit = new Set<number>(all("SELECT target_id FROM revoked WHERE kind='split'").map((r) => r.target_id));
  // Oldest first, so we know whether a tick repeats one the same person gave on an earlier project.
  const ticked = new Set<string>(), key = (by: number, to: number, skill: string) => `${by}>${to}>${skill}`;
  const pairs: { id: number; partner: number; e: Evidence }[] = [];
  for (const p of all("SELECT * FROM projects WHERE status='shipped' AND pot>0 ORDER BY shipped_at, id")) {
    const team = members.filter((m) => m.project_id === p.id).map((m) => m.user_id as number);
    if (!team.length) continue;
    const sh = shares(team, evenSplit.has(p.id) ? [] : allocs.filter((a) => a.project_id === p.id)), equal = 100 / team.length, solo = team.length === 1;
    const ok = confirmedSkills(team, ticks.filter((x) => x.project_id === p.id), reviewers.get(p.id) ?? new Set(), admins);
    const seen: string[] = [];
    for (const id of team) {
      const pct = sh.get(id) ?? 0;
      for (const [skill, who] of ok.get(id) ?? []) {
        // The same people saying the same thing again is weaker news than someone new saying it.
        const repeat = !solo && who.every((b) => ticked.has(key(b, id, skill))) ? K.repeatTick : 1;
        seen.push(...who.map((b) => key(b, id, skill)));
        const base = K.tier.A * (solo ? RULES.soloFactor : Math.min(1, pct / equal)) * trust(who, admins) * repeat;
        const e = add(id, { skill, tier: "A", kind: solo ? "solo" : "project", label: p.name, at: p.shipped_at ?? t, q: projectQuality(p.pot, pct, equal), ...aged(base, p.shipped_at ?? t) });
        if (team.length === 2) pairs.push({ id, partner: team.find((x) => x !== id)!, e });
      }
    }
    for (const k of seen) ticked.add(k);
  }
  // Outside evidence (tier B): checked by an admin, a teammate on Connect, or a code sent to a work email.
  // It can lift a skill, at half the weight of work Connect saw happen.
  for (const e of all("SELECT * FROM evidence WHERE status='verified' AND kind IN ('hackathon','internship')")) {
    const q = e.kind === "hackathon" ? (e.value === "won" ? K.qHackWin : e.value === "finalist" ? K.qHackFinal : K.qHackTookPart) : K.qInternship;
    const by = e.method === "work_email" ? WORK_EMAIL_TRUST : e.method === "admin" ? 1 : credWeight(S.get(e.decided_by)?.cred.score);
    for (const skill of parseSkills(e.skills))
      add(e.user_id, { skill, tier: "B", kind: e.kind === "hackathon" ? "hackathon" : "internship", label: e.title, at: e.created_at, q, ...aged(K.tier.B * by, e.created_at) });
  }
  // Commissions the client signed off (tier A). The quality is the client's rating and their two yes/no answers,
  // and it weighs as much as the client's word can be trusted.
  const cskills = all("SELECT * FROM commission_skills");
  for (const c of all("SELECT * FROM commissions WHERE status='done' AND paid_credit>0 AND rating IS NOT NULL AND doer_id IS NOT NULL")) {
    const w = aged(K.tier.A * credWeight(S.get(c.client_id)?.cred.score), c.closed_at ?? t);
    for (const k of cskills.filter((x) => x.commission_id === c.id))
      add(c.doer_id, { skill: k.skill, tier: "A", kind: "commission", label: c.title, at: c.closed_at ?? t, q: commissionQuality(c.rating, c.on_time, c.matched_brief), ...w });
  }
  // Two people on their own can confirm each other's skills, so a pair's ticks count part until someone outside
  // the pair confirms the same skill: a bigger team, a reviewer, a client or checked outside evidence.
  for (const { id, partner, e } of pairs) {
    const backed = (items.get(id) ?? []).some((x) => x.skill === e.skill && !pairs.some((y) => y.e === x && y.partner === partner));
    if (!backed) { e.w *= K.pairFactor; e.ws = (e.ws ?? e.w) * K.pairFactor; }
  }
  return new Map([...items].map(([id, list]) => [id, summarise(list)]));
}
