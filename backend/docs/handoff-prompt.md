# Prompt: carry on building Connect in a new chat

Paste everything below the line into a new Claude Code chat opened in `/Users/aadityasheth/connect`.

---

You are taking over **Connect**, a project I (the user) have been building with Claude in a long earlier chat. This message is the full handover. Read it all, then read the files it points to, before doing anything.

## 1. What Connect is

A "larp-proof" network for colleges. Students find teammates, build projects together and earn **credit only for what ships**, signed by their teammates and confirmed by reviewers. Self-written bios count for nothing. One board per college replaces the dozens of WhatsApp groups.

The audience is all colleges. **Never say "tier 3 college" anywhere**; just say "colleges". The growth story is using the same model inside **corporates**.

It is also my entry for **Startup Buildathon India 2026 (hack2skill)**. The team is me (Aaditya Sheth), Swayam Shah and Param Parikh. Never invent backgrounds or achievements for any of us; giving us roles is fine.

## 2. Where things are

- **Code:** `/Users/aadityasheth/connect`
- **GitHub:** `pt-scheon/connect`, remote `git@github.com:pt-scheon/connect.git` over SSH. Pushing works as `pt-scheon`.
- **Stack:**
  - Next.js 16.4.6 (App Router), React 19, TypeScript, server actions.
  - better-sqlite3: the schema is in `lib/db.ts`; new columns go in `COLUMNS`, which migrates on start.
  - Google Gemini via `@google/genai`: `gemini-3.8-flash`, falling back to `gemini-3.5-flash`.
  - Push alerts with `web-push`, email with `nodemailer`.
- **`AGENTS.md`:** this Next.js has breaking changes. Read the guide in `node_modules/next/dist/docs/` before writing Next code.
- **Commands:** `npm run dev` (port 3000), `npm test` (15 tests in `scripts/test.ts`), `npm run build`. `npm run seed` resets sample data; see the rules in section 8.
- **Live site (Railway):** https://connect-production-77ec4d79.up.railway.app
  - Railway project `connect`, service `connect`, environment `production`, in my workspace "pt-scheon's Projects".
  - Volume `connect-volume` mounted at `/data`; the database is `/data/connect.db`, uploads are `/data/uploads`.
  - Deployed with `railway up --service connect --detach` from the project folder. The Railway CLI is installed and logged in.
- **Pitch material:** `buildathon/`. Holds the final deck `Connect-Idea-Submission.pdf` (8 pages, team size 3), the form answers `idea-submission.md`, the template, logos, the architecture diagram, and the Swift PDF tools in `buildathon/tools/` that rebuild the deck.
- **Other prompts:** `docs/rating-redesign-prompt.md` is a separate, ready prompt for redesigning ratings and credit.

## 3. What is built (all committed and pushed; latest commit `9dd5e6b`)

- **Sign-in:** Google (working) and LinkedIn (code ready, no keys), in `lib/oauth.ts` and `app/api/auth/[provider]`. Accounts link by verified email. Sample-person sign-in exists in development only.
- **Colleges, kept separate:**
  - Each college is a private space: board, people, clubs, funding, admin and messages are all scoped by `college_id`.
  - A student's college comes **only** from a proven email: a Google sign-in on that domain, a 6-digit email code, or a confirmed sign-in email. Gmail and other personal addresses are refused, lookalike domains don't match, and verified accounts never move college.
  - New colleges on academic domains (.edu, .ac.in ...) open by themselves; others wait for a site admin at `/admin/colleges`.
  - Alumni pick their college and are approved by its admins.
  - Public pages: `/colleges` and `/c/[slug]`.
  - Code: `lib/college.ts`, `lib/domains.ts`.
