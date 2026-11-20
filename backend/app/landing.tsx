import Link from "next/link";
import { get } from "@/lib/db";
import { RULES } from "@/lib/credit";
import { Count, Simulator } from "./client";
import { inr } from "./ui";
import { SignInButtons } from "./signin/buttons";

/* The numbers row stays hidden until a college has enough activity for it to mean something. */
const SHOW_STATS = { students: 25, shipped: 3 };

/* Two invented profiles that show what a record looks like. Labelled as examples on the page. */
const PROFILES = [
  {
    head: "Built three things", credit: 111, facts: ["3 shipped of 4 joined", "worked with 4 people"],
    lines: [["Bus tracker", "hardware", "Signed by 2 teammates", "ok"], ["Fest entry passes", "scanner rig", "Signed by 2 teammates", "ok"], ["Solar heater logger", "firmware", "Signed by 1 teammate", "ok"]],
  },
  {
    head: "Founder | AI | Web3", credit: 0, facts: ["0 shipped of 3 joined", "left 3"],
    lines: [["Built 10+ full-stack apps", "", "No proof", "no"], ["Led a 200-member community", "", "No proof", "no"], ["Canteen pre-order app", "", "Dropped it", "bad"]],
  },
] as const;

const CAMPUS: [string, string][] = [
  ["Members", "One project board instead of fifty group chats. See who has worked with whom before you say yes."],
  ["Clubs", "A roster the lead confirms each semester. Tap a member to see what they have built."],
  ["Alumni", "Fund a project one milestone at a time. Teams need real credit to apply."],
  ["Recruiters", "Every member has a shareable resume link where each line is signed by the people who were there."],
];

/* What a signed-out visitor sees. Styled in app/public.css. */
export function Landing() {
  const shipped = get("SELECT COUNT(*) n FROM projects WHERE status='shipped' AND hidden=0").n;
  const students = get("SELECT COUNT(*) n FROM users WHERE role='student' AND verified=1 AND suspended=0").n;
  const money = get("SELECT COALESCE(SUM(amount),0) n FROM grants").n;
  const steps: [string, string][] = [
    ["Join a team, with a stake", `Find a project that needs your skill and ask to join. ${RULES.stake} of your credit is held until it ships.`],
    ["Build, and link the proof", "Tick off milestones. Link the live site, the repo, the demo. Write one line on what you did."],
    ["Two outsiders review it", `People who were not on the team open the proof and decide what it is worth: ${RULES.live}, ${RULES.demo}, or not ready.`],
    ["Teammates split the credit", "Each teammate divides the project between the others. You never set your own share."],
  ];
  return (
    <div className="pub">
      <section className="pub-hero">
        <div className="pub-wrap pub-hero-grid">
          <div className="pub-hero-text">
            <h1>Credit only for <span className="grad">what ships.</span></h1>
            <p className="lead">Find a team in your community, like your college or your workplace. Your teammates sign what you built.</p>
            <SignInButtons large />
            <p className="pub-byline">Free to join. One account per college or work email, and each community is its own private space. <Link href="/colleges">See the communities</Link>.</p>
          </div>
          <div className="pub-hero-sim">
            <Simulator />
          </div>
        </div>
      </section>

      {students >= SHOW_STATS.students && shipped >= SHOW_STATS.shipped && (
        <section className="pub-score" aria-label="Connect so far">
          <div className="pub-wrap pub-score-row">
            <div><b><Count to={students} /></b><span>verified members</span></div>
            <div><b><Count to={shipped} /></b><span>projects shipped and reviewed</span></div>
            {money > 0 && <div><b>{inr(money)}</b><span>committed by alumni</span></div>}
          </div>
        </section>
      )}

      <section className="pub-sec">
        <div className="pub-wrap pub-aside">
          <h2>How a project becomes credit</h2>
          <ol className="pub-rows">
            {steps.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}
          </ol>
        </div>
      </section>

      <section className="pub-band">
        <div className="pub-wrap">
          <div className="pub-head">
            <h2>Same community, two profiles</h2>
            <p className="lead">These two are examples. On Connect a profile shows the record, so you can tell them apart in five seconds.</p>
          </div>
          <div className="pub-versus">
            {PROFILES.map((p) => (
              <article key={p.head} className="pub-record">
                <header>
                  <h3>{p.head}</h3>
                  <p className="pub-credit"><b>{p.credit}</b><span>credit</span></p>
                </header>
                <ul className="pub-facts">{p.facts.map((f) => <li key={f} className={f.startsWith("left") ? "neg" : undefined}>{f}</li>)}</ul>
                <table>
                  <tbody>
                    {p.lines.map(([what, kind, mark, tone]) => (
                      <tr key={what}>
                        <th scope="row" className={tone === "no" ? "muted" : undefined}>{what}{kind && <span>{kind}</span>}</th>
                        <td><span className={`pub-mark ${tone}`}>{mark}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="pub-sec">
        <div className="pub-wrap">
          <h2>One place for the whole community</h2>
          <div className="pub-cols">
            {CAMPUS.map(([t, d]) => <div key={t}><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="pub-ink">
        <div className="pub-wrap pub-close">
          <p className="pub-statement">A big bio earns nothing here.</p>
          <div className="pub-actions"><Link className="btn lg" href="/signin">Get started</Link><Link href="/rules">Read the credit rules</Link></div>
        </div>
      </section>
    </div>
  );
}
