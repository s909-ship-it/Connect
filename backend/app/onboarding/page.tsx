import { redirect } from "next/navigation";
import Link from "next/link";
import { get, now } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { RULES } from "@/lib/credit";
import { mailReady } from "@/lib/mail";
import { activeColleges, collegeById, domainsOf, isMember } from "@/lib/college";
import { askCollegeAdmin, joinWithSignInEmail, saveProfile, sendCode, switchToWorkGoogle, verifyCode } from "../actions";
import { readyProviders } from "@/lib/oauth";
import { collegeForEmail } from "@/lib/college";
import { domainOf, isAcademic, isPublicMail } from "@/lib/domains";
import { F } from "../ui";
import { EmailField } from "./email-field";

export const metadata = { title: "Your profile" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/signin");
  const sp = await searchParams;
  const editing = !me.onboarded || sp.edit;
  const pending = get("SELECT * FROM codes WHERE user_id=? AND expires>?", me.id, now());
  const colleges = activeColleges();
  const signInDomain = domainOf(String(me.email ?? "").toLowerCase());
  const signInProof = me.role === "student" && !!me.email_verified && !!signInDomain && !isPublicMail(signInDomain);
  const mine = collegeById(me.college_id);
  const prod = process.env.NODE_ENV === "production";
  const showCode = !prod && !mailReady();
  const noMail = prod && !mailReady();
  const googleOn = readyProviders().some((p) => p.key === "google");

  if (editing) return (
    <div className="card narrow">
      <h1>{me.onboarded ? "Edit your profile" : `Welcome, ${me.name.split(" ")[0]}`}</h1>
      <form action={saveProfile} className="stack">
        {!me.onboarded && (
          <label className="field"><span>I am a</span>
            <select name="role" id="role" defaultValue="student"><option value="student">Current member</option><option value="alum">Alum</option></select>
            <small>This cannot be changed later.</small></label>
        )}
        {!me.onboarded && colleges.length > 0 && (
          <label className="field"><span>Community you used to be part of <span className="muted">(alumni only)</span></span>
            <select name="college" id="college" defaultValue=""><option value="">Pick one</option>{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <small>Members skip this: your community comes from your college or work email. An admin of the community approves each alum.</small></label>
        )}
        <label className="field"><span>Branch</span><input type="text" name="branch" id="branch" defaultValue={me.branch} placeholder="ECE, CSE, Mech…" required /></label>
        <label className="field"><span>Graduation year</span><input type="number" name="grad_year" id="grad_year" defaultValue={me.grad_year ?? ""} placeholder="2027" required /></label>
        <label className="field"><span>Skills</span><input type="text" name="skills" id="skills" defaultValue={me.skills} placeholder="React, ESP32, Figma" />
          <small>Comma separated. They show as “self-listed” until a shipped project backs them.</small></label>
        <label className="field"><span>One line about you</span><input type="text" name="about" id="about" defaultValue={me.about} placeholder="What you like building" /></label>
        <label className="field"><span>GitHub</span><input type="url" name="github" id="github" defaultValue={me.github ?? ""} placeholder="https://github.com/you" /></label>
        <label className="field"><span>LinkedIn</span><input type="url" name="linkedin" id="linkedin" defaultValue={me.linkedin ?? ""} placeholder="https://www.linkedin.com/in/you" /></label>
        <label className="field"><span>Portfolio or website</span><input type="url" name="website" id="website" defaultValue={me.website ?? ""} placeholder="https://" />
          <small>Optional. Shown on your profile and resume link.</small></label>
        {!me.onboarded && (
          <label className="check">
            <input type="checkbox" name="terms" id="terms" required />
            <span>I agree to the <Link href="/terms" target="_blank">Terms of Service</Link> and the <Link href="/privacy" target="_blank">Privacy policy</Link>.</span>
          </label>
        )}
        <button className="btn">Save</button>
      </form>
    </div>
  );

  if (isMember(me)) redirect("/");
  // Email proven, but the college is new and a site admin has not opened it yet.
  if (me.verified && mine && mine.status !== "active") return (
    <div className="card narrow stack">
      <span className="label">{mine.name} · @{domainsOf(mine).join(", @")}</span>
      <h1>Your community is being checked</h1>
      <p className="muted">Your email is confirmed. {mine.name} is new on Connect, so the team makes sure @{domainsOf(mine)[0]} really belongs to a college or workplace before opening it. You will get an inbox note the moment it opens, and so will everyone else from your community who signs up meanwhile.</p>
    </div>
  );
  if (me.role === "alum") return (
    <div className="card narrow stack">
      {mine && <span className="label">{mine.name}</span>}
      <h1>Waiting for approval</h1>
      <p className="muted">An admin of {mine?.name ?? "your community"} checks each alum by hand before they can see projects or fund them. You will get an inbox note when it is done.</p>
    </div>
  );
  return (
    <div className="card narrow stack">
      <span className="label">Step 2 of 2</span>
      <h1>Prove your community</h1>
      <p className="muted">Each community on Connect, like the students of a college or the employees of a workplace, is its own space. You get into yours, and only yours, by proving an email address your college or workplace gave you. You get {RULES.starter} starter credit once it is done.</p>
      {signInProof && (() => {
        // Signed in with a confirmed email on a college domain: that is proof enough, no code needed.
        const email = String(me.email ?? "").toLowerCase(), d = domainOf(email);
        const known = collegeForEmail(email);
        return (
          <F action={joinWithSignInEmail} back="/onboarding" className="card stack tight sign-in-proof">
            <span className="label">Quickest</span>
            <span>You signed in as <b>{email}</b>.{known ? <> That is a {known.name} address.</> : <> @{d} is new on Connect.</>}</span>
            {!known && (
              <label className="field"><span>Your community&rsquo;s full name</span>
                <input type="text" name="college_name" id="signin-college-name" placeholder="e.g. Nirma University or Acme Labs" minLength={3} maxLength={80} required />
                <small>{isAcademic(d) ? "Academic domain: your community opens straight away." : "The Connect team checks new non-academic domains before the community opens."}</small></label>
            )}
            <div><button className="btn">{known ? `Join ${known.name}` : "Add my community and join"}</button></div>
          </F>
        );
      })()}
      {!signInProof && <div className="proof-ways">
        {googleOn && (
          <form action={switchToWorkGoogle} className="proof-way">
            <span className="label">Fastest</span>
            <b>Use your college or work Google account</b>
            <span className="small muted">You leave this account, then Google asks which account to use. Pick the one with your college or work email: its verified address proves your community straight away.</span>
            <div><button className="btn">Continue with Google</button></div>
          </form>
        )}
        {noMail ? (
          <span className="small muted">Getting a code by email is not switched on for this site yet.</span>
        ) : (
          <div className="proof-way" id="email-code">
            <span className="label">{googleOn ? "Or" : "Fastest"}</span>
            <b>Get a 6-digit code at your college or work email</b>
            <F action={sendCode} back="/onboarding" className="stack tight">
              <EmailField colleges={colleges.map((c) => ({ name: c.name, domains: c.domains }))} initial={pending?.email ?? ""} />
            </F>
            {pending && (
              <F action={verifyCode} back="/onboarding" className="row">
                <input type="text" name="code" id="code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="6-digit code" required />
                <button className="btn">Verify</button>
              </F>
            )}
          </div>
        )}
      </div>}
      {pending && showCode && <div className="note">Development mode: no email service is set up, so the code is shown here: <b className="mono">{pending.code}</b></div>}
      {colleges.length > 0 && (
        <details className="small">
          <summary className="muted" style={{ cursor: "pointer" }}>Communities on Connect ({colleges.length})</summary>
          <ul className="college-list">{colleges.map((c) => <li key={c.id}><Link href={`/c/${c.slug}`}>{c.name}</Link> <span className="muted mono">@{domainsOf(c).join(", @")}</span></li>)}</ul>
        </details>
      )}
      {colleges.length > 0 && (
        <F action={askCollegeAdmin} back="/onboarding" className="proof-way">
          <span className="label">Or</span>
          <b>Ask your community&rsquo;s admins</b>
          <span className="small muted">{mine ? <>You asked the admins of <b>{mine.name}</b> to verify you. You will get an inbox note when they do.</> : "No college or work email at all? An admin of your community can verify you by hand."}</span>
          {!mine && (
            <span className="row">
              <select name="college" id="ask-college" defaultValue="" required><option value="" disabled>Your community</option>{colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button className="btn ghost sm">Ask admins</button>
            </span>
          )}
        </F>
      )}
    </div>
  );
}
