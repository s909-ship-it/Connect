import { requireUser, standings } from "@/lib/auth";
import { EMPTY, RULES } from "@/lib/credit";
import { all } from "@/lib/db";
import * as A from "../actions";
import { F } from "../ui";
import { Rules } from "../rule-list";

export const metadata = { title: "Credit" };

export default async function Credit() {
  const me = await requireUser();
  const s = standings().get(me.id) ?? EMPTY, G = RULES.gift;
  const mates = me.role === "student" && me.verified ? all("SELECT id, name FROM users WHERE college_id=? AND role='student' AND verified=1 AND suspended=0 AND id<>? ORDER BY name", me.college_id, me.id) : [];
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>How Connect rates people</h1>
        <p>Credit, skills and credibility, and exactly how each one is worked out. Nothing you type about yourself can raise any of them.</p>
      </div></div>
      {me.role === "student" && (
        <div className="card" style={{ maxWidth: 620 }}>
          <h2>Your ledger</h2>
          <div className="tw"><table><tbody>
            {s.ledger.length === 0 && <tr><td className="muted">Nothing yet. Verify your college or work email to get your starter credit.</td></tr>}
            {s.ledger.map((l, i) => (
              <tr key={i}><td><b>{l.what}</b><br /><span className="small muted">{l.why}</span></td><td className={`n ${l.n < 0 ? "neg" : ""}`}>{l.n > 0 ? "+" : "−"}{Math.abs(l.n)}</td></tr>
            ))}
            <tr><td><b>Free to use now</b><br /><span className="small muted">What you can stake or spend</span></td><td className="n"><b>{s.credit}</b></td></tr>
            <tr><td><b>Earned</b><br /><span className="small muted">Shown on your profile. Stakes held and credit spent do not lower it.</span></td><td className="n"><b>{s.earned}</b></td></tr>
          </tbody></table></div>
        </div>
      )}
      {me.role === "student" && me.verified ? (
        <div className="card" style={{ maxWidth: 620 }}>
          <h2>Send credit to someone</h2>
          <p className="small muted">For example, to cover a newcomer&apos;s stake. What you send is theirs to stake or spend. It does not count as earned for them, so it cannot raise anyone&apos;s standing, skills or credibility.</p>
          {s.earned < G.minSenderCredit ? <span className="muted">You need {G.minSenderCredit} earned credit before you can send any. You have {s.earned}.</span> : (
            <F action={A.sendGift} back="/credit" className="row" confirm="Send this credit? It cannot be taken back.">
              <select name="to" id="gift-to" defaultValue="" required aria-label="Who to send to" style={{ flex: "1 1 180px" }}><option value="" disabled>Pick a person</option>{mates.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
              <input type="number" name="amount" id="gift-amount" min={1} max={G.pairMax} placeholder="Amount" required aria-label="Amount" style={{ flex: "0 1 110px" }} />
              <button className="btn ghost">Send</button>
            </F>
          )}
          <span className="small muted">Limits: {G.pairMax} between the same two people, and {G.senderMax} sent or {G.receiverMax} received per person, every {G.windowDays} days. Both accounts must be {G.minAccountDays} days old.</span>
        </div>
      ) : null}
      <Rules />
    </>
  );
}
