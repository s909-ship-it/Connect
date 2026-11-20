import { get } from "@/lib/db";
import { timeAgo } from "@/lib/notify";
import { isRunning, latestCheck, type Claim, type Status } from "@/lib/proofcheck";
import { runProofCheck } from "../../actions";
import { RunCheck } from "./run-check";
import "./proof-check.css";

const MARK: Record<Status | Claim["status"], [cls: string, sym: string, label: string]> = {
  ok: ["ok", "✓", "Checks out"], supported: ["ok", "✓", "Supported"],
  bad: ["bad", "✕", "Problem"], contradicted: ["bad", "✕", "Contradicted"],
  warn: ["warn", "!", "Worth a look"], unknown: ["unk", "?", "Could not tell"], unclear: ["unk", "?", "Unclear"],
};
function Mark({ s }: { s: Status | Claim["status"] }) {
  const [cls, sym, label] = MARK[s];
  return <span className={`pc-mark ${cls}`} role="img" aria-label={label} title={label}>{sym}</span>;
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/* The AI proof check on a project page: what Gemini found when it compared the team's claims with the evidence,
   who wrote the code, the automatic checks, and what to ask the team. Seen by the team, its reviewers and admins. */
export function ProofCheck({ projectId, canRun }: { projectId: number; canRun: boolean }) {
  const last = latestCheck(projectId);
  const busy = isRunning(projectId);
  const r = last?.report;
  // The report says "Member 1", "Member 2"…; show the people's names as they are now (or "a former member").
  const names = new Map((r?.members ?? []).map((m) => {
    const u = get("SELECT name, deleted FROM users WHERE id=?", m.userId);
    return [m.slot, u && !u.deleted ? String(u.name) : "a former member"];
  }));
  const named = (t: string) => t.replace(/\bMember (\d+)\b/g, (s, n) => names.get(Number(n)) ?? s);
  const tally = (k: Claim["status"]) => r?.ai?.claims.filter((c) => c.status === k).length ?? 0;
  const read = r ? [
    r.repos.length ? `${r.repos.length} GitHub repo${r.repos.length > 1 ? "s" : ""}` : "",
    r.sites.length ? `${r.sites.length === 1 ? "the live site" : `${r.sites.length} sites`}` : "",
    r.videos.length ? `${r.videos.length} video title${r.videos.length > 1 ? "s" : ""}` : "",
  ].filter(Boolean) : [];
  const top = Math.max(1, ...(r?.members ?? []).map((m) => m.commits), ...(r?.outsiders ?? []).map((o) => o.commits));

  return (
    <section className="card stack pc" id="proof-check" aria-labelledby="pc-h">
      <div className="row between pc-top">
        <div className="stack tight">
          <h2 id="pc-h">AI proof check</h2>
          <span className="small muted">{last
            ? `Ran ${timeAgo(last.at)}. Connect read ${read.length ? read.join(", ").replace(/, ([^,]*)$/, " and $1") : "nothing it could use"}, and Gemini compared what it found with the team's claims.`
            : "Connect reads this project's GitHub, live site and demo video, then Gemini compares them with what the team claims."}</span>
        </div>
        {canRun && <RunCheck id={projectId} action={runProofCheck} again={!!last} />}
      </div>
      {busy && <div className="note" role="status">A check is running now. Refresh in a minute to see it.</div>}
      {!last && !busy && <p className="small muted">{canRun ? "No check yet. It takes about half a minute." : "No check has run yet."}</p>}

      {r && (
        <>
          {r.ai ? (
            <>
              {r.ai.summary && <p className="pc-summary">{named(r.ai.summary)}</p>}
              <div className="row pc-tally">
                <span className="pill ok">{tally("supported")} supported</span>
                {tally("contradicted") > 0 && <span className="pill bad">{tally("contradicted")} contradicted</span>}
                <span className="pill plain">{tally("unclear")} unclear</span>
              </div>
              <ul className="pc-list" aria-label="Claims compared with the evidence">
                {r.ai.claims.map((c, i) => (
                  <li key={i}><Mark s={c.status} /><div><b>{named(c.claim)}</b><span>{named(c.evidence)}</span></div></li>
                ))}
              </ul>
            </>
          ) : <div className="note">The AI comparison did not run: {r.aiError} The automatic checks below still did.</div>}

          {(r.total > 0 || r.members.some((m) => m.login)) && (
            <div className="stack tight">
              <span className="label">Who wrote the code</span>
              <ul className="pc-commits">
                {r.members.map((m) => (
                  <li key={m.slot}>
                    <span className="pc-who"><b>{names.get(m.slot)}</b><span className="small muted">{m.role || "Member"}</span></span>
                    <span className="ov-bar" aria-hidden="true"><i style={{ width: `${m.commits ? Math.max(3, (m.commits / top) * 100) : 0}%` }} /></span>
                    <span className="small pc-n">{m.commits} commit{m.commits === 1 ? "" : "s"}{r.total ? ` · ${pct(m.share)}` : ""}<br />
                      <span className="muted">{!m.login && !m.matchedBy ? "No GitHub on profile" : m.lastAt ? `Last ${day(m.lastAt)}` : m.matchedBy ? `Matched by ${m.matchedBy}` : "None found"}</span></span>
                  </li>
                ))}
                {r.outsiders.map((o) => (
                  <li key={o.who} className="pc-out">
                    <span className="pc-who"><b>{o.who}</b><span className="small muted">Not linked to anyone on the team</span></span>
                    <span className="ov-bar" aria-hidden="true"><i style={{ width: `${Math.max(3, (o.commits / top) * 100)}%` }} /></span>
                    <span className="small pc-n">{o.commits} commit{o.commits === 1 ? "" : "s"} · {pct(o.share)}</span>
                  </li>
                ))}
              </ul>
              {r.repos.filter((x) => x.ok).map((x) => (
                <span key={x.full} className="small muted">
                  <a href={x.url} target="_blank" rel="noopener noreferrer nofollow">{x.full} ↗</a>{" "}
                  {(x.languages ?? []).slice(0, 3).map((l) => `${l.name} ${l.pct}%`).join(", ")}{x.totalCommits ? `, ${x.totalCommits} commits` : ""}
                </span>
              ))}
            </div>
          )}

          <div className="stack tight">
            <span className="label">Automatic checks</span>
            <ul className="pc-list pc-auto">
              {r.checks.map((c, i) => <li key={i}><Mark s={c.status} /><span>{named(c.text)}</span></li>)}
            </ul>
          </div>

          {r.ai && r.ai.questions.length > 0 && (
            <div className="stack tight">
              <span className="label">Ask the team</span>
              <ul className="pc-questions">{r.ai.questions.map((q, i) => <li key={i}>{named(q)}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <p className="small muted pc-foot">Gemini only compares the team&rsquo;s claims with what Connect read from public links. It can be wrong, it gives no verdict and it never changes credit: open the links yourself before you decide.</p>
    </section>
  );
}
