/* Shared response helpers for the read-only public API in app/api/public/*.
   The data is public by design (see lib/public.ts), so any origin may read it. Set PUBLIC_API_ORIGIN to one
   origin (e.g. https://showcase.example.com) to restrict browsers to the showcase site. */

const origin = () => (process.env.PUBLIC_API_ORIGIN || "*").split(",")[0].trim() || "*";

export const cors = () => ({
  "Access-Control-Allow-Origin": origin(),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  Vary: "Origin",
});

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...cors(), "Cache-Control": status === 200 ? "public, max-age=30, stale-while-revalidate=300" : "no-store" },
  });
}

export const notFound = () => json({ error: "not_found" }, 404);
export const preflight = () => new Response(null, { status: 204, headers: cors() });
export const intParam = (v: string | null | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/* Credentialed requests (the account menu on the showcase): the browser sends Connect's sign-in cookie, so the
   origin must be named, never "*". Allowed: each origin in PUBLIC_API_ORIGIN (comma-separated) or SHOWCASE_URL,
   and, outside production, any localhost port. The sign-in cookie is SameSite=Lax, so this only works when the
   showcase and Connect share a site (for example showcase.example.com and app.example.com, or localhost). */
export function trusted(origin: string | null): string | null {
  if (!origin) return null;
  const list = [...(process.env.PUBLIC_API_ORIGIN || "").split(","), process.env.SHOWCASE_URL || ""]
    .map((o) => o.trim().replace(/\/$/, "")).filter((o) => o && o !== "*");
  if (list.includes(origin)) return origin;
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function credentialed(req: Request): Record<string, string> {
  const o = trusted(req.headers.get("origin"));
  return {
    ...(o ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Credentials": "true" } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "private, no-store",
    Vary: "Origin, Cookie",
  };
}
