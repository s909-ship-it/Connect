import webpush from "web-push";
import { all, run } from "./db";

/* Web push: rings a phone or laptop for a call, and brings messages, even when Connect is closed.
   Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (made once with web-push's generateVAPIDKeys).
   On iPhone it works once Connect is added to the Home Screen (iOS 16.4 and later). */

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";
export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function setup() {
  if (configured || !pushReady()) return configured;
  // The push services ask for a contact; the project's public page is enough and shares no one's email.
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://github.com/pt-scheon/connect", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return (configured = true);
}

export type PushData =
  | { type: "call"; id: number; video: boolean; from: { id: number; name: string } }
  | { type: "call-end"; id: number; video: boolean; missed: boolean; from: { id: number; name: string } }
  | { type: "msg"; from: { id: number; name: string }; text: string }
  /* A project's team space: a team chat message, or a team call starting. */
  | { type: "team"; project: number; title: string; text: string; url: string };

/* Sends to every device the person turned alerts on for. Dead subscriptions are removed. Never throws. */
export async function push(userId: number, data: PushData, opts: { ttl?: number; urgent?: boolean } = {}) {
  if (!setup()) return;
  const subs = all("SELECT * FROM push_subs WHERE user_id=?", userId);
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(data), {
        TTL: opts.ttl ?? 3600, urgency: opts.urgent ? "high" : "normal",
        // Newer pushes about the same thing replace older ones still waiting to be delivered.
        topic: data.type === "msg" ? `chat-${data.from.id}` : data.type === "team" ? `team-${data.project}` : `call-${data.id}`,
      });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) run("DELETE FROM push_subs WHERE endpoint=?", s.endpoint);
      else console.error("[connect] push failed:", code ?? (e as Error).message);
    }
  }));
}

export function savePushSub(userId: number, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }) {
  const ok = typeof sub.endpoint === "string" && /^https:\/\/[^\s]{10,500}$/.test(sub.endpoint) && sub.keys?.p256dh && sub.keys?.auth
    && sub.keys.p256dh.length < 200 && sub.keys.auth.length < 100;
  if (!ok) return false;
  run(`INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?,?,?,?,strftime('%s','now'))
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
    sub.endpoint, userId, sub.keys!.p256dh, sub.keys!.auth);
  return true;
}

/* A new chat message for someone. Their phone shows it only if Connect is not on screen. */
export function pushMessage(to: number, from: { id: number; name: string }, text: string) {
  void push(to, { type: "msg", from: { id: from.id, name: from.name }, text: text.length > 140 ? text.slice(0, 137) + "..." : text });
}
