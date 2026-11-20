# Prompt: redesign Connect's rating and credit system

Paste everything below the line into a new Claude Code chat opened in `/Users/aadityasheth/connect`.

---

You are working on **Connect**, a college network where students find teammates, build projects and earn credit only for what ships. It is live on Railway at https://connect-production-77ec4d79.up.railway.app. Your job: **redesign how people are rated and how credit works**, so the platform can measure real competency and relevance for a given project, stay "larp-proof" (nothing you type about yourself raises your standing), and let people **commission others to do a project for them**.

## Read first

- `AGENTS.md`: this Next.js (16.4) differs from what you know. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next code.
- `lib/credit.ts`: today's credit. `RULES`, `shares()` (your share of a shipped project is the median of what teammates gave you), `compute()` (credit is computed on read from raw records, never stored; stakes, pots of 100/60, solo half, vouches weighted and mutual ones halved, 18-month fade, the "circle" flag).
- `lib/match.ts`: today's teammate suggestions (skills × proof).
- `lib/db.ts`: SQLite schema; new columns go in `COLUMNS` (it migrates on start). Everything is scoped by `college_id`.
- `app/actions.ts` (all writes go through `ctx()`), `app/projects/[id]/page.tsx`, `app/u/[id]/page.tsx`, `app/rules/page.tsx` and `app/rule-list.tsx` (the public explanation of credit), `scripts/test.ts` (15 tests, `npm test`), `scripts/seed.ts`.

## The model to build (refine it, but keep these principles)

Show **three separate things** instead of one number. Mixing them is what makes ratings easy to fake.

1. **Credit**: a record of verified work done. It is earned only from outcomes others confirm: shipped projects (split by teammates as now), completed commissions, and accurate reviewing. It is staked to join projects and escrowed to commission work. It is never bought.
2. **Competency, per skill (0–100, with confidence)**: how good someone is at React, PCB design, UI and so on. It is used to match people to projects. Use a Bayesian average so one lucky project cannot make someone an expert:
   `skill = (k·prior + Σ wᵢ·qᵢ) / (k + Σ wᵢ)`.
   - Each evidence item `i` has a quality `qᵢ` (0–1) and a weight `wᵢ = tier × recency × share × verifier credibility`.
   - Show confidence ("based on 3 shipped projects").
   - Decay with an 18-month half-life.
3. **Credibility (0–100)**: how much to trust what this person says and signs. It multiplies the weight of their vouches, reviews and credit splits. It is built from:
   - the share of their claims that got verified
   - how often they finish what they join
   - review accuracy (agreement with consensus or admin audit)
   - upheld reports against them
   - account age
   - collusion signals

### Evidence tiers (this is the anti-larp core)

- **Tier A, verified by Connect (full weight):**
  - shipped projects that reviewers confirmed and teammates signed
  - completed commissions signed off by the client
  - reviews that matched consensus
  - a "live" project whose URL Connect pings and finds up
  - commits in the project's linked GitHub repo by the person's verified GitHub account (only as a sanity check on splits, never as a score by itself)
- **Tier B, verified by a third party or an admin (partial weight):**
  - hackathon results with proof (organiser results page or certificate, confirmed by a teammate on Connect or an admin)
  - internships confirmed by a work email or an admin-checked letter
  - CGPA from a transcript checked by an admin (or DigiLocker, if feasible)
  - Tier B can lift competency, but less than Tier A, and CGPA is capped (for example at most 10% of any skill score, mapped only to related subjects).
- **Tier C, self-claimed:** shown with a "No proof" label (as today's claims are), weight zero.

### Relevance for a specific project

A project lists the skills it needs, each with an importance. A candidate's fit combines:
- importance × competency × confidence for each needed skill
- completion rate
- availability (open to projects; current active load, with a penalty above 2–3 active projects)
- a small bonus for having shipped with someone on the team

Every suggestion must explain itself, for example: "Fits: 2 reviewer-confirmed React projects, finished 5 of 5 joined".

### Anti-larp and anti-collusion

- **Reviewers:** assign them from outside the team's network (graph distance of 2 or more), weighted by credibility. Reviewers whose verdicts keep disagreeing with consensus or admin audits lose credibility.
- **Credit splits:** keep median-of-peers. Flag splits that contradict strong contribution signals, such as someone getting 60% with no commits and no "what I did".
- **Vouches:** limit how many people can vouch, and weight each vouch by the voucher's credibility. Detect small closed rings (extend the existing "circle" flag) and down-weight them.
- **Nothing typed counts:** no self-typed text ever raises Credit, Competency or Credibility.

### Commissions: "ask someone to do a project for me"

A student, club or alum posts a **commission**:
- what is needed
- the skills required
- a deadline
- a reward in credit, held in escrow, and optionally money, which Connect records but never handles, like alumni grants

People apply, ranked by relevance. The requester picks someone, and work is tracked by milestones. On delivery the requester signs off (a reviewer is needed for large rewards), and the doer gets the escrowed credit plus a rating from the client, weighted by the client's credibility. Disputes go to college admins.

Guard rails:
- Cap repeat transfers between the same pair, to stop credit farming.
- Requesters need some credit of their own.
- **Graded coursework, assignments and exams are not allowed.** State this in the terms, show it on the posting form, and add a report reason for it.

## How to work

1. **Plan first, then ask.** Write `docs/rating-design.md`: the formulas, every constant in one `RULES`-style object, the data model, the migration, and how today's credit maps onto the new model (existing earned credit must carry over). Then ask the user about these open decisions before building:
   - Use CGPA at all, and how much weight?
   - How to verify CGPA: admin-checked upload, or DigiLocker?
   - Can commissions carry money as well as credit?
   - Should credit be transferable at all outside commissions?
   - Which display: 0–100, letter bands, or percentile within the college?
2. **Build in phases. Commit after each phase, with tests:**
   - Credibility.
   - Per-skill competency.
   - Evidence tiers and verification queues for admins.
   - The relevance score used in teammate suggestions and the "Fits you" board filter.
   - Commissions.
   - Rewrite `/rules` so every number is explained in plain words.
3. **Keep these properties:**
   - Computed on read from raw records.
   - Everything scoped to the user's college.
   - Rate limits through `allow()`.
   - Every new action goes through `ctx()`.
4. **Tests:** add tests in `scripts/test.ts` for every formula and every attack, including:
   - a self-claim changes nothing
   - a vouch ring is down-weighted
   - a lone 95% split is pulled to the median
   - a commission between the same pair is capped
   - CGPA cannot exceed its cap
5. **Check it in the browser before calling it done.** Use the sample data: sign-in page → "Development only" list, Demo College. Do it on `http://test.localhost:3000` and `http://call.localhost:3000`, which keep separate sign-ins. The user's own `localhost` tab is signed in to their real account: do not use it.

## Rules

- **Never** run `npm run seed` against `data/connect.db`: it wipes the user's real account. Seed a scratch copy with `DATABASE_PATH=<scratch path> npm run seed`. Back up `data/connect.db` before any migration test.
- **Secrets:** never print, commit or type values from `.env.local`. Check that keys are present by length only. Scan staged diffs for secret values before every commit.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push to `origin main` only when the user agrees.
- **Deploys:** the live site deploys with `railway up --service connect --detach` from this folder; GitHub auto-deploy is not connected yet. Deploy only when the user asks. The live database is fresh, with no sample data.
- **Writing for users:** plain words, no jargon, as the existing pages do.
