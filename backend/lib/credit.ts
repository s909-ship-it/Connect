import { all, now, type Row } from "./db";
import { RULES, MONTH } from "./rules";
import { credibility, credWeight, rings, type Cred } from "./credibility";
import { HOLDING } from "./commissions";

export { RULES } from "./rules";

/* One ledger line. `held` lines change what you can use, never what you have earned: credit set aside for now
   (a stake, a commission's reward), credit spent on a commission, and gifts sent or received. */
export type Line = {
  what: string; why: string; n: number; held?: boolean;
  /* When it happened, for the history on profiles (unset: right now, like a stake still held). */
  at?: number;
  /* The project it came from, so a private project's name can be left out for people outside it. */
  pid?: number;
  /* A line that adds up several moments, like accurate reviews month by month: each part with its date. */
  steps?: { at: number; n: number }[];
};
export type Standing = {
  credit: number; // what you can stake, escrow or send right now
  earned: number; // everything earned from verified work, less penalties. Spending does not lower it.
  base: number; ledger: Line[];
  shipped: number; building: number; left: number; joined: number;
  circle: boolean; ring: boolean; mates: Set<number>;
  cred: Cred; // credibility, 0 to 100, with the lines that explain it
};
const NO_CRED: Cred = { score: 0, lines: [], finishRate: RULES.cred.priorFinish };
const blank = (): Standing => ({ credit: 0, earned: 0, base: 0, ledger: [], shipped: 0, building: 0, left: 0, joined: 0, circle: false, ring: false, mates: new Set(), cred: NO_CRED });

/* Each member's share of a shipped project, in percent.
   Your share is the middle value of what your teammates gave you, then scaled so shares sum to 100.
   A teammate who has not filled in a split counts as giving everyone else an equal part. */
