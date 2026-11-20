import nodemailer, { type Transporter } from "nodemailer";
import { get } from "./db";

const baseUrl = () => process.env.APP_URL || "http://localhost:3000";
/* Same limiter idea as notify.allow, kept here so the two files do not import each other. */
const sent = new Map<number, number[]>();
function underLimit(id: number) {
  const t = Date.now(), list = (sent.get(id) ?? []).filter((x) => x > t - 3600_000);
  if (list.length >= 6) return false;
  sent.set(id, [...list, t]);
  return true;
}

/* Email, through whichever service is set up:
   SMTP_URL (e.g. a Gmail app password: smtps://you%40gmail.com:app-password@smtp.gmail.com:465), or RESEND_API_KEY.
   With neither, nothing is sent and callers decide what to do. */
export const mailReady = () => !!(process.env.SMTP_URL || process.env.RESEND_API_KEY);

let transport: Transporter | null = null;

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const from = process.env.MAIL_FROM || "Connect <noreply@connect.local>";
  try {
    if (process.env.SMTP_URL) {
      transport ??= nodemailer.createTransport(process.env.SMTP_URL);
      await transport.sendMail({ from, to, subject, text });
      return true;
    }
    if (process.env.RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      return r.ok;
    }
  } catch (e) {
    console.error("[connect] email failed:", (e as Error).message);
  }
  return false;
}

/* Copies an inbox entry to the person's email, if they want that. At most 6 an hour per person,
   so a busy project never floods anyone. Runs in the background; the page never waits on it. */
export function emailNote(userId: number, text: string, href: string) {
  if (!mailReady()) return;
  const u = get("SELECT email, college_email, email_notes, suspended FROM users WHERE id=?", userId);
  const to = u?.college_email || u?.email;
  if (!to || !u.email_notes || u.suspended || !underLimit(userId)) return;
  const link = baseUrl() + href;
  void sendMail(to, `Connect: ${text.length > 70 ? text.slice(0, 67) + "..." : text}`,
    `${text}\n\nOpen it: ${link}\n\nYou get these because email alerts are on. Turn them off at ${baseUrl()}/settings`);
}

