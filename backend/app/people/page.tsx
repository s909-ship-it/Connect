import { all } from "@/lib/db";
import { requireMember, standings } from "@/lib/auth";
import { EMPTY } from "@/lib/credit";
import { ties, pathTo } from "@/lib/graph";
import { PeopleList, type Person } from "../client";
import { skillsOf } from "../ui";

export const metadata = { title: "People" };

export default async function People() {
  const me = await requireMember();
  const S = standings(), T = ties();
  const names = new Map(all("SELECT id, name FROM users").map((u) => [u.id, u.name]));
  const people: Person[] = all("SELECT * FROM users WHERE onboarded=1 AND role='student' AND suspended=0 AND verified=1 AND college_id=? AND id<>?", me.college_id, me.id).map((u) => {
    const s = S.get(u.id) ?? EMPTY;
    return {
      id: u.id, name: u.name, picture: u.picture, branch: u.branch, year: u.grad_year, verified: !!u.verified, skills: skillsOf(u),
      credit: s.earned, shipped: s.shipped, joined: s.joined, left: s.left, path: pathTo(T, me.id, u.id, names), open: !!u.open_to_join,
    };
  });
  return (
    <>
      <div className="head"><div className="stack tight">
        <h1>People</h1>
        <p>Everyone in your community on Connect. Each person shows how you are connected through projects.</p>
      </div></div>
      <PeopleList people={people} />
    </>
  );
}