- **Projects:** board with filters (including "Fits you"), roles, join requests with a stake and a pitch note, milestones, proof links, an "edit details" form, questions, an updates timeline, quiet-project nudges, review with notes, credit splits, and "gone" votes. Teammate suggestions live in `lib/match.ts`.
- **Credit:** `lib/credit.ts`. Computed on read from raw records and never stored. Shares are the median of what teammates give you, solo projects earn half, vouches are weighted, credit fades after 18 months, and there is a "circle" flag. Explained publicly at `/rules`.
- **Profiles:** a graph of who you worked with, a public resume (written by Gemini from signed facts), links, "open to projects", share and copy-link.
- **Messages (`/messages`):**
  - Direct messages within a college: block, five messages allowed before the other person replies, read receipts, unread badges.
  - Project invites and shared projects arrive as cards.
  - Attach menu: camera, photos and videos, documents (photos 8 MB, videos 25 MB, files 10 MB, 4 at a time, 30 an hour, 100 MB a day). Files are checked by their bytes and only the two people in the chat can open them.
  - Voice notes up to 5 minutes. Photos are shrunk in the browser, which also strips their location data.
  - Share to other apps; Connect also appears in the phone's share sheet (`/share`).
  - Code: `app/messages/*`, `app/chat-actions.ts`, `lib/chat.ts`, `lib/files.ts`, `app/api/files`, `app/api/messages/attach`.
- **Voice and video calls:**
  - WebRTC, with signalling over Server-Sent Events.
  - Ringing on every open tab, accept or decline, mute, camera off, switch camera, screen share, minimise.
  - Calls are logged in the chat, and missed calls go to the inbox.
  - Cloudflare TURN relay, using short-lived credentials.
  - Code: `app/calls/ui.tsx`, `lib/calls.ts`, `app/api/calls/*`.
- **Push alerts:**
  - A service worker (`public/sw.js`) rings for calls (Answer and Decline buttons) and shows messages when Connect is closed. People turn alerts on per device in Settings or Messages.
  - Code: `lib/push.ts`, `app/api/push`, `app/push-toggle.tsx`.
- **Everything else:**
  - Clubs, alumni funding (calls, grants, payments in parts), inbox, admin (verification queues, reports, suspend, hide).
  - Settings: email alerts, open to projects, download my data, delete account.
  - Privacy and Terms pages.
  - Dark-first theme with a light toggle, phone layouts, installable app (manifest and icons), link-preview images.
  - Gemini features: resume writer and reviewer "what should I check".

## 4. Verified so far

- **Calls:** tested between two separate browser sessions with stand-in camera feeds.
  - Video and voice both connected.
  - Decline, missed, busy and other-college refusal all worked.
  - Calls forced through the Cloudflare relay connected, including relay-only over encrypted port 443.
- **Push:**
  - Encrypted pushes decrypted correctly at a local stand-in push service.
  - The service worker logic is part of the tests.
  - **Not** yet tried on a real phone.
- **Live site:** every page loads, only Google sign-in is shown, Nirma University exists, the database is on the volume, and security headers are on.

## 5. Still to do (in priority order)

1. **Google sign-in on the live site.** In Google Cloud project `connect-514508` → Google Auth Platform → Clients → "Web client 1", add:
   - Authorised JavaScript origin: `https://connect-production-77ec4d79.up.railway.app`
   - Authorised redirect URI: `https://connect-production-77ec4d79.up.railway.app/api/auth/google/callback`
   - Keep the localhost entries.
   - This changes my account settings: ask me first, or let me do it.
2. **Publish the Google sign-in app.** Google Auth Platform → Audience → publish to production, so any Google account can sign in, not just test users. My click.
3. **GitHub auto-deploy.** The Railway service has `pt-scheon/connect` as its source, but no deploy triggers on push. I need to give Railway's GitHub app access to the repo. Until then, deploy with `railway up`.
4. **`railway.json` retires on 2026-12-01.** Convert it with `railway config migrate` (dry run first, then `--apply`, then `cutover`) so the health check and restart settings carry over.
5. **Test push and calls on real phones** once sign-in works on the live site: an Android phone in Chrome, and an iPhone with Connect added to the Home Screen (iOS 16.4+).
6. **Email (optional).** Codes and alerts need `SMTP_URL` (a Gmail app password works) or `RESEND_API_KEY`. Until then, students verify through a college Google sign-in, or admins verify them.
7. **Rating and credit redesign:** see `docs/rating-redesign-prompt.md`.
8. **Clean-up:** my Cloudflare account has a Workers project called `connect` from a deploy attempt. Connect can't run on Workers, so I may delete it. Don't touch it without asking.
9. **Hack2skill (my own actions):** add Swayam and Param to the team on the site, paste the answers from `buildathon/idea-submission.md`, and upload the deck PDF.
10. **Later ideas:** Postgres when there is more than one server (the rate limits and call presence are kept in memory, fine for one replica), payments, a native app.

