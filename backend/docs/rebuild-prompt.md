# Rebuild Connect from zero in 10 messages

Open a new Claude Code chat in an **empty folder**. Paste each message below, one at a time. Wait until a message's "Done when" list is all true before sending the next one. Message 1 holds the rules the whole build follows, so always send it first.

None of these messages contains a secret. You type keys into `.env.local` yourself, when a message asks for them.

---

## Message 1 — The brief, the rules and the skeleton

```
We are building Connect from zero over 10 messages. This first message is the brief and the rules for all of them. Read it all, then do only the part marked "Build now".

WHAT CONNECT IS
A "larp-proof" project network for colleges. Students find teammates, build projects together, and earn credit only for work that ships, signed by their teammates and confirmed by reviewers outside the team. Nothing a person types about themselves (bio, skills list, claims) ever counts towards their score. Each college is its own private space with one project board, replacing dozens of WhatsApp groups. It is our entry for Startup Buildathon India 2026. The team is Aaditya Sheth, Swayam Shah and Param Parikh.

RULES FOR EVERY MESSAGE
- Never write "tier 3 college"; say "colleges". Never invent backgrounds, achievements, numbers, testimonials or logos for the team or the product.
- Never print, commit or type secret values. Check keys exist by name and length only. Before every commit, scan the staged diff for the values in .env.local.
- Commit only when I ask. Deploy only when I ask.
- I do these myself: logging in to services, creating accounts, payment details, and typing secrets.
- Explain in plain words. Test in a real browser before saying something works, and say clearly what was and wasn't tested.
- `npm run seed` wipes the database. Never run it on data/connect.db once I have a real account; use DATABASE_PATH=<scratch copy> instead.
- Next.js may be newer than you know: read node_modules/next/dist/docs/ before writing Next code and heed deprecations.

STACK
Next.js (latest, App Router, server actions, TypeScript), React 19, better-sqlite3 (one file at data/connect.db, or DATABASE_PATH), no ORM, no CSS framework. Later: nodemailer, web-push, @google/genai. Hosting: Railway with a volume at /data, from a Dockerfile.

BUILD NOW (message 1 of 10)
1. Create the Next.js app. Add better-sqlite3 and tsx.
2. lib/db.ts: open the database (WAL mode), helpers get/all/run/now, a `CREATE TABLE IF NOT EXISTS` schema, and a COLUMNS list of [table, column, type] that is added on start if missing (add-only migrations, inside an immediate transaction). During `next build` use an in-memory database.
3. Tables to start: users (name, email, picture, role student/alumni, college_id, college_email, verified, onboarded, super, suspended, deleted, created_at), identities (sub like "google:123", user_id), colleges (name, slug, domain, status), notifications.
4. Sessions: cookie `sid` = "<userId>.<HMAC>" signed with SESSION_SECRET, httpOnly, sameSite lax, secure in production. lib/auth.ts with currentUser() and requireUser().
5. Development-only sign-in: /signin lists sample people when NODE_ENV is not production. scripts/seed.ts makes about 10 invented sample students at one sample college.
6. A plain layout with a top bar (logo, Board, People, Inbox, avatar menu) and a bottom tab bar on phones. /api/health returns {"ok":true}.
7. scripts/test.ts using node:test, run by `npm test`.

DONE WHEN: `npm run dev` works, I can sign in as a sample person, `npm test` and `npm run build` pass. Show me in the browser.
```

## Message 2 — Real sign-in and colleges kept apart

