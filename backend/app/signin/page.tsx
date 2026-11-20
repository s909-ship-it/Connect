import Link from "next/link";
import { redirect } from "next/navigation";
import { all } from "@/lib/db";
import { currentUser, demoMode, devLogin } from "@/lib/auth";
import { readyProviders } from "@/lib/oauth";
import { devSignIn } from "../actions";
import { Av } from "../ui";
import { SignInButtons } from "./buttons";

export const metadata = { title: "Sign in" };

export default async function SignIn() {
  if (await currentUser()) redirect("/");
  const people = devLogin ? all("SELECT u.*, c.name college FROM users u LEFT JOIN colleges c ON c.id=u.college_id WHERE u.suspended=0 ORDER BY c.name, u.role DESC, u.name LIMIT 40") : [];
  const missing = devLogin && !demoMode && readyProviders().length < 2;
  return (
    <div className="stack narrow">
      <div className="card">
        <h1>Sign in to Connect</h1>
        <p className="muted">For members and alumni of one community, like the students of a college or the employees of a workplace. Build things with each other, and let the record speak.</p>
        <SignInButtons />
        <p className="small muted">We get your name, photo and email. Members then confirm a college or work email, unless they signed in with it. Alumni are approved by an admin. By continuing you agree to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy policy</Link>.</p>
        <details className="help">
          <summary>Trouble signing in?</summary>
          <div className="stack tight small">
            <p><b>Forgot your password?</b> Connect has no password of its own. You sign in with your Google or LinkedIn account, so reset it there: <a href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">recover a Google account</a> or <a href="https://www.linkedin.com/uas/request-password-reset" target="_blank" rel="noopener noreferrer">reset a LinkedIn password</a>. Then come back and sign in.</p>
            <p><b>No sign-in code in your email?</b> Check spam, wait a minute, then press &ldquo;send a new code&rdquo;. The code goes to your college or work address.</p>
            <p><b>Landed on an empty new account?</b> You probably picked a different account from the one you joined with. Sign out, then choose the Google or LinkedIn account you used the first time.</p>
            <p><b>Lost a phone or used a shared computer?</b> Sign in on a device you trust, open Settings and press <b>Sign out of all other devices</b>.</p>
            <p><b>Told your account is suspended?</b> Only an admin of your community can restore it.</p>
          </div>
        </details>
        {missing && <div className="note">Development note: a button without keys in <code>.env.local</code> sends you back here with a message. See the README for the two-minute setup.</div>}
      </div>
      {devLogin && (
        <div className="card">
          <span className="label">{demoMode ? "Test site" : "Development only"}</span>
          <p className="small muted">{demoMode ? "Sign in as any of these invented people to try Connect. Nothing here is real, and this test site is wiped from time to time." : "Sign in as a sample person. This list never appears in production."}</p>
          {people.length === 0 && <p className="small">No sample people yet. Run <code>npm run seed</code>.</p>}
          {people.map((u) => (
            <form key={u.id} action={devSignIn} className="row between">
              <input type="hidden" name="id" value={u.id} />
              <span className="row nowrap"><Av u={u} /><span>{u.name} <span className="muted small">{u.college ?? "no community yet"} · {u.role === "alum" ? "alum" : u.branch}{u.admin ? " · admin" : ""}</span></span></span>
              <button className="btn ghost sm">Sign in</button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
