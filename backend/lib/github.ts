/* Reads a public GitHub repository through GitHub's API, for the AI proof check: who committed, how much and when,
   which languages, and the README. Nothing is cloned and no code is run.
   Without a token GitHub allows 60 requests an hour per server; GITHUB_TOKEN raises that to 5,000. */

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export type Contributor = { login: string | null; name: string | null; email: string | null; commits: number; bot: boolean };
export type Commit = { login: string | null; name: string; email: string; at: number; message: string };
export type RepoFacts = {
  url: string; full: string; ok: boolean;
  /* Why it could not be read. `limited` means GitHub's hourly limit, not a problem with the repo. */
  error?: string; limited?: boolean;
  fork?: boolean; parent?: string | null; createdAt?: number; pushedAt?: number; description?: string; archived?: boolean; stars?: number;
  languages?: { name: string; pct: number }[];
  contributors?: Contributor[];
  totalCommits?: number;
  /* The newest commits on the default branch, at most 100. */
  recent?: Commit[];
  readme?: string;
};

const RESERVED = new Set(["orgs", "features", "topics", "marketplace", "settings", "sponsors", "about", "pricing", "login", "join", "apps",
  "collections", "explore", "notifications", "issues", "pulls", "search", "trending", "enterprise", "site", "contact", "security"]);
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;

/* "https://github.com/owner/repo/tree/main/src" → owner and repo. Anything that is not a repo gives null. */
export function parseRepo(raw: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    const r = repo?.replace(/\.git$/, "");
    if (!owner || !r || RESERVED.has(owner.toLowerCase()) || !NAME.test(owner) || !NAME.test(r) || r === "." || r === "..") return null;
    return { owner, repo: r };
  } catch { return null; }
}

/* The GitHub username in what someone typed as their GitHub link: a profile URL, "@name" or just "name". */
export function githubLogin(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let name = s;
  if (/github\.com/i.test(s)) {
    try { name = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return null; }
  }
  name = name.replace(/^@/, "");
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(name) && !RESERVED.has(name.toLowerCase()) ? name : null;
}

/* Release and dependency bots: "dependabot[bot]", "vercel-release-bot", "renovate-bot", "github-actions". */
export const isBot = (login: string | null, name: string | null) =>
  /\[bot\]$|[-_.]bot$|^dependabot|^renovate|^github-actions/i.test(login ?? "") || /\[bot\]$|^dependabot|^github-actions|^renovate/i.test(name ?? "");

const API = "https://api.github.com";
const when = (s: string | null | undefined) => (s ? Math.floor(Date.parse(s) / 1000) : undefined);

export async function readRepo(owner: string, repo: string, fetcher: Fetcher = fetch): Promise<RepoFacts> {
  const full = `${owner}/${repo}`, url = `https://github.com/${full}`;
  const token = process.env.GITHUB_TOKEN?.trim();
  const call = async (path: string, accept = "application/vnd.github+json") => {
    const r = await fetcher(`${API}/repos/${full}${path}`, {
      headers: { Accept: accept, "User-Agent": "Connect-proof-check", "X-GitHub-Api-Version": "2022-11-28", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(8000),
    });
    return r;
  };
  const limitedBy = (r: Response) => (r.status === 403 || r.status === 429) && (r.headers.get("x-ratelimit-remaining") === "0" || r.status === 429);
  const limitNote = (r: Response) => {
    const reset = Number(r.headers.get("x-ratelimit-reset"));
    const at = reset ? new Date(reset * 1000).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
    return `GitHub's hourly limit for Connect is used up${at ? ` until ${at}` : ""}.${token ? "" : " Adding a GITHUB_TOKEN raises it."}`;
  };
  try {
    const meta = await call("");
    if (meta.status === 404) return { url, full, ok: false, error: "Not found, or private. Reviewers cannot open it either." };
    if (limitedBy(meta)) return { url, full, ok: false, limited: true, error: limitNote(meta) };
    if (!meta.ok) return { url, full, ok: false, error: `GitHub answered with an error (${meta.status}).` };
    const m = await meta.json();
    const json = async (r: Response) => (r.ok && r.status !== 204 ? r.json() : null);
    const [contribs, commits, langs, readme] = await Promise.all([
      call("/contributors?per_page=100&anon=1").then(json).catch(() => null),
      call("/commits?per_page=100").then(json).catch(() => null),
      call("/languages").then(json).catch(() => null),
      call("/readme", "application/vnd.github.raw").then((r) => (r.ok ? r.text() : null)).catch(() => null),
    ]);
    const contributors: Contributor[] | undefined = Array.isArray(contribs) ? contribs.map((c: Record<string, unknown>) => {
      const login = typeof c.login === "string" ? c.login : null, name = typeof c.name === "string" ? c.name : null;
      return { login, name, email: typeof c.email === "string" ? c.email.toLowerCase() : null, commits: Number(c.contributions) || 0, bot: c.type === "Bot" || isBot(login, name) };
    }) : undefined;
    const recent: Commit[] | undefined = Array.isArray(commits) ? commits.map((c: { author?: { login?: string } | null; commit?: { author?: { name?: string; email?: string; date?: string }; message?: string } }) => ({
      login: c.author?.login ?? null,
      name: c.commit?.author?.name ?? "",
      email: (c.commit?.author?.email ?? "").toLowerCase(),
      at: when(c.commit?.author?.date) ?? 0,
      message: String(c.commit?.message ?? "").split("\n")[0].slice(0, 120),
    })) : undefined;
    const bytes = langs && typeof langs === "object" ? Object.entries(langs as Record<string, number>) : [];
    const sum = bytes.reduce((s, [, n]) => s + n, 0);
    return {
      url, full: String(m.full_name ?? full), ok: true,
      fork: !!m.fork, parent: m.parent?.full_name ?? null, createdAt: when(m.created_at), pushedAt: when(m.pushed_at),
      description: String(m.description ?? "").slice(0, 300), archived: !!m.archived, stars: Number(m.stargazers_count) || 0,
      languages: sum ? bytes.map(([name, n]) => ({ name, pct: Math.round((n / sum) * 1000) / 10 })).sort((a, b) => b.pct - a.pct).slice(0, 6) : [],
      contributors,
      totalCommits: contributors ? contributors.reduce((s, c) => s + c.commits, 0) : recent?.length,
      recent,
      readme: readme ? readme.slice(0, 6000) : undefined,
    };
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { url, full, ok: false, error: timeout ? "GitHub took too long to answer." : "Could not reach GitHub." };
  }
}