## 6. Settings and secrets (names only; values are in `.env.local`, which git ignores)

- **Local `.env.local`:**
  - Set: `APP_URL`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `COLLEGE_EMAIL_DOMAIN` (nirmauni.ac.in), `ADMIN_EMAILS` (my Google account), `GEMINI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, `MAIL_FROM`.
  - Empty: LinkedIn keys, SMTP/Resend, Metered/TURN_URLS, `CONTACT_EMAIL`.
- **Railway:** the same keys, plus `COLLEGE_NAME=Nirma University` and `NODE_ENV=production`, and its **own** `SESSION_SECRET`. They were copied with `scripts/railway-secrets.sh`, which pipes values from `.env.local` without printing them; I run it myself. Setting it again logs everyone out.
- **Never** print, commit or type secret values. Check that keys exist by name and length only. Before every commit, scan the staged diff for the actual values in `.env.local`. My email appearing in the commit author line is not a leak.

## 7. Access I gave the earlier chat (ask me for each again here)

- Read and write access to `/Users/aadityasheth/connect`, and to `/Users/aadityasheth/Downloads` (that is where the deck template came from).
- Running commands, including git commit and push to `pt-scheon/connect`. Commit and push only when I ask; I said yes for each finished batch.
- The **built-in browser pane**. It is signed in to my Cloudflare dashboard and my Google Cloud console, and my own tab on `http://localhost:3000` is signed in to my real Connect account. Don't use or sign out that tab.
- **Railway CLI**, logged in as my account.
- **GitHub CLI** is installed but **not logged in** (`gh auth login` would be my step).
- **Antigravity CLI** (Google's agent): `~/.local/bin/agy --model gemini-3.8-flash-high --mode accept-edits --sandbox -p "<brief>"`. It cannot run shell commands in sandbox mode, so install packages yourself and have it only edit files.
- I once allowed taking over my computer (computer use) for a sign-in step. Ask again before doing that.
- **Things I always do myself:** logging in to services, creating accounts, entering card or payment details, publishing apps, changing account settings unless I say "do it", and typing secrets.

## 8. How to work with me

- **Explain in plain words.** Be honest about what was and wasn't tested.
- **Test in the browser before saying something works:**
  - Use `http://test.localhost:3000` and `http://call.localhost:3000`, which keep separate sign-ins (`*.localhost` is allowed in `next.config.ts`).
  - Sample people (Demo College, domain `college.example`) are on the sign-in page under "Development only". Tanvi (4) is an admin and leads LabSlot; Omkar (7), Kabir (3), Sneha (5) and others are students.
  - The browser pane has no camera or microphone, and blocks notifications and service workers. For calls, swap in stand-in media in the page (a canvas stream plus an audio oscillator) and inspect `RTCPeerConnection` stats.
- **Data safety:**
  - **Never run `npm run seed` on `data/connect.db`**: it wipes my real account. Use a scratch copy with `DATABASE_PATH=<scratch> npm run seed`.
  - Back up the database before risky changes. A backup from before colleges existed is at `data/connect.before-colleges.db`.
  - Clean up throwaway test users and test data afterwards.
- **Server:** restart the dev server after schema or env changes, because the database handle is cached. If port 3000 is busy, stop whatever is listening on it.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Deploy to Railway only when I ask, and check `/api/health` and the main pages afterwards.

## 9. Start by

1. Read `README.md`, `AGENTS.md`, `lib/db.ts`, `lib/credit.ts`, `app/actions.ts` and `app/layout.tsx`, and run `git log --oneline | head -20`.
2. Run `npm test` and `npm run build`, and check that the live site's `/api/health` returns ok.
3. Then ask me which item from section 5 to start with. My guess is item 1 (Google sign-in on the live site), so real students can use it.
