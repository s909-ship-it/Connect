import { RULES, MONTH } from "./rules";
import { all } from "./db";

/* The rules that stop commissions and gifts from being used to farm credit. Pure functions over plain rows,
   so every limit can be tested without a database. */

export type CommRow = { client_id: number; doer_id: number | null; status: string; reward: number; paid_credit: number | null; minted?: number; closed_at?: number | null; assigned_at?: number | null; created_at: number };

/* Commissions still holding their reward: posted, being worked on, delivered or in dispute. */
export const HOLDING = ["open", "assigned", "delivered", "disputed"];
const between = (c: CommRow, a: number, b: number) => (c.client_id === a && c.doer_id === b) || (c.client_id === b && c.doer_id === a);

/* How much the same two people have done together lately, in either direction. Work in progress counts too,
   so two people cannot run several at once to get round the limit. */
export function pairUse(rows: CommRow[], a: number, b: number, t: number): { count: number; credit: number } {
  const from = t - RULES.comm.pairWindowMonths * MONTH;
  let count = 0, credit = 0;
  for (const c of rows) {
    if (!c.doer_id || !between(c, a, b)) continue;
    if (c.status === "done" && (c.paid_credit ?? 0) > 0 && (c.closed_at ?? 0) >= from) { count++; credit += c.paid_credit!; }
    else if (["assigned", "delivered", "disputed"].includes(c.status)) { count++; credit += c.reward; }
  }
  return { count, credit };
}
/* Why this client cannot give this person this commission, or null if they can. */
export function pairBlock(rows: CommRow[], client: number, doer: number, reward: number, t: number): string | null {
  const C = RULES.comm, u = pairUse(rows, client, doer, t);
  if (u.count >= C.pairMaxCount) return `You two have already done ${C.pairMaxCount} commissions together in the last ${C.pairWindowMonths} months. Pick someone else.`;
  if (u.credit + reward > C.pairMaxCredit) return `At most ${C.pairMaxCredit} credit can move between the same two people in ${C.pairWindowMonths} months. You two are at ${u.credit}.`;
  return null;
}
/* Credit an alum's commissions have promised in the last 30 days. Alumni have none of their own to spend. */
export const alumUsed = (rows: CommRow[], alum: number, t: number) =>
  rows.filter((c) => c.client_id === alum && c.minted && c.created_at >= t - MONTH && !["cancelled", "refunded"].includes(c.status))
    .reduce((a, c) => a + (c.status === "done" ? c.paid_credit ?? 0 : c.reward), 0);

export type GiftRow = { from_id: number; to_id: number; amount: number; created_at: number };
export type GiftParty = { id: number; created_at: number; earned: number; credit: number };

/* Why this gift is not allowed, or null if it is. */
export function giftBlock(rows: GiftRow[], from: GiftParty, to: GiftParty, amount: number, t: number): string | null {
  const G = RULES.gift, since = t - G.windowDays * 86400, recent = rows.filter((g) => g.created_at >= since);
  const sum = (f: (g: GiftRow) => boolean) => recent.filter(f).reduce((a, g) => a + g.amount, 0);
  if (from.id === to.id) return "You cannot send credit to yourself.";
  if (!(amount >= 1)) return "Send at least 1 credit.";
  if (from.earned < G.minSenderCredit) return `You need ${G.minSenderCredit} earned credit before you can send any.`;
  if (t - from.created_at < G.minAccountDays * 86400 || t - to.created_at < G.minAccountDays * 86400) return `Both accounts have to be at least ${G.minAccountDays} days old.`;
  if (amount > from.credit) return `You only have ${from.credit} free credit.`;
  const pair = sum((g) => (g.from_id === from.id && g.to_id === to.id) || (g.from_id === to.id && g.to_id === from.id));
  if (pair + amount > G.pairMax) return `At most ${G.pairMax} credit can pass between the same two people in ${G.windowDays} days. You two are at ${pair}.`;
  const sent = sum((g) => g.from_id === from.id);
  if (sent + amount > G.senderMax) return `You can send ${G.senderMax} credit in ${G.windowDays} days. You have sent ${sent}.`;
  const got = sum((g) => g.to_id === to.id);
  if (got + amount > G.receiverMax) return `They can receive ${G.receiverMax} credit in ${G.windowDays} days and have had ${got}.`;
  return null;
}

/* "Would you hire them again?" is private to each client. Only the total is shown, and only once enough different
   people have answered that no single answer can be worked out. */
export function hireAgainOf(rows: { client_id: number; doer_id: number | null; hire_again: number | null }[], doer: number): { yes: number; total: number } | null {
  const last = new Map<number, number>();
  for (const r of rows) if (r.doer_id === doer && r.hire_again != null) last.set(r.client_id, r.hire_again ? 1 : 0);
  if (last.size < RULES.comm.hireAgainMin) return null;
  return { yes: [...last.values()].filter(Boolean).length, total: last.size };
}
export const hireAgain = (doer: number) =>
  hireAgainOf(all("SELECT client_id, doer_id, hire_again FROM commissions WHERE doer_id=? AND status='done' AND hidden=0 ORDER BY closed_at", doer) as never, doer);
