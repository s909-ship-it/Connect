/* Every number in the credit, competency, credibility and commission rules lives here. Change them in one place.
   The reasoning behind each one is in docs/rating-design.md. */
export const RULES = {
  // ---- credit ----
  starter: 20, // given once the college email is verified
  stake: 10, // held when you ask to join; lost if you leave or are voted gone
  live: 100, // pot for a project reviewers confirm is live and in use
  demo: 60, // pot for a project that works but is only a repo or demo
  soloFactor: 0.5, // solo projects have no teammates to sign, so they earn half
  vouch: 5, // the most a vouch can be worth
  fullWeightAt: 200, // old rule, kept for vouches made before the cutover
  fadeMonths: 18, // credit from projects older than this counts half
  reviewerMin: 50, // earned credit needed to review someone else's project
  reviewsNeeded: 2, // or one admin review
  cutover: 1794528000, // 13 Nov 2026. Vouches made before this keep their old weight, so no one's credit dropped that day.
  vouchesCounted: 5, // only your 5 strongest vouches count
  ringMin: 3, // a closed group of 3 to 6 people who only vouch for each other is a ring...
  ringMax: 6,
  ringMinProjects: 3, // ...once it has shipped this many team projects with nobody from outside on them
  ringFactor: 0.25, // vouches inside a ring count a quarter
  reviewReward: 3, // credit for a review that matched the final outcome
  reviewRewardCap: 15, // per 30 days

  // ---- credibility: how much to trust what a person says and signs ----
  cred: {
    weights: { finish: 0.35, reviews: 0.25, claims: 0.2, age: 0.1, breadth: 0.1 },
    k: 2, // strength of the starting assumption, counted in events
    priorFinish: 0.7,
    priorReviews: 0.7,
    priorClaims: 0.5,
    ageFullMonths: 6, // account age counts fully after 6 months
    breadthFullAt: 5, // distinct people shipped with, for full marks
    reportPenalty: 15, // per upheld report, fading with the skill half-life
    circlePenalty: 10, // closed-circle flag
    ringPenalty: 15, // member of a vouch ring
    floor: 0.2, // the least a signature can weigh
  },

  // ---- competency, per skill ----
  skill: {
    prior: 30, // score for a skill with no evidence
    k: 2, // one full-weight project moves you about a third of the way
    halfLifeMonths: 18, // how fast old work stops making us sure (confidence)
    scoreHalfLifeMonths: 36, // how fast old work stops counting towards the score itself
    repeatTick: 0.5, // a tick from someone who already ticked you for this skill on an earlier project
    pairFactor: 0.5, // two-person team, until someone outside the pair also confirms the skill
    tier: { A: 1, B: 0.5, C: 0 },
    qLive: 0.9,
    qDemo: 0.65,
    shareBoost: 0.25, // quality moves with your share compared with an equal split
    qHackWin: 0.9,
    qHackFinal: 0.75,
    qHackTookPart: 0.5,
    qInternship: 0.7,
    confLow: 0.33,
    confHigh: 0.66,
  },

  // ---- relevance: how well a person fits a role or commission ----
  fit: {
    missing: 0.5, // a needed skill with no proof counts as half the starting score
    notOpen: 0.6, // not marked "open to projects"
    freeLoad: 2, // active projects before the load penalty starts
    loadStep: 0.2, // lost per extra active project
    loadMin: 0.4,
    teamBonus: 0.1, // has shipped with someone already on the team
  },

  // ---- reviewers ----
  review: {
    minDistance: 2, // 1 = has been on a team with someone on the project
    invited: 4,
    splitFlagAt: 2, // a share this many times an equal share gets checked
    auditDays: 60, // an admin can spot-check a shipped project for this long
  },

  // ---- commissions ----
  comm: {
    minClientCredit: 30, // earned credit needed to post
    minReward: 5,
    maxReward: 60,
    reviewerAbove: 40, // rewards above this need an outside reviewer too
    pairWindowMonths: 6,
    pairMaxCount: 2, // paid commissions between the same two people per window
    pairMaxCredit: 60, // and total credit between them per window
    openMax: 3, // commissions one person can have open at once
    alumAllowance: 40, // credit an alum's commissions can award per 30 days
    hireAgainMin: 3, // "would hire again" is shown once this many different people have answered
    silentDays: 14, // a client who does not answer a delivery for this long can be sent to the admins
  },

  // ---- gifts: sending credit to someone ----
  gift: {
    minSenderCredit: 50, // earned credit needed to send any
    windowDays: 30,
    pairMax: 20, // between the same two people, both directions added, per window
    senderMax: 40,
    receiverMax: 40,
    minAccountDays: 30, // both accounts must be at least this old
  },
};

export const MONTH = 30 * 86400;
