import crypto from "crypto";
import { resolveMx } from "dns/promises";
import { get, run, now, type Row } from "./db";
import { mailReady, sendMail } from "./mail";

/* Two-step sign-in. After Google or LinkedIn says who someone is, a verified member signing in on a device Connect
   has not seen must also type a code emailed to their college address. A stolen Google session alone is then not
   enough, and every sign-in on a new device re-proves the college mailbox still exists and is theirs.
   It only runs when the site can send email; without that nobody could receive a code. */
const prod = process.env.NODE_ENV === "production";
const key = () => process.env.SESSION_SECRET || "dev-only-secret";
const mac = (v: string) => crypto.createHmac("sha256", key()).update(v).digest("hex");
const same = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const CODE_MINUTES = 10, MAX_TRIES = 5, TRUST_DAYS = 90;
/* In development, TWO_STEP_DEV=1 turns it on without email: the code is printed in the server log instead. */
export const twoStepOn = () => mailReady() || (!prod && process.env.TWO_STEP_DEV === "1");
/* Where the code goes: the college address first, else the address the sign-in provider confirmed. */
export const codeAddress = (u: Row): string | null => u.college_email || (u.email_verified ? u.email : null) || null;
export const maskEmail = (e: string) => {
  const [name, domain] = e.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
};

/* Whether this sign-in must stop for a code. `device` is the value of the trusted-device cookie, if any. */
export function needsCode(u: Row, device?: string): boolean {
  if (!twoStepOn() || !u.onboarded || !u.verified || u.two_step === 0 || !codeAddress(u)) return false;
  return !(device && get("SELECT 1 FROM trusted_devices WHERE id=? AND user_id=? AND created_at>?", mac(`td:${device}`), u.id, now() - TRUST_DAYS * 86400));
}

/* A fresh six-digit code. Only a keyed hash of it is stored, so reading the database does not reveal it. */
export function newLoginCode(userId: number): string {
  const code = String(crypto.randomInt(100000, 1000000));
  run("INSERT OR REPLACE INTO login_codes (user_id, code_hash, expires, tries) VALUES (?,?,?,0)", userId, mac(`code:${userId}:${code}`), now() + CODE_MINUTES * 60);
  return code;
}
export function checkLoginCode(userId: number, typed: string): "ok" | "wrong" | "expired" | "locked" {
  const c = get("SELECT * FROM login_codes WHERE user_id=?", userId);
  if (!c || c.expires < now()) return "expired";
  if (c.tries >= MAX_TRIES) return "locked";
  if (!same(mac(`code:${userId}:${typed.replace(/\D/g, "").slice(0, 6)}`), c.code_hash)) {
    run("UPDATE login_codes SET tries=tries+1 WHERE user_id=?", userId);
    return "wrong";
  }
  run("DELETE FROM login_codes WHERE user_id=?", userId); // one use only
  return "ok";
}

/* Remembers a device for 90 days. Returns the value for its cookie; only a hash of it is kept. */
export function trustDevice(userId: number, label: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  run("DELETE FROM trusted_devices WHERE user_id=? AND created_at<?", userId, now() - TRUST_DAYS * 86400);
  run("INSERT INTO trusted_devices (id, user_id, label, created_at) VALUES (?,?,?,?)", mac(`td:${token}`), userId, label.slice(0, 60), now());
  return token;
}
export const forgetDevices = (userId: number) => run("DELETE FROM trusted_devices WHERE user_id=?", userId);

/* The short-lived cookie that says "this person passed step one and is waiting to type a code". Signed, ten minutes. */
export const pendingToken = (userId: number, until = now() + CODE_MINUTES * 60) => `${userId}.${until}.${mac(`pending:${userId}:${until}`)}`;
export function readPending(token: string | undefined): number | null {
  const [id, until, sig] = String(token ?? "").split(".");
  if (!sig || !same(sig, mac(`pending:${id}:${until}`)) || Number(until) < now()) return null;
  return Number(id) || null;
}

/* Emails a new code (or, in development without email, prints it in the server log). */
export async function sendLoginCode(u: Row): Promise<boolean> {
  const to = codeAddress(u);
  if (!to) return false;
  const code = newLoginCode(u.id);
  if (!mailReady()) { console.log(`[connect] sign-in code for ${to}: ${code}`); return true; }
  return sendMail(to, `${code} is your Connect sign-in code`,
    `Your Connect sign-in code is ${code}. It works once and expires in ${CODE_MINUTES} minutes.\n\nIf you did not just sign in to Connect, someone else has your Google or LinkedIn sign-in. Do not share this code, and change that account's password.`);
}

/* Can this domain receive email at all? Catches typos and made-up domains before a code is sent into the void.
   A lookup that fails for any other reason (slow network) does not block the person. */
export async function domainTakesMail(domain: string, lookup: (d: string) => Promise<{ exchange: string }[]> = resolveMx): Promise<boolean> {
  try {
    const mx = await Promise.race([lookup(domain), new Promise<never>((_, no) => setTimeout(() => no(new Error("slow")), 4000))]);
    return mx.some((m) => m.exchange && m.exchange !== ".");
  } catch (e) {
    return !["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes((e as NodeJS.ErrnoException).code ?? "");
  }
}
