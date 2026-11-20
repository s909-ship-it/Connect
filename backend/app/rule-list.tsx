import { RULES as R } from "@/lib/credit";

/* How credit, skills, credibility and commissions work, in plain words. Shown on the public rules page and the
   signed-in credit page. Every number is read from RULES, so this page cannot drift from what the code does. */

const S = R.skill, C = R.cred, F = R.fit, K = R.comm, G = R.gift;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const cw = C.weights;
const newcomer = Math.round(100 * cw.finish * C.priorFinish) + Math.round(100 * cw.reviews * C.priorReviews) + Math.round(100 * cw.claims * C.priorClaims);

export const SECTIONS: { title: string; intro: string; rules: [string, string][] }[] = [
  {
    title: "Three things, kept apart",
    intro: "A profile shows three separate things. Mixing them into one number is what makes ratings easy to fake, so Connect keeps them apart. None of them can be raised by anything you type about yourself: not your skills list, not your bio, not your “what I did”, not a line marked “No proof”.",
    rules: [
      ["Credit", "How much finished work you have done with other people. It comes only from things other people confirm."],
      ["Skills", "How good you are at each thing, like React or PCB design, from 0 to 100, with how sure Connect is. Used to suggest you for roles."],
      ["Credibility", "How far your word can be trusted, from 0 to 100. It sets how much your vouches, reviews and ratings of others count."],
    ],
  },
  {
    title: "Credit",
    intro: "Credit is a record of finished work. You stake it to join projects and set it aside to commission work. It can never be bought.",
    rules: [
      ["You start with a little", `Verifying your college or work email gives you ${R.starter} credit, so you can join your first project.`],
      ["Only shipped work earns it", `A project is worth ${R.live} if reviewers confirm it is live and in use, and ${R.demo} if it works but is only a repo or a demo. Ideas, posts and certificates are worth nothing.`],
      ["Teammates set your share", "Each teammate splits 100 between the others. Your share is the middle value of what they gave you, so one friend giving you everything changes almost nothing. You never rate yourself."],
      ["Solo work earns half", `A solo project earns ${pct(R.soloFactor)} of its pot, since nobody else can sign for it.`],
      ["Joining costs a stake", `Asking to join holds ${R.stake} credit. It comes back when the project ships. If you leave, or two thirds of the team mark you as gone, it is lost.`],
      ["Dropping costs the lead", `A lead who drops a project loses ${R.stake} credit, and it stays on their profile. Teammates get their stakes back.`],
      ["Good reviews earn a little", `A review that matches the final outcome earns ${R.reviewReward} credit, up to ${R.reviewRewardCap} every 30 days.`],
      ["Commissions pay credit", "Finishing a commission earns its reward once the person who asked signs it off. See below."],
      ["Old credit fades", `Credit from a project shipped more than ${R.fadeMonths} months ago counts half.`],
      ["Earned and free to use are different", "Your profile shows what you have earned. Stakes held, rewards set aside and credit you send or spend lower what you can use right now, never what you earned."],
    ],
  },
  {
    title: "Vouches",
    intro: "A vouch says “I shipped with this person and they are good”. Because it is a signature, it is weighed like one.",
    rules: [
      ["Only teammates can vouch", "You can vouch only for someone you shipped a project with, once each."],
      ["A vouch weighs what its giver can be trusted", `A vouch is worth up to ${R.vouch} credit, scaled by the credibility of the person giving it. It counts half if you vouched for each other.`],
      ["Only the strongest few count", `Only your ${R.vouchesCounted} strongest vouches count. Collecting more adds nothing.`],
      ["Closed rings count a quarter", `A group of ${R.ringMin} to ${R.ringMax} people who only vouch for each other, have shipped with nobody else, and have shipped at least ${R.ringMinProjects} team projects whose whole team is inside the group, is flagged as a vouch ring. Their vouches for each other count ${pct(R.ringFactor)}, and each loses ${C.ringPenalty} credibility. It clears the moment one of them ships with someone new.`],
      ["Closed circles are flagged", `If ${3} or more of your shipped projects are all with the same one or two people, your profile says so and you lose ${C.circlePenalty} credibility.`],
    ],
  },
  {
    title: "Reviews",
    intro: "Outsiders decide what a project is worth. Connect picks them so the team cannot.",
    rules: [
      ["Reviewers have no tie to the team", `Connect picks ${R.review.invited} reviewers with ${R.reviewerMin}+ earned credit who have never been on a team with anyone on the project. People who can be trusted more are more likely to be picked. If too few people qualify, an admin of the community reviews it.`],
      ["Two matching verdicts decide", "If the first two reviewers agree, that is the outcome. If they disagree, a third reviewer or an admin decides, and the middle verdict wins. An admin's verdict always settles it."],
      ["Reviewers are checked too", `Every verdict is kept next to the final outcome. Reviewer accuracy only counts independent outcomes: admin spot checks within ${R.review.auditDays} days and tie-breaks. Reviewers who agree gain credibility; those who disagree lose it.`],
      ["Admin spot checks", `Admins can spot-check a project up to ${R.review.auditDays} days after it ships. An admin's verdict replaces the reviewers' and decides who reviewed accurately.`],
      ["Connect opens the live link", "A team can give one live link. Connect opens it itself when the project goes for review and shows reviewers whether it answered."],
      ["Odd splits get a second look", `If someone gets ${R.review.splitFlagAt} times an equal share or more but the project's record shows nothing from them, no milestone ticked, no update posted, nothing under “what I did”, an admin is asked to look. Nothing changes on its own.`],
    ],
  },
  {
    title: "Skills",
    intro: "A skill only counts when someone else says you used it. Typing it on your profile shows it with “No proof” and a score of nothing.",
    rules: [
      ["Teammates confirm skills", "After a project ships, each teammate ticks which of its skills every other teammate actually used. A skill counts for you once at least half of your teammates have ticked it. On a solo project, a reviewer or an admin does it."],
      ["One project cannot make an expert", `Every skill starts at ${S.prior}. Each piece of work pulls it towards how good that work was, but it takes several to move far: one live project on a three-person team lands below 50. The formula is a weighted average that starts at ${S.prior} with a weight of ${S.k}.`],
      ["What makes a piece of work count more", `Live work counts more than a demo. A bigger share, as your teammates set it, counts more. Work signed by people with higher credibility counts more. Work done outside Connect counts ${pct(S.tier.B)} as much as work Connect saw happen.`],
      ["Skills fade", `Confidence fades with an ${S.halfLifeMonths}-month half-life, so old work makes Connect less sure. The score itself fades more slowly, with a ${S.scoreHalfLifeMonths}-month half-life, so proven competence is not quickly erased. Each skill shows when evidence was last confirmed.`],
      ["Repeat ticks and pairs count less", `When every person who ticks a skill on a project has already ticked you for it before, it counts ${pct(S.repeatTick)}. On a two-person team where neither member has shipped with an outsider, verified outside evidence or a reviewer tick, evidence counts ${pct(S.pairFactor)} until confirmed from outside the pair.`],
      ["Each score says how sure it is", `Next to each score is low, medium or high confidence, and what it is based on, like “based on 3 shipped projects”. Confidence grows with the amount of work behind it.`],
      ["Hackathons and internships", "Add them with proof. A hackathon counts once a teammate on Connect or an admin confirms it; an internship once you confirm a code sent to your work email, or an admin checks your letter. Items that turn out false are rejected and lower your credibility."],
      ["Marks are not used", "CGPA, grades and exam results are not part of any score."],
    ],
  },
  {
    title: "Credibility",
    intro: `Credibility is out of 100. A new verified member starts at about ${newcomer}. It is made of five parts, and every part needs a few events before it moves far.`,
    rules: [
      ["Finishing what you join", `Up to ${Math.round(100 * cw.finish)} points: projects shipped and commissions finished, out of projects shipped, left, dropped as lead, and assigned commissions dropped.`],
      ["Accurate reviews", `Up to ${Math.round(100 * cw.reviews)} points: reviews that matched the final outcome, out of all your reviews.`],
      ["Evidence that checked out", `Up to ${Math.round(100 * cw.claims)} points: hackathons and internships that were verified, out of those verified or rejected.`],
      ["Time on Connect", `Up to ${Math.round(100 * cw.age)} points, full after ${C.ageFullMonths} months.`],
      ["Different people shipped with", `Up to ${Math.round(100 * cw.breadth)} points, full at ${C.breadthFullAt} different people.`],
      ["Upheld reports cost it", `Each report an admin upholds against you takes ${C.reportPenalty} points, fading over ${S.halfLifeMonths} months. A commission dispute decided against you counts the same way.`],
      ["Nobody counts for nothing", `When credibility weighs a signature, it never counts for less than ${pct(C.floor)}.`],
    ],
  },
  {
    title: "Who gets suggested for a role",
    intro: "Leads list the skills a role needs, most important first. People are ranked by:",
    rules: [
      ["Confirmed skills", `Ranked by cautious score (${S.prior} + (score − ${S.prior}) × confidence), so fresh evidence beats stale claims. A needed skill with no proof counts ${S.prior} × ${pct(F.missing)}.`],
      ["Finishing", "How often they finish what they join."],
      ["Room for more", `People marked open to projects rank higher. Someone on more than ${F.freeLoad} things at once loses ${pct(F.loadStep)} for each extra one.`],
      ["Having shipped with the team", `A ${pct(F.teamBonus)} bonus for having shipped with someone already on it.`],
      ["Every suggestion says why", "For example: “Fits: React 62, from 3 shipped projects · finished 5 of 5 joined”. People who listed a skill but have nothing confirmed are shown apart, as new, and are never ranked above proof."],
    ],
  },
  {
    title: "Commissions",
    intro: "Ask someone to build something for you, or take a job on. The reward is credit, held until the job is signed off.",
    rules: [
      ["Posting", `You need ${K.minClientCredit} earned credit to post. The reward, between ${K.minReward} and ${K.maxReward}, is set aside from your free credit. You can have ${K.openMax} running at once. Cancel before picking someone and it comes back.`],
      ["Picking", "Applicants are ranked the same way as for roles, with a reason for each. You pick one."],
      ["Sign-off checklist", `The client checks whether the work was delivered on time and matched the brief, and rates the work from 1 to 5. A private “would hire again” question is shown only as a total once the doer has worked for ${K.hireAgainMin} different clients. Above ${K.reviewerAbove} credit, an outside reviewer checks it first.`],
      ["One-sided ratings", "Ratings on commissions are strictly one-sided: only the person who posted rates the work. The doer does not rate the client back, preventing retaliatory reviews and feedback extortion."],
      ["What the doer gets", "The reward, and the rating counts towards their skills, weighted by how far your word can be trusted. Abandoning or losing an assigned commission lowers your finishing credibility."],
      ["Disputes", `Either side can send a running job to the community's admins. They pay the reward, return it, or split it. If you never answer a delivery, after ${K.silentDays} days the doer can send it to them.`],
      ["No farming", `The same two people can do ${K.pairMaxCount} commissions together, and move ${K.pairMaxCredit} credit between them, every ${K.pairWindowMonths} months, counting both directions and jobs still running.`],
      ["Alumni", `Alumni have no credit to spend. Their commissions can award up to ${K.alumAllowance} credit every 30 days, and always get an outside check.`],
      ["Money", "Only alumni and clubs can add money to a commission. Connect records it and whether it was marked as paid; the money moves directly between the two people."],
      ["No coursework", "Graded coursework, assignments, lab records and exams are not allowed. A commission an admin finds to be coursework is removed, nobody is paid, the reward is not returned, and it goes on the poster's record."],
    ],
  },
  {
    title: "Sending credit",
    intro: "You can send some of your credit to someone in your community, for example to cover a newcomer's stake.",
    rules: [
      ["It is theirs to use, not to show", "Credit you send can be staked or spent by the person who gets it. It never counts as earned, so it cannot raise anyone's standing, skills or credibility."],
      ["Limits", `You need ${G.minSenderCredit} earned credit to send any. Both accounts must be ${G.minAccountDays} days old. At most ${G.pairMax} can pass between the same two people, and a person can send ${G.senderMax} and receive ${G.receiverMax}, every ${G.windowDays} days.`],
    ],
  },
];

/* The short version, for places that only need the basics. */
export const RULE_TEXT: [string, string][] = SECTIONS[1].rules;

export function Rules() {
  return (
    <div className="stack">
      {SECTIONS.map((s) => (
        <section key={s.title} className="stack tight">
          <h2>{s.title}</h2>
          <p className="muted">{s.intro}</p>
          <div className="grid">{s.rules.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p>{d}</p></div>)}</div>
        </section>
      ))}
    </div>
  );
}