export function shares(ids: number[], allocs: Row[]): Map<number, number> {
  const out = new Map<number, number>();
  if (ids.length === 1) return out.set(ids[0], 100);
  const by = new Map<number, Map<number, number>>();
  for (const a of allocs) {
    if (!by.has(a.from_id)) by.set(a.from_id, new Map());
    by.get(a.from_id)!.set(a.to_id, a.pct);
  }
  const even = 100 / (ids.length - 1);
  const raw = new Map<number, number>();
  for (const x of ids) {
    const v = ids.filter((y) => y !== x).map((y) => (by.has(y) ? by.get(y)!.get(x) ?? 0 : even)).sort((a, b) => a - b);
    raw.set(x, v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  }
  const total = [...raw.values()].reduce((a, b) => a + b, 0);
  for (const x of ids) out.set(x, total ? (raw.get(x)! / total) * 100 : 100 / ids.length);
  return out;
}

export function projectShares(projectId: number): Map<number, number> {
  const ids = all("SELECT user_id FROM members WHERE project_id=? AND status='active'", projectId).map((r) => r.user_id);
  return shares(ids, all("SELECT * FROM allocations WHERE project_id=?", projectId));
}

/* Works out everyone's standing from the raw records. Nothing is stored, so it cannot drift. */
export function compute(): Map<number, Standing> {
  const S = new Map<number, Standing>();
  const users = all("SELECT id, verified, role, created_at FROM users");
  const t = now();
  for (const u of users) {
    const s = blank();
    if (u.verified && u.role === "student") s.ledger.push({ what: "Starter credit", why: "Community email verified", n: RULES.starter, at: u.created_at });
    S.set(u.id, s);
  }
  const projects = all("SELECT * FROM projects");
  const members = all("SELECT * FROM members");
  const allocs = all("SELECT * FROM allocations");
  const fadeBefore = now() - RULES.fadeMonths * 30 * 86400;
  const shippedWith = new Map<number, Set<number>>();
  const teams: number[][] = []; // the active team of every shipped project, for ring detection
  // What admins took back after upholding a report: every vouch to or from a person, or a project's split.
  const revoked = all("SELECT kind, target_id FROM revoked");
  const noVouches = new Set<number>(revoked.filter((r) => r.kind === "vouches").map((r) => r.target_id));
  const evenSplit = new Set<number>(revoked.filter((r) => r.kind === "split").map((r) => r.target_id));
  // Spot checks: an admin's verdict on a shipped project replaces the reviewers'. The pot on the project is already
  // the admin's; the old one is kept so the ledger can say what changed.
  // When a lead dropped a project: the note it left on the project's page.
  const droppedAt = new Map<number, number>(all("SELECT project_id, MAX(created_at) t FROM updates WHERE text='Dropped by the lead' GROUP BY project_id").map((r) => [r.project_id, r.t]));
  const audits = new Map<number, Row>();
  for (const a of all("SELECT * FROM audits ORDER BY created_at")) audits.set(a.project_id, a);

  for (const p of projects) {
    const team = members.filter((m) => m.project_id === p.id);
    const active = team.filter((m) => m.status === "active").map((m) => m.user_id as number);
    for (const m of team) {
      const s = S.get(m.user_id);
      if (!s) continue;
      s.joined++;
      if (m.status === "left") {
        s.left++;
        if (m.stake) s.ledger.push({ what: `${p.name}: stake lost`, why: "Left before it shipped", n: -m.stake, at: m.left_at ?? p.created_at, pid: p.id });
      } else if (p.status === "dropped") {
        if (m.user_id === p.lead_id) {
          s.left++;
          s.ledger.push({ what: `${p.name}: dropped`, why: "Dropped by its lead", n: -RULES.stake, at: droppedAt.get(p.id) ?? p.created_at, pid: p.id });
        }
      } else if (p.status === "shipped") {
        s.shipped++;
      } else {
        s.building++;
        if (m.stake) s.ledger.push({ what: `${p.name}: stake held`, why: "Returned when it ships", n: -m.stake, held: true, pid: p.id });
      }
    }
    if (p.status !== "shipped") continue;
    const sh = shares(active, evenSplit.has(p.id) ? [] : allocs.filter((a) => a.project_id === p.id));
    const solo = active.length === 1;
    const faded = (p.shipped_at ?? 0) < fadeBefore;
    teams.push(active);
    const audit = audits.get(p.id);
    const notes = (faded ? ", faded by age" : "") + (evenSplit.has(p.id) ? ", split reset to equal by an admin" : "")
      + (audit && audit.old_pot !== audit.verdict ? `, pot changed by an admin spot check from ${audit.old_pot}` : "");
    for (const id of active) {
      const s = S.get(id);
      if (!s) continue;
      const pct = sh.get(id)!;
      const n = Math.round(p.pot * (pct / 100) * (solo ? RULES.soloFactor : 1) * (faded ? 0.5 : 1));
      const why = solo ? `Solo project, half of a ${p.pot} pot` : `${Math.round(pct)}% of a ${p.pot} pot, set by teammates`;
      s.ledger.push({ what: `${p.name} shipped`, why: why + notes, n, at: p.shipped_at ?? p.created_at, pid: p.id });
      if (!shippedWith.has(id)) shippedWith.set(id, new Set());
      for (const o of active) if (o !== id) { s.mates.add(o); shippedWith.get(id)!.add(o); }
    }
  }
  for (const r of all("SELECT r.user_id, r.project_id, p.name FROM requests r JOIN projects p ON p.id=r.project_id WHERE r.status='pending'")) {
    S.get(r.user_id)?.ledger.push({ what: `${r.name}: stake held`, why: "Waiting for the team to answer", n: -RULES.stake, held: true, pid: r.project_id });
  }
  // Reviews that have a final outcome. New ones are logged when a round is decided; older ones are judged against the pot.
  const judged = new Map<number, { matched: number; total: number }>();
  const judge = (id: number, ok: boolean) => {
    const j = judged.get(id) ?? { matched: 0, total: 0 };
    j.total++; if (ok) j.matched++;
    judged.set(id, j);
  };
  // Accuracy only means something when the outcome did not come from the reviewer themselves. Two reviewers who
  // agree decide the round, so neither is judged by it. A round counts when it went to a tie-break (for everyone
  // except whoever broke the tie) or when an admin spot-checked the project (for every reviewer, against the admin).
  // Rounds logged before this rule have no `decider` and are judged as they were.
  const log = all("SELECT * FROM review_log ORDER BY created_at");
  const logged = new Set(log.map((r) => r.project_id));
  const truth = (r: Row) => (r.outcome > 0 && audits.has(r.project_id) ? audits.get(r.project_id)!.verdict : r.outcome);
  const rounds = new Map<string, Row[]>();
  for (const r of log) rounds.set(`${r.project_id}:${r.created_at}`, [...(rounds.get(`${r.project_id}:${r.created_at}`) ?? []), r]);
  for (const rs of rounds.values()) {
    const checked = rs[0].outcome > 0 && audits.has(rs[0].project_id), old = rs.every((r) => r.decider == null);
    for (const r of rs) if (checked || old || (rs.length > RULES.reviewsNeeded && !r.decider)) judge(r.reviewer_id, r.verdict === truth(r));
  }
  const pots = new Map(projects.filter((p) => p.status === "shipped").map((p) => [p.id, p.pot]));
  for (const r of all("SELECT * FROM reviews")) if (pots.has(r.project_id) && !logged.has(r.project_id)) judge(r.reviewer_id, r.verdict === pots.get(r.project_id));

  // A review that matched the outcome earns a little, up to a cap every 30 days.
  const rewards = new Map<number, Map<number, number>>();
  const lastIn = new Map<string, number>(); // the latest rewarded review in each 30 days, for the history
  for (const r of log) {
    if (r.verdict !== truth(r)) continue;
    const m = rewards.get(r.reviewer_id) ?? new Map<number, number>(), w = Math.floor(r.created_at / MONTH);
    rewards.set(r.reviewer_id, m.set(w, Math.min(RULES.reviewRewardCap, (m.get(w) ?? 0) + RULES.reviewReward)));
    lastIn.set(`${r.reviewer_id}:${w}`, Math.max(lastIn.get(`${r.reviewer_id}:${w}`) ?? 0, r.created_at));
  }
  for (const [id, m] of rewards) {
    const n = [...m.values()].reduce((a, b) => a + b, 0);
    const steps = [...m].map(([w, k]) => ({ at: lastIn.get(`${id}:${w}`) ?? w * MONTH, n: k })).sort((a, b) => a.at - b.at);
    S.get(id)?.ledger.push({ what: "Accurate reviews", why: `${RULES.reviewReward} for each review that matched the final outcome`, n, at: steps[steps.length - 1]?.at, steps });
  }
  for (const s of S.values()) s.base = Math.max(0, s.ledger.reduce((a, l) => a + l.n, 0));

  // Credibility comes before vouches, because a vouch weighs as much as the person giving it can be trusted.
  const vouches = all("SELECT * FROM vouches").filter((v) => shippedWith.get(v.to_id)?.has(v.from_id) && !noVouches.has(v.from_id) && !noVouches.has(v.to_id));
  for (const id of noVouches) S.get(id)?.ledger.push({ what: "Vouches removed", why: "An admin upheld a report, so vouches to and from this person no longer count", n: 0, at: t });
  const inRing = rings(vouches, shippedWith, teams);
  // Commissions count towards finishing what you take on: signed off is finished, and one an admin found the
  // doer let down counts like leaving a project.
  const comm = new Map<number, { done: number; dropped: number }>();
  for (const c of all("SELECT doer_id, status, paid_credit, fault FROM commissions WHERE doer_id IS NOT NULL AND hidden=0")) {
    const x = comm.get(c.doer_id) ?? { done: 0, dropped: 0 };
    if (c.fault === "doer") x.dropped++; else if (c.status === "done" && c.paid_credit > 0) x.done++;
    comm.set(c.doer_id, x);
  }
  const upheld = new Map<number, number[]>();
  for (const r of all("SELECT target_id, created_at FROM reports WHERE kind='user' AND result='upheld'"))
    upheld.set(r.target_id, [...(upheld.get(r.target_id) ?? []), r.created_at ?? t]);
  // Outside evidence a person sent for checking: verified items build trust, rejected ones cost it.
  const sent = new Map<number, { ok: number; bad: number }>();
  for (const e of all("SELECT user_id, status FROM evidence WHERE status IN ('verified','rejected')")) {
    const x = sent.get(e.user_id) ?? { ok: 0, bad: 0 };
    if (e.status === "verified") x.ok++; else x.bad++;
    sent.set(e.user_id, x);
  }
  for (const u of users) {
    const s = S.get(u.id)!;
    s.circle = s.shipped >= 3 && s.mates.size <= 2;
    s.ring = inRing.has(u.id);
    const j = judged.get(u.id);
    s.cred = credibility({
      shipped: s.shipped, left: s.left, commDone: comm.get(u.id)?.done ?? 0, commDropped: comm.get(u.id)?.dropped ?? 0, mates: s.mates.size, circle: s.circle, ring: s.ring,
      reviewsMatched: j?.matched ?? 0, reviewsTotal: j?.total ?? 0, evidenceOk: sent.get(u.id)?.ok ?? 0, evidenceBad: sent.get(u.id)?.bad ?? 0,
      createdAt: u.created_at, upheld: upheld.get(u.id) ?? [],
    }, t);
  }

  // Vouches only count between people who shipped together and count half when the two vouched for each other.
  // A vouch weighs as much as the voucher's credibility, a quarter inside a ring, and only the strongest few count.
  // Vouches from before the cutover keep the weight they had (by the voucher's credit), so nothing dropped that day.
  const pair = new Set(vouches.map((v) => `${v.from_id}>${v.to_id}`));
  const fresh = new Map<number, { n: number; at: number }[]>(), old = new Map<number, number>();
  for (const v of vouches) {
    const to = S.get(v.to_id), from = S.get(v.from_id);
    if (!to || !from) continue;
    const mutual = pair.has(`${v.to_id}>${v.from_id}`) ? 0.5 : 1;
    if ((v.created_at ?? 0) < RULES.cutover) {
      const n = Math.max(1, Math.round(RULES.vouch * Math.min(1, from.base / RULES.fullWeightAt) * mutual));
      to.ledger.push({ what: "Vouch from a teammate", why: "Weighted by their own credit", n, at: v.created_at ?? undefined });
      old.set(v.to_id, (old.get(v.to_id) ?? 0) + 1);
    } else {
      const ring = inRing.has(v.from_id) && inRing.has(v.to_id) ? RULES.ringFactor : 1;
      fresh.set(v.to_id, [...(fresh.get(v.to_id) ?? []), { n: RULES.vouch * credWeight(from.cred.score) * mutual * ring, at: v.created_at }]);
    }
  }
  for (const [id, list] of fresh) {
    const room = Math.max(0, RULES.vouchesCounted - (old.get(id) ?? 0));
    for (const v of list.sort((a, b) => b.n - a.n).slice(0, room))
      S.get(id)!.ledger.push({ what: "Vouch from a teammate", why: "Weighted by how far their word can be trusted", n: Math.max(1, Math.round(v.n)), at: v.at });
  }
  // Commissions. The reward is set aside when the client posts, and moves to the doer when the client signs off.
  // What the client spends lowers what they can use, not what they earned. An alum has no credit, so theirs is new.
  for (const c of all("SELECT * FROM commissions")) {
    const client = S.get(c.client_id), doer = c.doer_id ? S.get(c.doer_id) : undefined;
    if (HOLDING.includes(c.status) && !c.minted) client?.ledger.push({ what: `Commission: ${c.title}`, why: "Reward set aside until it is done", n: -c.reward, held: true, at: c.created_at });
    if (c.status === "done" && c.paid_credit > 0) {
      const done = c.closed_at ?? c.delivered_at ?? c.created_at;
      if (!c.minted) client?.ledger.push({ what: `Commission: ${c.title}`, why: "Paid to the person who did it", n: -c.paid_credit, held: true, at: done });
      doer?.ledger.push({ what: `Commission done: ${c.title}`, why: "Signed off by the person who asked for it", n: c.paid_credit, at: done });
    }
  }
  // Gifts move spendable credit only. They never count as earned, so standing cannot be handed to a friend.
  for (const g of all("SELECT * FROM gifts")) {
    S.get(g.from_id)?.ledger.push({ what: "Credit sent", why: "A gift to someone in your community", n: -g.amount, held: true, at: g.created_at });
    S.get(g.to_id)?.ledger.push({ what: "Credit received", why: "A gift. It can be staked or spent, and does not count as earned", n: g.amount, held: true, at: g.created_at });
  }
  for (const s of S.values()) {
    s.credit = Math.max(0, s.ledger.reduce((a, l) => a + l.n, 0));
    s.earned = Math.max(0, s.ledger.reduce((a, l) => a + (l.held ? 0 : l.n), 0));
  }
  return S;
}

export const EMPTY: Standing = blank();
