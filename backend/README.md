# Connect

A network of colleges where students build projects together. Each college is its own private space. Credit comes only from projects that ship, and teammates and outside reviewers decide what each person earned.

## Run it locally

```bash
npm install
npm run seed   # wipes the local database and adds invented sample people and projects
npm run dev
```

Open http://localhost:3000 and pick a sample person on the sign-in page. That list only exists in development.

## Going live

You need two things: sign-in keys and a server with a disk.

### 1. Sign-in keys

Copy `.env.example` to `.env.local` (or set the same names in your host's dashboard).

- **Google.** In Google Cloud Console go to APIs & Services, Credentials, Create OAuth client ID, Web application. Add the redirect URI `<APP_URL>/api/auth/google/callback`. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- **LinkedIn** (optional). Create an app at linkedin.com/developers, add the product "Sign In with LinkedIn using OpenID Connect", set the redirect URL to `<APP_URL>/api/auth/linkedin/callback`.

Someone who uses both with the same verified email lands on one account.

### 2. The rest of the settings

- `APP_URL`: the public address, e.g. `https://connect.yourcollege.in`.
- `SESSION_SECRET`: a long random string (`openssl rand -hex 32`).
- `ADMIN_EMAILS`: your sign-in email. You become site admin: you open new colleges on non-academic domains and pick each college's admins at /admin/colleges.
- `SMTP_URL` (a Gmail app password works) or `RESEND_API_KEY`, plus `MAIL_FROM`: sends verification codes and inbox alerts by email. Without them, codes are printed in the server log in development, and in production students verify by signing in with a Google account on `COLLEGE_EMAIL_DOMAIN` (or an admin verifies them on /admin).
- `CONTACT_EMAIL`: optional, shown on the privacy page.
- `ADMIN_EMAILS`: your own sign-in email. Admins approve alumni, register clubs, handle reports and can ship a project with a single review.
- `GEMINI_API_KEY`: turns on "Write with AI" for resumes.

### 3. Hosting

Data lives in one SQLite file, so the host needs a persistent disk. A `Dockerfile` is included:

```bash
docker build -t connect .
docker run -p 3000:3000 -v connect-data:/data --env-file .env.local connect
```

Railway, Fly.io and Render all build this Dockerfile directly. Attach a volume at `/data`. Serverless hosts such as Vercel will not keep the data without moving to a hosted database.

`/api/health` answers uptime checks. Back up `/data/connect.db` on a schedule.

Do not run `npm run seed` on the live server. It wipes everything.

## What sign-in does and does not prove

Google and LinkedIn only share name, photo and email. Neither shares education. So:

- Each college is a separate space: board, people, clubs, funding, admin and messages. Nothing crosses between them except public profiles and a college's public page (/c/slug), which shows only counts and shipped projects.
- A student's college comes only from an email they prove: a Google sign-in with that address, or a code sent to it. Personal mail (Gmail, Yahoo...) is refused, lookalike domains do not match, and a verified account never moves college.
- A new college on an academic domain (.edu, .ac.in, .edu.in ...) opens the first time someone proves an address on it. Other domains wait for a site admin. Alumni pick their college and are approved by that college's admins.
- Direct messages between verified people at the same college, with project invites as cards, blocking, and a limit of five messages before the other person replies.
- Photos and files in chat: JPG, PNG, WebP, GIF up to 8 MB (shrunk to 2000px in the browser, which also drops photo location data); PDF, Word, PowerPoint, Excel and text files up to 10 MB. Up to 4 at once, 30 an hour and 100 MB a day per person. Files are checked by their bytes, stored next to the database in `uploads/`, and only the two people in the chat can open them. Keep that folder on the same disk volume as the database.
- The chat's attach menu: camera, photos and videos (videos up to 25 MB), documents, a project card, and voice notes (up to 5 minutes). Anything can be passed to other apps through the phone's share sheet, and once Connect is added to a home screen it appears in that share sheet too (/share).
- Voice and video calls between people at the same college: ringing on every open tab, accept or decline, mute, camera off, switch camera, screen share on computers, and a minimised view. Calls connect browser to browser (WebRTC); the server only rings and passes connection details over Server-Sent Events. Calls are logged in the chat, and missed calls also go to the inbox. For mobile data, add a TURN relay: `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` (recommended; short-lived credentials are fetched per hour), or Metered, or a fixed `TURN_URLS` relay. Without one, calls still try STUN.
- Push alerts (web push): calls ring and messages arrive with Connect closed, once someone turns alerts on in Settings or Messages. Needs `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`; make a pair once with `npx web-push generate-vapid-keys` and keep them (changing them means everyone turns alerts on again). Tapping Answer on the notification opens the chat and picks up; Decline declines without opening the app. On iPhone, push works after Connect is added to the Home Screen (iOS 16.4+).
- Alumni are approved by an admin by hand.

## The credit rules

All numbers are in `lib/credit.ts` (`RULES`). Credit is never stored. It is worked out from team, review and split records each time, so it cannot drift or be edited.

- Verified students start with 20.
- A project ships when two people outside the team with 50+ credit review its proof (or one admin). They choose 100 (live and in use), 60 (works, demo only) or send it back. The stricter verdict wins.
- Each teammate splits 100 between the others. Your share is the middle value of what they gave you.
- Asking to join holds 10. It returns on ship and is lost if you leave or two thirds of the team mark you as gone.
- A lead who drops a project loses 10.
- Vouches only count between people who shipped together, once per pair, worth up to 5.
- Solo projects earn half. Credit older than 18 months counts half.

## Checks

```bash
npm test          # the credit rules
npm run typecheck
npm run build
```

## Where things are

- `lib/db.ts` schema and database helpers
- `lib/credit.ts` the credit rules
- `lib/auth.ts` sessions and account records
- `lib/oauth.ts` Google and LinkedIn settings
- `lib/notify.ts` inbox entries, project timeline, rate limits
- `lib/resume.ts` what the AI is given and the Gemini call
- `app/actions.ts` every write, with its permission checks
- `app/client.tsx` the interactive pieces (board, people search, split sliders, toasts)
- `app/landing.tsx` the public home page
- `app/**/page.tsx` the screens
- `scripts/seed.ts` sample data, `scripts/test.ts` tests
- `prototype/connect.html` the first clickable mock-up

## Not built yet

- Real payments. Funding records promises and "paid" marks. Money moves outside the app.
- Rate limits are kept in memory, which is fine for one server.
