import dns from "dns/promises";
import net from "net";

/* Checks that a project's live link really answers. Connect makes the request itself, so the link is only ever
   allowed to point at the public internet: never at this server, a private network or a cloud metadata address. */

export function isPublicAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    if (x === "::" || x === "::1" || x.startsWith("::ffff:")) return false;
    if (/^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff") || x.startsWith("64:ff9b")) return false;
    return true;
  }
  return false;
}

/* A link Connect is willing to request: https, a real host name, the default port. */
export function liveUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) || !u.hostname.includes(".") || /\.(local|localhost|internal|test)$/i.test(u.hostname)) return null;
    return u;
  } catch { return null; }
}

export type LiveResult = { ok: boolean; status: number; note: string };

/* What a page says about itself, for the AI proof check. Read as text only: no scripts run and no images load. */
export type SiteFacts = LiveResult & {
  url: string; title?: string; description?: string; generator?: string; headings?: string[]; text?: string;
  /* The page builds itself in the browser, so its HTML holds little text without running it. */
  appShell?: boolean;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/* Pulls the title, description, headings and readable text out of an HTML page. */
export function pageFacts(html: string): Omit<SiteFacts, keyof LiveResult | "url"> {
  const metas = [...html.matchAll(/<meta\b([^>]*)>/gi)].map(([, attrs]) => {
    const a: Record<string, string> = {};
    for (const [, k, , dq, sq, bare] of attrs.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) a[k.toLowerCase()] = dq ?? sq ?? bare ?? "";
    return a;
  });
  const meta = (...names: string[]) => metas.find((m) => names.includes((m.name ?? m.property ?? "").toLowerCase()))?.content;
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const headings = [...body.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]\s*>/gi)].map(([, h]) => clean(h).slice(0, 120)).filter(Boolean).slice(0, 8);
  const text = clean(body).slice(0, 2500);
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "") || decode(meta("og:title") ?? "").trim();
  return {
    title: title.slice(0, 160) || undefined,
    description: decode(meta("description", "og:description") ?? "").trim().slice(0, 300) || undefined,
    generator: meta("generator")?.slice(0, 80) || undefined,
    headings,
    text: text || undefined,
    appShell: text.length < 200 && /<div[^>]+id=["'](root|app|__next|__nuxt|svelte)["']|<script[^>]+type=["']module["']/i.test(html),
  };
}

/* Opens a page the way checkLive does (public https only, every redirect checked) and reads up to 400 KB of it. */
export async function readSite(raw: string): Promise<SiteFacts> {
  let u = liveUrl(raw);
  const url = raw.trim();
  if (!u) return { url, ok: false, status: 0, note: "Not a public https link" };
  try {
    for (let hop = 0; hop < 4; hop++) {
      const addrs = await dns.lookup(u.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address))) return { url, ok: false, status: 0, note: "Points at a private address" };
      const r = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "ConnectLiveCheck/1.0", Accept: "text/html,text/plain;q=0.9" } });
      const next = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (next) {
        r.body?.cancel().catch(() => {});
        const to = liveUrl(new URL(next, u).toString());
        if (!to) return { url, ok: false, status: r.status, note: "Redirects somewhere Connect will not follow" };
        u = to;
        continue;
      }
      const ok = r.status >= 200 && r.status < 300;
      const type = r.headers.get("content-type") ?? "";
      if (!ok || !/html|text\/plain/i.test(type) || !r.body) {
        r.body?.cancel().catch(() => {});
        return { url, ok, status: r.status, note: ok ? "Answered, but not with a web page" : `Answered with an error (${r.status})` };
      }
      const reader = r.body.getReader(), parts: Uint8Array[] = [];
      let size = 0;
      while (size < 400_000) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(parts));
      return { url, ok: true, status: r.status, note: "Answered", ...(/html/i.test(type) ? pageFacts(html) : { text: html.replace(/\s+/g, " ").slice(0, 2500) }) };
    }
    return { url, ok: false, status: 0, note: "Too many redirects" };
  } catch {
    return { url, ok: false, status: 0, note: "Did not answer" };
  }
}

/* A YouTube demo's title and channel, from YouTube's public oEmbed endpoint. The video itself is not watched. */
export async function readVideo(raw: string): Promise<{ url: string; title?: string; channel?: string; ok: boolean }> {
  const url = raw.trim();
  try {
    const host = new URL(url).hostname.replace(/^(www|m)\./, "");
    if (host !== "youtube.com" && host !== "youtu.be") return { url, ok: false };
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000), headers: { "User-Agent": "ConnectLiveCheck/1.0" } });
    if (!r.ok) return { url, ok: false };
    const j = await r.json();
    return { url, ok: true, title: String(j.title ?? "").slice(0, 160), channel: String(j.author_name ?? "").slice(0, 80) };
  } catch { return { url, ok: false }; }
}

export async function checkLive(raw: string): Promise<LiveResult> {
  let u = liveUrl(raw);
  if (!u) return { ok: false, status: 0, note: "Not a public https link" };
  try {
    for (let hop = 0; hop < 4; hop++) {
      const addrs = await dns.lookup(u.hostname, { all: true });
      if (!addrs.length || addrs.some((a) => !isPublicAddress(a.address))) return { ok: false, status: 0, note: "Points at a private address" };
      const r = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000), headers: { "User-Agent": "ConnectLiveCheck/1.0" } });
      r.body?.cancel().catch(() => {});
      const next = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
      if (!next) return { ok: r.status >= 200 && r.status < 300, status: r.status, note: r.status >= 200 && r.status < 300 ? "Answered" : `Answered with an error (${r.status})` };
      const to = liveUrl(new URL(next, u).toString());
      if (!to) return { ok: false, status: r.status, note: "Redirects somewhere Connect will not follow" };
      u = to;
    }
    return { ok: false, status: 0, note: "Too many redirects" };
  } catch {
    return { ok: false, status: 0, note: "Did not answer" };
  }
}
