import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { get } from "@/lib/db";
import { CODE_MINUTES, TRUST_DAYS, codeAddress, maskEmail, readPending } from "@/lib/twostep";
import { resendLogin, verifyLogin } from "../../actions";

export const metadata = { title: "Enter your code" };

/* Step two of sign-in: the six-digit code we emailed to the person's college address. */
export default async function VerifySignIn() {
  const id = readPending((await cookies()).get("pending")?.value);
  const u = id ? get("SELECT * FROM users WHERE id=? AND suspended=0", id) : null;
  const to = u ? codeAddress(u) : null;
  if (!u || !to) redirect("/signin");
  return (
    <div className="stack narrow">
      <div className="card">
        <h1>Check your email</h1>
        <p className="muted">This device is new to Connect, so we sent a six-digit code to <b>{maskEmail(to)}</b>. It expires in {CODE_MINUTES} minutes.</p>
        <form action={verifyLogin} className="stack">
          <label className="field"><span>Sign-in code</span>
            <input className="code-input" type="text" name="code" id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus placeholder="123456" />
          </label>
          <label className="check">
            <input type="checkbox" name="trust" id="trust" defaultChecked />
            <span><b>Trust this device for {TRUST_DAYS} days</b><br /><small className="muted">Untick this on a shared or borrowed computer.</small></span>
          </label>
          <div><button className="btn">Sign in</button></div>
        </form>
        <form action={resendLogin} className="row small">
          <span className="muted">No email? Check spam, then</span><button className="linkbtn">send a new code</button>
        </form>
        <p className="small muted">Not you, or the wrong account? <Link href="/signin">Start again</Link>. You can turn this step off later in Settings.</p>
      </div>
    </div>
  );
}
