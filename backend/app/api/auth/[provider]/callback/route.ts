import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { get } from "@/lib/db";
import { autoVerify, baseUrl, recordLogin, setSession, upsertUser } from "@/lib/auth";
import { allow, deviceName, ipOf, notify } from "@/lib/notify";
import { PROVIDERS, callbackUrl, ready } from "@/lib/oauth";
import { CODE_MINUTES, needsCode, pendingToken, sendLoginCode } from "@/lib/twostep";

/* Step 2: the provider sends the person back with a code. Swap it for their name, email and photo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const fail = (msg: string) => NextResponse.redirect(new URL("/signin?err=" + encodeURIComponent(msg), baseUrl()));
  const p = PROVIDERS[(await params).provider];
  if (!p || !ready(p)) return fail("That sign-in is not set up yet.");
  if (!allow(`authcb:${ipOf(req)}`, 30, 600)) return fail("Too many sign-in tries. Wait a few minutes.");
  const q = req.nextUrl.searchParams;
  const jar = await cookies();
  const state = jar.get("oauth_state")?.value;
  jar.delete("oauth_state");
  if (q.get("error")) return fail(`${p.label} sign-in was cancelled.`);
  // The answer must carry the random value this browser was given when it left for the provider; compared without leaking timing.
  const got = Buffer.from(`${p.key}:${q.get("state") ?? ""}`), want = Buffer.from(state ?? "");
  if (!q.get("code") || !state || got.length !== want.length || !crypto.timingSafeEqual(got, want)) return fail("Sign-in expired. Try again.");

  const token = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: q.get("code")!,
      client_id: p.clientId!,
      client_secret: p.clientSecret!,
      redirect_uri: callbackUrl(baseUrl(), p),
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!token?.ok) return fail(`${p.label} did not accept the sign-in.`);
  const { access_token } = await token.json().catch(() => ({}));
  if (typeof access_token !== "string" || !access_token) return fail(`${p.label} did not accept the sign-in.`);

  const info = await fetch(p.userinfoUrl, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!info?.ok) return fail(`Could not read your ${p.label} profile.`);
  const who = await info.json().catch(() => ({}));
  if (typeof who.sub !== "string" || !who.sub || typeof who.name !== "string" || !who.name.trim()) return fail(`${p.label} did not share a name.`);

  const id = upsertUser({
    sub: `${p.key}:${who.sub}`, name: who.name.trim().slice(0, 80),
    email: typeof who.email === "string" ? who.email.slice(0, 200) : undefined,
    // Only an https photo is kept; anything else is dropped rather than shown to other people.
    picture: typeof who.picture === "string" && /^https:\/\//.test(who.picture) ? who.picture.slice(0, 500) : undefined,
    emailVerified: who.email_verified === true || who.email_verified === "true",
  });
  if (get("SELECT suspended FROM users WHERE id=?", id)?.suspended) return fail("This account has been suspended by an admin.");
  autoVerify(id);
  // Step two: on a device we have not seen, a verified member also types a code sent to their college email.
  const u = get("SELECT * FROM users WHERE id=?", id);
  if (needsCode(u, jar.get("td")?.value)) {
    if (!allow(`2fa:${id}`, 5, 900)) return fail("Too many sign-in codes requested. Wait fifteen minutes.");
    if (!(await sendLoginCode(u))) return fail("We could not email your sign-in code. Try again in a minute.");
    jar.set("pending", pendingToken(id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CODE_MINUTES * 60 });
    return NextResponse.redirect(new URL("/signin/verify", baseUrl()));
  }
  recordLogin(id, deviceName(req.headers.get("user-agent")), notify);
  await setSession(id);
  return NextResponse.redirect(new URL("/", baseUrl()));
}
