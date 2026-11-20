/* Same-origin proxy so the browser only ever talks to this site. Forwards to the Connect backend's stub. */
const API = (process.env.CONNECT_API_URL || "http://localhost:3000").replace(/\/$/, "");

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 2000) return Response.json({ error: "too_large" }, { status: 413 });
  try {
    const res = await fetch(`${API}/api/public/college-interest`, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store" });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
