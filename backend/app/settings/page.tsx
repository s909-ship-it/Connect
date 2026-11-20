import Link from "next/link";
import { cookies } from "next/headers";
import { all } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isMember } from "@/lib/college";
import { timeAgo } from "@/lib/notify";
import { mailReady } from "@/lib/mail";
import { TRUST_DAYS, codeAddress, twoStepOn } from "@/lib/twostep";
import { pushPublicKey } from "@/lib/push";
import { PushToggle } from "../push-toggle";
import { ThemeSeg } from "../settings-menu";
import { deleteAccount, saveSettings, signOutEverywhere } from "../actions";
import { setBlocked } from "../chat-actions";
import { Av, F } from "../ui";
import { setAnonymousMode } from "../identity-actions";
import { PhotoUpload } from "../identity-ui";

export const metadata = { title: "Settings" };

const PROVIDERS: Record<string, string> = { google: "Google", linkedin: "LinkedIn", dev: "Sample sign-in" };

export default async function Settings() {
  const me = await requireUser();
  const member = isMember(me);
  const to = me.college_email || me.email;
  const saved = (await cookies()).get("theme")?.value;
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  const blocked = all("SELECT u.id, u.name, u.picture FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=? AND u.deleted=0 ORDER BY u.name", me.id);
  const ways = [...new Set(all("SELECT sub FROM identities WHERE user_id=?", me.id).map((r) => String(r.sub).split(":")[0]))].map((p) => PROVIDERS[p] ?? p);
  return (
    <div className="narrow stack">
      <div className="head"><div className="stack tight">
        <h1>Settings</h1>
        <p>How Connect looks, what it tells you, who can reach you, and your data. To change your branch, skills or links, <Link href="/onboarding?edit=1">edit your profile</Link>.</p>
      </div></div>

      <div className="card stack">
        <span className="label">Appearance</span>
        <ThemeSeg saved={theme} />
        <span className="small muted">Device follows the light or dark setting of this phone or computer. The choice is kept on this device only.</span>
      </div>

      <div className="card stack" id="identity">
        <span className="label">Photo and name</span>
        <span className="row">
          <Av u={me} lg />
          <span className="stack tight" style={{ minWidth: 0 }}>
            <b>{me.name}</b>
            <span className="small muted">{me.anon ? `Anonymous since ${new Date((me.anon_since ?? 0) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. Your real name is ${me.real_name}.`
              : me.photo_key ? "Your own photo." : "Your photo from Google or LinkedIn."}</span>
          </span>
        </span>
        <PhotoUpload hasOwn={!!me.photo_key} anon={!!me.anon} />

        <span className="label set-gap" id="anonymous">Anonymous mode</span>
        <span className="small muted">
          Appear as <b>Anon</b> and a random number, like <b>Anon 48213097</b>, with a coloured pattern instead of your name and photo, everywhere on Connect.
          Your links and resume are hidden, people never see when you read their messages, and in calls your camera stays off and your
          voice is disguised on your own device. Your projects, skills and credit still count. Your college&rsquo;s admins can still see who
          you are, so the rules apply the same.
        </span>
        <span className="row">
          {me.anon ? (
            <>
              <F action={setAnonymousMode} back="/settings" hidden={{ on: 0 }}><button className="btn sm">Show my real name and photo</button></F>
              <F action={setAnonymousMode} back="/settings" hidden={{ on: 1, fresh: 1 }} confirm="Get a new alias? People who knew your old alias will not recognise you."><button className="btn ghost sm">New alias</button></F>
            </>
          ) : (
            <F action={setAnonymousMode} back="/settings" hidden={{ on: 1 }} confirm="Turn on anonymous mode? Everyone will see an alias and a pattern instead of your name and photo."><button className="btn sm">Go anonymous</button></F>
          )}
        </span>
      </div>

      <F action={saveSettings} back="/settings" className="card stack">
        <span className="label" id="alerts">Alerts</span>
        <PushToggle key={me.session_v ?? 0} publicKey={pushPublicKey()} />
        <label className="check">
          <input type="checkbox" name="email_notes" id="email_notes" defaultChecked={!!me.email_notes} />
          <span><b>Email me what lands in my inbox</b><br />
            <small className="muted">{!mailReady() ? "Email is not switched on for this site yet. Your inbox still works."
              : to ? `Sent to ${to}. At most six an hour.` : "We have no email address for you."}</small></span>
        </label>
        <label className="check">
          <input type="checkbox" name="follow_notes" id="follow_notes" defaultChecked={me.follow_notes !== 0} />
          <span><b>Tell me about projects I follow</b><br />
            <small className="muted">Their milestones, posts and review results reach your inbox. Turn this off to keep following quietly.</small></span>
        </label>

        <span className="label set-gap" id="privacy">Who can reach you</span>
        {me.role === "student" && (
          <label className="check">
            <input type="checkbox" name="open_to_join" id="open_to_join" defaultChecked={!!me.open_to_join} />
            <span><b>I am open to joining a project</b><br />
              <small className="muted">Shows an “Open to projects” badge on your profile and puts you in the People filter that project leads use.</small></span>
          </label>
        )}
        <label className="check">
          <input type="checkbox" name="calls_on" id="calls_on" defaultChecked={me.calls_on !== 0} />
          <span><b>Let people call me</b><br />
            <small className="muted">Voice and video calls from people in your community. With this off they can still message you.</small></span>
        </label>
        <label className="field"><span>Who can start a chat with me</span>
          <select name="dm_from" id="dm_from" defaultValue={me.dm_from === "team" ? "team" : "all"}>
            <option value="all">Anyone verified in my community</option>
            <option value="team">Only people I have been on a project with</option>
          </select>
          <small>You can always reply to someone you wrote to first, and a project lead can still send you a role invite.</small>
        </label>

        <span className="label set-gap" id="two-step">Sign-in security</span>
        <label className="check">
          <input type="checkbox" name="two_step" id="two_step" defaultChecked={me.two_step !== 0} />
          <span><b>Ask for an emailed code on a new device</b><br />
            <small className="muted">{!twoStepOn() ? "Starts working once email is switched on for this site. Until then sign-in is Google or LinkedIn only."
              : codeAddress(me) ? `After Google or LinkedIn, a six-digit code goes to ${codeAddress(me)}. A device you trust is not asked again for ${TRUST_DAYS} days.`
              : "Needs a verified college or work email first."}</small></span>
        </label>
        <div><button className="btn">Save</button></div>
      </F>

      {member && (
        <div className="card stack" id="blocked">
          <span className="label">Blocked people</span>
          {blocked.length === 0 && <span className="small muted">You have not blocked anyone. To block someone, open your chat with them and use Block.</span>}
          {blocked.map((u) => (
            <div key={u.id} className="row between">
              <span className="row nowrap"><Av u={u} /><span>{u.name}</span></span>
              <F action={setBlocked} back="/settings" hidden={{ user: u.id, on: 0 }}><button className="btn ghost sm">Unblock</button></F>
            </div>
          ))}
        </div>
      )}

      <div className="card stack" id="devices">
        <span className="label">Sign-in and devices</span>
        <p className="small muted">You sign in with {ways.length ? ways.join(" and ") : "your sign-in provider"}{me.email ? ` as ${me.email}` : ""}. Connect has no password of its own and never sees yours.</p>
        {me.last_login_at ? <p className="small muted">Last sign-in: {timeAgo(me.last_login_at)}{me.last_login_ua ? `, from ${me.last_login_ua}` : ""}. Each new sign-in also shows in your inbox.</p> : null}
        <F action={signOutEverywhere} back="/settings" confirm="Sign out everywhere except this device?">
          <button className="btn ghost">Sign out of all other devices</button>
        </F>
        <p className="small muted">Use this if you signed in on a shared or lost phone or computer. It also turns off alerts on those devices and forgets every trusted device, so each one is asked for a code again.</p>
      </div>

      <div className="card stack">
        <span className="label">Feedback</span>
        <p className="small muted">Found a problem or have an idea? Tell the Connect team and see what they said back.</p>
        <div><Link className="btn ghost" href="/feedback?from=/settings">Send feedback</Link></div>
      </div>

      <div className="card stack">
        <span className="label">Your data</span>
        <p className="small muted">A copy of everything Connect holds about you: profile, projects, reviews, vouches, clubs, questions, feedback and inbox.</p>
        <div><a className="btn ghost" href="/api/me/export" download>Download my data</a></div>
        <p className="small muted">Read the <Link href="/privacy">privacy policy</Link> and <Link href="/terms">terms</Link>.</p>
      </div>

      <F action={deleteAccount} back="/settings" className="card stack">
        <span className="label">Delete account</span>
        <p className="small muted">
          Your name, photo, emails, skills, links, resume, inbox, questions, messages and the files in them are erased, and you are signed out. Projects you were part of
          keep a “Deleted user” in their team, so your teammates&rsquo; signed history stays true. This cannot be undone.
        </p>
        <label className="field"><span>Type delete to confirm</span><input type="text" name="confirm" id="confirm" autoComplete="off" required pattern="[Dd][Ee][Ll][Ee][Tt][Ee]" /></label>
        <div><button className="btn danger">Delete my account</button></div>
      </F>
    </div>
  );
}