```
Message 2 of 10: real sign-in and college verification.

- Google sign-in (OAuth 2 / OpenID Connect) and LinkedIn sign-in, written by hand in lib/oauth.ts and app/api/auth/[provider]/route.ts plus .../callback/route.ts. Use a random `state` checked with a timing-safe compare, 10-second fetch timeouts, and type checks on what the provider returns. Keep only https photos. Accounts link by verified email, so someone using both lands on one account.
- A college comes ONLY from an email the person proves: a Google sign-in with that address, or a 6-digit code sent to it. Refuse personal mail (gmail, yahoo, outlook...). Lookalike domains must not match. A verified account never moves college.
- New colleges on academic domains (.edu, .ac.in, .edu.in, .edu.<cc>) open automatically the first time someone proves an address there. Other domains wait for a site admin at /admin/colleges. ADMIN_EMAILS makes those people site admins (super=1).
- Alumni pick their college and are approved by that college's admins.
- /onboarding: role, branch, year, skills, links. A rate limiter in lib/notify.ts (in memory, per key).
- .env.example with the names only: APP_URL, SESSION_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, ADMIN_EMAILS, DATABASE_PATH.
- Every later query is scoped by college_id. Write that rule as a comment at the top of lib/college.ts with isMember(user).

Tell me exactly which redirect URI to add in Google Cloud Console. I will create the keys and put them in .env.local myself.

DONE WHEN: tests cover domain matching (personal mail refused, lookalikes refused, academic domains accepted), and a real Google sign-in works on localhost after I add the keys.
```

## Message 3 — Projects and the board

```
Message 3 of 10: projects.

- Tables: projects (college_id, lead_id, title, pitch, status idea/building/review/shipped/dropped, live_url, repo_url, created_at), members, roles (title, skills), requests (join requests with a short pitch note), milestones, proofs, updates (timeline), comments (questions and answers), follows, project_skills, role_skills.
- Home page for signed-in members is the board: project cards with filters (Building, Looking for people, Shipped, "Fits you"), and search.
- /projects/new and /projects/[id]: roles with "Ask to join", the lead accepts or declines, milestones the team ticks, an updates timeline, questions from anyone at the college answered by the team, follow, and "Edit details" for the lead.
- lib/match.ts: suggest teammates for a role from confirmed skills (self-typed skills only break ties, never rank).
- Inbox entries (notifications table) for join requests, answers, accepts. /inbox page.
- /people: everyone verified at the college, with search and an "Open to projects" filter.
- Every write is a server action in app/actions.ts that checks the user, the college and the permission first.

DONE WHEN: as two sample people I can post a project, ask to join, accept, tick a milestone and answer a question, and each step shows in the other person's inbox.
```

## Message 4 — Shipping, reviews and credit

```
Message 4 of 10: the credit rules. Put every number in lib/rules.ts (RULES). Credit is NEVER stored: compute it on read from team, review and split records, so it cannot drift or be edited. Explain the rules in plain words at /rules.

- Verified students start with 20 credit.
- A project ships when two people outside the team, each with 50+ credit, review its proof (or one admin does). Each picks 100 (live and in use), 60 (works, demo only) or "send back". The stricter verdict wins. Reviewers can't review their own team.
- Live check: Connect fetches the project's live URL itself, and only ever to a public address (block localhost, private ranges, link-local, cloud metadata; resolve DNS first). lib/live.ts.
- Splits: each teammate splits 100 between the others with sliders. Your share is the median of what they gave you.
- Asking to join holds 10 credit. It comes back on ship and is lost if you leave, or if two thirds of the team vote you "gone".
- A lead who drops a project loses 10.
- Vouches count only between people who shipped together, once per pair, worth up to 5.
- Solo projects earn half. Credit older than 18 months counts half.
- Flag a "circle" (the same few people only ever reviewing each other).

DONE WHEN: scripts/test.ts has a test for every rule above, they pass, and I can take a sample project from building to shipped in the browser and see everyone's credit change.
```

## Message 5 — Profiles, credibility and competency

