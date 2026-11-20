import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "crypto";
import { get, run, now, type Row } from "./db";
import { CONSENT_COOKIE } from "./consent";
import { compute } from "./credit";
import { competency } from "./skills";
import { collegeForEmail, isMember } from "./college";

const prod = process.env.NODE_ENV === "production";
export const baseUrl = () => process.env.APP_URL || "http://localhost:3000";
/* A cloud test copy of Connect, filled with invented sample people. Needs DEMO_MODE=1 and an address that says so
   (staging, demo or localhost), so it can never switch on for the real site by a stray setting. */
export function demoAllowed(flag: string | undefined, appUrl: string): boolean {
  if (flag !== "1") return false;
  try { return /(^|[.-])(staging|demo)([.-])|(^|\.)localhost$/.test(new URL(appUrl).hostname); } catch { return false; }
}
export const demoMode = demoAllowed(process.env.DEMO_MODE, baseUrl());
/* Sample sign-in (pick any seeded person). Only in development, or on a demo copy. */
export const devLogin = demoMode || (!prod && process.env.ALLOW_DEV_LOGIN !== "0");

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && prod) throw new Error("Set SESSION_SECRET before running in production.");
  return s || "dev-only-secret";
}
const sign = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");
/* The cookie is "<id>.<signature>". The signature also covers the person's session counter once it is above zero,
   so "sign out everywhere" (which raises the counter) makes every older cookie stop working, while cookies made
   before the counter existed keep working. */
export const sessionToken = (userId: number, v = 0) => `${userId}.${sign(v ? `${userId}:${v}` : String(userId))}`;
export function tokenOk(token: string, userId: number, v = 0): boolean {
  const sig = token.split(".")[1], want = sessionToken(userId, v).split(".")[1];
  return !!sig && sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

export async function setSession(userId: number) {
  const v = get("SELECT session_v FROM users WHERE id=?", userId)?.session_v ?? 0;
  (await cookies()).set("sid", sessionToken(userId, v), {
    httpOnly: true, sameSite: "lax", secure: prod, path: "/", maxAge: 60 * 60 * 24 * 30,
  });
}
export async function clearSession() {
  (await cookies()).delete("sid");
}

export const currentUser = cache(async (): Promise<Row | null> => {
  const c = (await cookies()).get("sid")?.value;
  if (!c) return null;
  const id = Number(c.split(".")[0]);
  if (!Number.isInteger(id) || id <= 0) return null;
  const u = get("SELECT * FROM users WHERE id=? AND suspended=0", id);
  if (!u || !tokenOk(c, id, u.session_v ?? 0)) return null;
  // Counts the visit for the admin analytics: which day, not which page. Only opening Connect counts (a full page load:
  // a new tab, the installed app, a link from elsewhere, a reload), not what a page does in the background (the call
  // stream, prefetches, form actions). Next.js hides its own navigation headers from page code, so a click from one
  // page to another inside Connect looks like a prefetch and is not counted either.
  try {
    // Not counted for anyone who said no to statistics while the old cookie notice offered that choice.
    if (u.stats_on === 0 || (await cookies()).get(CONSENT_COOKIE)?.value === "necessary") return u;
    const h = await headers(), dest = h.get("sec-fetch-dest");
    if (dest ? dest === "document" : (h.get("accept") ?? "").includes("text/html"))
      run("INSERT INTO activity (day, user_id) VALUES (?,?) ON CONFLICT (day, user_id) DO UPDATE SET hits=hits+1", Math.floor((now() + 19800) / 86400), id);
  } catch { /* never block a page over a count */ }
  return u;
});

/* Signed in and finished onboarding, or sent to the right page. */
export async function requireUser(): Promise<Row> {
  const u = await currentUser();
  if (!u) redirect("/signin");
  if (!u.onboarded) redirect("/onboarding");
  return u;
}

/* One standings calculation per page render. */
export const standings = cache(() => compute());
/* And one skills calculation, built on those standings. */
export const skillScores = cache(() => competency(standings()));

/* Find or create the person a sign-in provider says just signed in.
   The same person signing in with Google and LinkedIn lands on one account when both report the same verified email. */
export function upsertUser(p: { sub: string; name: string; email?: string; emailVerified?: boolean; picture?: string }): number {
  const email = p.email?.toLowerCase() ?? null;
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const admin = email && p.emailVerified && admins.includes(email) ? 1 : 0;
  let id: number | undefined =
    get("SELECT user_id FROM identities WHERE sub=?", p.sub)?.user_id ?? get("SELECT id FROM users WHERE sub=?", p.sub)?.id;
  if (!id && email && p.emailVerified) id = get("SELECT id FROM users WHERE email=? AND email_verified=1", email)?.id;
  if (id) {
    // The sign-in provider's photo is kept fresh, unless the person uploaded their own; while anonymous it goes
    // to the kept real photo, never to the one everyone sees.
    const cur = get("SELECT anon, photo_key FROM users WHERE id=?", id);
    if (p.picture && !cur?.photo_key) run(`UPDATE users SET ${cur?.anon ? "real_picture" : "picture"}=? WHERE id=?`, p.picture, id);
    run("UPDATE users SET admin=MAX(admin, ?), super=MAX(super, ?) WHERE id=?", admin, admin, id);
  } else {
    id = Number(run("INSERT INTO users (sub, name, email, email_verified, picture, admin, super, created_at) VALUES (?,?,?,?,?,?,?,?)",
      p.sub, p.name, email, p.emailVerified ? 1 : 0, p.picture ?? null, admin, admin, now()).lastInsertRowid);
  }
  run("INSERT OR IGNORE INTO identities (sub, user_id) VALUES (?,?)", p.sub, id);
  return id;
}

/* Notes a completed sign-in. From the second sign-in on, the person gets an inbox line naming the device, so a
   sign-in they did not make is noticed and can be undone from Settings. Returns whether it was their first. */
export function recordLogin(userId: number, device: string, tell: (userId: number, text: string, href: string) => void): boolean {
  const u = get("SELECT last_login_at, onboarded FROM users WHERE id=?", userId);
  const first = !u?.last_login_at;
  run("UPDATE users SET last_login_at=?, last_login_ua=? WHERE id=?", now(), device.slice(0, 60), userId);
  if (!first && u.onboarded) tell(userId, `New sign-in to your account from ${device}. Not you? Sign out of all other devices in Settings.`, "/settings#devices");
  return first;
}

/* A student who signed in with a verified email on a college's domain needs no code: that email is the proof.
   Only that college can be joined this way, and someone already verified at a college never moves. */
export function autoVerify(userId: number) {
  const u = get("SELECT * FROM users WHERE id=?", userId);
  if (!u || u.verified || u.role !== "student" || !u.email_verified || !u.email) return false;
  const c = collegeForEmail(u.email);
  if (!c || get("SELECT 1 FROM users WHERE college_email=? AND id<>?", u.email, userId)) return false;
  run("UPDATE users SET verified=1, college_email=?, college_id=? WHERE id=?", u.email.toLowerCase(), c.id, userId);
  return c.status === "active";
}

/* Signed in, onboarded, and a verified member of an open college. Everything college-specific needs this. */
export async function requireMember(): Promise<Row> {
  const u = await requireUser();
  if (!isMember(u)) redirect("/onboarding");
  return u;
}
