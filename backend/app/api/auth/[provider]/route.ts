import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { baseUrl } from "@/lib/auth";
import { PROVIDERS, callbackUrl, ready } from "@/lib/oauth";
import { allow, ipOf } from "@/lib/notify";

/* Step 1: send the person to Google or LinkedIn. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = PROVIDERS[(await params).provider];
  if (!p || !ready(p)) return NextResponse.redirect(new URL("/signin?err=" + encodeURIComponent("That sign-in is not set up yet."), baseUrl()));
  // A person starts a sign-in a handful of times at most; a script hammering this is turned away.
  if (!allow(`auth:${ipOf(req)}`, 30, 600)) return NextResponse.redirect(new URL("/signin?err=" + encodeURIComponent("Too many sign-in tries. Wait a few minutes."), baseUrl()));
  const state = crypto.randomBytes(16).toString("hex");
  (await cookies()).set("oauth_state", `${p.key}:${state}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  const u = new URL(p.authUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId!);
  u.searchParams.set("redirect_uri", callbackUrl(baseUrl(), p));
  u.searchParams.set("state", state);
  u.searchParams.set("scope", p.scope);
  if (p.key === "google") u.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(u);
}