```
Message 5 of 10: profiles and the three scores.

Show three separate things instead of one number, all computed on read, in one pass: credit → credibility → vouch credit → competency → relevance.
- Credit: how much verified work (from message 4).
- Credibility (0–100, lib/credibility.ts): how much to trust what someone says and signs. Goes up when they finish what they join and review accurately; down when they leave, get reported (upheld), or look like part of a ring. It weights their vouches, reviews and splits.
- Competency per skill (0–100 with confidence, lib/skills.ts): only from verified evidence that names the skill (skill ticks by teammates on shipped projects, checked evidence). Typed skills count for nothing.
- Relevance (lib/relevance.ts): how well someone fits one role, from confirmed competency, whether they finish things, and whether they have room.

/u/[id] profile: photo, name, college, the three scores each with a "why" breakdown line by line, shipped projects, a small graph of who they worked with, links, "Open to projects" badge, share and copy link, Report.

DONE WHEN: tests show that editing your own skills or bio changes none of the scores, and every number on a profile can be explained by its breakdown.
```

## Message 6 — Messages, files and voice notes

```
Message 6 of 10: direct messages.

- /messages and /messages/[id]: chats only between verified people at the same college. Five messages allowed before the other person replies. Block and unblock. Read receipts and unread badges in the top bar and tab bar.
- Project invites and shared projects arrive as cards in the chat.
- Attach menu: camera, photos and videos, documents, a project card, voice notes up to 5 minutes.
- Limits: images 8 MB (shrink to 2000 px in the browser, which also drops location data), videos 25 MB, files (PDF, Word, PowerPoint, Excel, text) 10 MB; 4 at a time, 30 an hour, 100 MB a day. Check files by their bytes, not the name. Store them in uploads/ next to the database, and serve them from /api/files/[key] only to the two people in that chat.
- Settings choice: "Who can start a chat with me": anyone verified at my college, or only people I have been on a project with.

DONE WHEN: as two sample people in two browser windows I can chat, send a photo, a PDF and a voice note, and a third person outside the chat gets refused when opening the file link.
```

## Message 7 — Calls and push alerts

```
Message 7 of 10: voice and video calls, and push alerts.

- Calls browser to browser with WebRTC. The server only rings and passes connection details over Server-Sent Events (/api/calls and /api/calls/events). Same college only, and only if the person allows calls in Settings.
- Ring on every open tab; accept, decline, busy; mute, camera off, switch camera, screen share on computers, a minimised view. Log calls in the chat; missed calls also go to the inbox. Show "📞" at the start of the tab title during a call.
- Sounds from the Web Audio API, no sound files (app/calls/tones.ts). The caller hears a classic ringback: 400 Hz + 450 Hz together, low-passed at 1400 Hz, quiet. The person called hears an old desk-phone bell: two gongs at 1245 and 1560 Hz swung by a 20 Hz clapper, with overtones at ×2.76 and ×5.4 and a 0.45 s fade. Rhythm for both: 0.4 s on, 0.2 s off, 0.4 s on, 2 s quiet.
- TURN relay for mobile data: Cloudflare TURN with short-lived credentials fetched per hour (CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN), else STUN only.
- Web push (web-push, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY): public/sw.js shows messages and rings for calls with Answer and Decline when Connect is closed. Turned on per device from Settings or Messages. A web app manifest and icons so it can be added to a home screen, and /share so Connect appears in the phone's share sheet.
- Show the unread count in the tab title "(2) Connect" and on the installed app icon with navigator.setAppBadge.

Tell me the command to make the VAPID keys; I will run it and add them myself.

DONE WHEN: a video call connects between two browser windows with stand-in cameras, decline and missed both work, and the service worker logic has tests.
```

## Message 8 — Clubs, funding, commissions, admin

```
Message 8 of 10: the rest of the college.

- Clubs: /clubs and /clubs/[id], registered by college admins, with members.
- Alumni funding (/funding): alumni post calls, students apply, grants are paid in parts against milestones. Record promises and "paid" marks only; no real money moves in the app.
- Commissions (/commissions): someone posts a paid-in-credit job with skills and milestones, others apply, the client assigns, the doer delivers, the client signs off or disputes. The reward is held while open. Anti-farming limits per pair of people over a rolling window, written as pure functions in lib/commissions.ts with tests.
- Reports on projects, people and commissions; admins hide, suspend or uphold.
- /admin for college admins (verification queue, alumni approval, reports, suspend, hide) and /admin/colleges for site admins.
- Public pages: /colleges and /c/[slug], showing only counts and shipped projects. Nothing else crosses between colleges.

DONE WHEN: each piece works as sample people, and tests cover the commission limits.
```

