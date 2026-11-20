# Example 14. GitHub stars (Claude, 2026-11-20)

Part of [COLLAB.md](COLLAB.md). Same template as examples 1–12. GitHub doesn't publish its ranking code, so this
is what GitHub has said in public plus what outside researchers measured. Anything else is marked *(unsure)*.

## How it works

- A star is one click by a signed-in account on a repo. Each account can star a repo once, and the count is
  public. GitHub describes it as a way to bookmark repos and show appreciation.
- Stars feed discovery: search results, topic pages and the Trending page. Trending is described as what the
  community is "most excited about today". As far as outsiders can tell, it ranks by stars gained recently
  compared with the repo's usual rate, not by total stars, so a small repo having a good day can trend above a
  huge one *(unsure: the exact formula isn't public)*.
- Next to stars, GitHub shows signals that are harder to fake: forks, contributors, and "Used by" (other public
  repos that depend on this one).

## What it gets right

- **Velocity, not just totals.** Ranking by recent gain against a repo's own baseline lets new work surface
  without old giants keeping the top spots forever.
- **One per person.** Nobody can star twice, so the only way to inflate is more accounts.
- **Showing harder signals next to the cheap one.** A repo with 10,000 stars and nobody depending on it tells you
  something. Visitors learn to look at both.

## How people game it, and what GitHub does about it

- **Bought stars.** Services sell stars by the thousand, delivered from throwaway accounts. A 2024 study by
  researchers at Carnegie Mellon and Socket (the "StarScout" study) estimated about 4.5 million suspected fake
  stars, rising sharply in 2024, mostly on short-lived repos: crypto, malware lures, and AI tools wanting to look
  popular *(unsure on exact figures; the order of magnitude is what matters)*.
- **How they were caught.** Two patterns: (1) **low-activity accounts**, made recently, with almost no history
  except starring; (2) **lockstep**, where the same group of accounts stars the same set of repos within a short
  time. GitHub removes accounts it finds doing this, and the stars go with them *(unsure about how systematic
  this is)*.
- **Star-for-star swaps.** Developers trade stars in groups. That looks like real accounts, so it's harder to catch.
  It's the same shape as a vouch ring.
- **Stars don't mean use.** Plenty of starred repos are never run. That's why researchers and investors check
  dependents, downloads and issue activity instead.

## What Connect has already

- **One per person:** a vouch is one row per pair (`vouches` primary key `(from_id, to_id)` in `lib/db.ts`).
- **Weighting by account quality**, which is what GitHub would need against throwaway accounts: a vouch is worth
  `vouch × credWeight(voucher)` (`lib/credit.ts`). Credibility includes account age and breadth (`lib/credibility.ts`).
- **A hard cap:** only the 5 strongest vouches count (`RULES.vouchesCounted`). GitHub has no cap, which is why
  buying stars works at all.
- **A harder signal than the cheap one:** credit only comes from shipped projects that outside reviewers
  confirmed, and Connect requests the live link itself (`lib/live.ts`). That's Connect's "Used by".
- **Swap groups:** the ring rule (P0/P5) is Connect's answer to star-for-star swaps.

## Lessons for Connect

- **Take: look for lockstep in time.** Today's ring rule looks at *who* vouches for whom, not *when*. A burst of
  vouches or skill ticks, all from the same few people within a day or two, after a project ships, is exactly
  the StarScout pattern. Flag it for admins only; don't score it. (C13)
- **Adapt: velocity for discovery, totals for trust.** If Connect ever ranks projects (a "shipping this month"
  board), use recent confirmations against the college's usual rate, as Trending does. Never use velocity for
  credit or credibility, because a burst is easy to arrange. (C14)
- **Take: "used by" as evidence.** When one Connect project builds on another (a club's app uses another team's
  API), that's revealed preference and very hard to fake within a college. It could become Tier A evidence for
  the skills involved, confirmed by the team that uses it. (C15)
- **Avoid: anything that's free and unlimited.** Stars cost nothing, so they say little. Every Connect signal
  should cost something real (a shipped project, a stake, a reviewed delivery) or be capped.

## New candidates (not built; for the next round)

- **C13** Lockstep flag: N or more vouches or ticks from the same small set of people within 48 hours, shown in the
  admin queue with no effect on numbers.
- **C14** A "shipping now" board for discovery ranked by recent confirmations; never used for credit.
- **C15** "Used by another project" as Tier A skill evidence, confirmed by the team that depends on it.
