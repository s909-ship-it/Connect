import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { Rules } from "../rule-list";

export const metadata = { title: "How rating works" };

/* Public: anyone deciding whether to trust a Connect profile can read exactly how the number is made. */
export default async function RulesPage() {
  const me = await currentUser();
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>How Connect rates people</h1>
        <p>Credit, skills and credibility, and exactly how each one is worked out. Nothing you type about yourself can raise any of them.</p>
      </div></div>
      <Rules />
      {!me && <div><Link className="btn" href="/signin">Join your community on Connect</Link></div>}
    </>
  );
}