## Message 9 — Settings, security, email, AI

```
Message 9 of 10: settings, security, email and AI.

- /settings sections: Appearance (Light / Dark / Device, saved in a cookie), Alerts (push, email me my inbox, tell me about projects I follow), Who can reach you (open to projects, let people call me, who can start a chat), Sign-in security, Blocked people, Sign-in and devices (last sign-in and device; "Sign out of all other devices" raises a session version that is part of the cookie HMAC), Feedback, Your data (download everything as JSON from /api/me/export), Delete account (type "delete"; teammates' history keeps a "Deleted user").
- /feedback form (bug, idea, praise, other) with my history and the team's replies; /admin/feedback for site admins to set a status and reply, which reaches the sender's inbox.
- Email (lib/mail.ts) through SMTP_URL or RESEND_API_KEY with MAIL_FROM. Without them, print codes in the dev server log.
- Two-step sign-in: after Google or LinkedIn, a verified member on a new device types a 6-digit code emailed to their college address. Store only an HMAC of the code; one use; 10 minutes; locked after 5 wrong tries. "Trust this device for 90 days" sets a cookie stored hashed. Before sending a college-email code, check the domain has MX records. Only active when email is configured.
- A new-sign-in notice in the inbox, sign-in rate limits by IP, a "Trouble signing in?" help box on /signin.
- Security headers in next.config.ts: a Content Security Policy (default-src 'self'), COOP same-origin, no framing.
- Gemini (GEMINI_API_KEY, @google/genai): "Write with AI" for a public resume made only from signed facts, and "What should I check" help for reviewers. Both off without the key.
- /privacy and /terms in plain words, matching what the code actually does.

DONE WHEN: tests cover the code rules (expiry, one use, lockout, trusted device) and sign-out-everywhere, and every settings switch has been tried in the browser.
```

## Message 10 — Design, phone polish, deploy

```
Message 10 of 10: the look, the phone experience, and going live.

DESIGN: Apple-style. System font stack (-apple-system, SF Pro, Inter fallback), lots of space, rounded cards, pill buttons with a press state, round avatars, frosted top bar, one blue accent plus the Apple system colours (green, orange, red, purple, teal) for status badges and project icons, light and dark both designed. All colours as CSS variables on :root. Never `transition: all`. Visible focus rings. Respect reduced motion. Before changing the whole look, show me two options side by side in the browser and let me pick.
- A public landing page (app/landing.tsx) for signed-out visitors: what Connect is in one line, how credit works in three steps, and Sign in. No invented numbers, quotes or logos.
- Phones: no sideways scroll at 375 px; tap targets about 44 px on touch screens; the bottom tab bar with unread badges; the inbox grouped by Today, Yesterday, Earlier this week, Earlier this month, Older, with "N new" marks.
- Accessibility: every form field has a label or aria-label.
- Check every page at phone and desktop width with no console errors.

DEPLOY (only when I say go):
- Dockerfile (node, builds better-sqlite3, runs `next start`), railway.json, /api/health.
- On Railway: one service, a volume at /data, DATABASE_PATH=/data/connect.db, uploads in /data/uploads. I create the account and type the secrets; you give me the list of names to set.
- After deploy, check /api/health and the main pages, and tell me the production Google redirect URI to add.
- Write README.md: how to run, how to go live, the credit rules, where things are, what is not built yet.

DONE WHEN: the live URL answers health ok, I can sign in with Google on it, and you have told me exactly what is still untested (real email, calls on two real phones, push on a real phone).
```
