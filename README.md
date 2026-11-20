# Connect showcase

A public showcase site for [Connect](https://github.com/pt-scheon/connect), designed in the visual style of melon.studio and filled with Connect's live data.

## What's new in this update

**Backend synced to upstream.** `backend/` is now Connect at `d6bc07f` (21 Nov 2026), up from `837d7a1`. That brings in team spaces, tiers, the Progress tab, profile photos, project images, anonymous mode and the cookie page. The public API was carried over and extended:

| Upstream change | What the showcase does with it |
|---|---|
| **Tiers / ranks** (`lib/tiers.ts`) | Every builder has a rank badge (index rows, the preview card, project teams). Builder pages show the rank, progress to the next rank and the ranks reached. |
| **Progress tab** (`lib/progress.ts`) | Builder pages get a credit-over-time chart and the latest dated gains. A private project's name reads "A private project", as on Connect. |
| **Profile photos** (`/api/avatar/:key`) | A photo the person uploaded is shown. Sign-in provider (Google/LinkedIn) photos still never are. Otherwise initials. |
| **Anonymous mode** (`lib/identity.ts`) | Listed by alias (`Anon 48213097`) with their pattern avatar, rank and totals only. Connect hides an anonymous person's resume, so they're never named on a project, in signed lines or with a history. `real_name` is never read. |
| **Project images** (`/api/pimage/:key`) | Not shown. They are members-only on Connect, so projects keep their typographic covers. |
| **Cookies page** | Linked in the footer and the Read column. |
| *Team chat, notes, tasks, calls* | Private to each team, so nothing on the showcase. |

**New endpoints:** `GET /api/public/me` and `POST /api/public/signout` power the account menu (avatar, top right). They use credentialed CORS and answer only trusted origins (`SHOWCASE_URL`, `PUBLIC_API_ORIGIN`, any localhost in development). They only ever return the visitor's own details.

**Design tweaks** (layout otherwise unchanged):
- The hero wordmark reads **CONNECT** in **Broadway** where installed. Broadway ships with Microsoft Office and can't be bundled, so other visitors see **Fascinate**, a free Art Deco fat-face (OFL, `frontend/app/fonts`). The wordmark now sits in the page flow, so it can't run into the header or the tagline at any width.
- The "Skills that shipped" section is removed (its API endpoint stays).
- Spacing is tighter: section padding, headings, list rows, the hero height, the footer. The home page shows the 8 most active colleges and links to the rest.
- Nav links are rounded pill buttons: frosted, white when current, "join" in colour. There's a round account button with a dropdown (profile, rank and progress, messages, inbox, settings, sign out; or sign in).
- Transitions: pages fade in on navigation (plus the View Transitions API where supported). The header frosts and changes colour smoothly on scroll. Menus animate open and closed.

```
connect-showcase/
├── backend/     Connect (pt-scheon/connect @ d6bc07f), unchanged apart from a public JSON API
│   ├── lib/public.ts               what the public API may show, and the queries behind it
│   ├── lib/public-http.ts          JSON + CORS helpers
│   ├── app/api/public/**/route.ts  the endpoints (below)
│   └── scripts/public.test.ts      privacy tests for the public API
├── frontend/    the showcase: Next.js 16 + React 19, plain CSS, Geist fonts
│   ├── app/                        pages: /, /work, /work/[id], /colleges, /colleges/[slug], /builders, /builders/[id]
│   ├── components/                 header, account menu, covers, avatars, rank badges, progress chart, carousel, builder index, motion, clock, form
│   ├── app/fonts/                  Fascinate (OFL), the free stand-in for Broadway on the hero wordmark
│   └── lib/api.ts                  typed client for the public API
├── .github/workflows/ci.yml   typecheck + tests + build for both apps on every push
├── docker-compose.yml
└── .env.example                    map of every variable in both apps
```

## Run it locally

You need Node 22. Use two terminals.

```bash
# 1. Backend (Connect) on :3000
cd backend
cp .env.example .env.local        # optional for local use; every value can stay empty
npm install
npm run seed                      # WIPES the local database and adds invented sample people and projects
node scripts/demo-data.js         # optional: ~70 made-up colleges and 880 people, for a fuller page
npm run dev

# 2. Showcase on :3001
cd frontend
cp .env.example .env.local        # defaults already point at http://localhost:3000
npm install
npm run dev
```

Open http://localhost:3001 for the showcase. The Connect app itself is at http://localhost:3000. In development its sign-in page lists the sample people.

If `npm install` in `backend/` fails while building `better-sqlite3` (for example because your network blocks nodejs.org header downloads), point it at your local Node headers: `npm_config_nodedir=$(dirname $(dirname $(which node))) npm install`.

**Docker:** fill in `backend/.env.local`, then run `docker compose up --build`. The showcase is on :3001 and the backend on :3000. I haven't tested this compose file; both Dockerfiles follow the repo's existing one.

**Production:** follow `backend/README.md` (OAuth keys, `SESSION_SECRET`, a persistent disk for SQLite). Deploy `frontend/` anywhere Next.js runs, including serverless, because it stores nothing itself. Set `CONNECT_API_URL` to the backend and `NEXT_PUBLIC_CONNECT_APP_URL` to the backend's public address. On the backend, set `SHOWCASE_URL` to the showcase's address so the account menu can read who is signed in. Both sites must share a registrable domain (for example `showcase.example.in` and `app.example.in`), because Connect's sign-in cookie is `SameSite=Lax`. On different domains the menu still works, but it always shows the signed-out state. Pages render per request, so the build never needs the backend. API responses are cached for `REVALIDATE_SECONDS`.

## Checks

```bash
cd backend && npm run typecheck && npm test      # 107 tests, including scripts/public.test.ts
cd frontend && npm run typecheck && npm run build
```

## Licence

`backend/` is a copy of [pt-scheon/connect](https://github.com/pt-scheon/connect), which has no licence file. Get the author's permission before you publish this repository publicly, or keep it private.

## The public API (added to the backend)

All endpoints are `GET`, read-only, need no auth and send `Access-Control-Allow-Origin: *` (narrow it with `PUBLIC_API_ORIGIN`).

| Endpoint | Returns | Used by |
|---|---|---|
| `/api/public/overview` | member / shipped / building / college counts, alumni money committed, the credit rule numbers | hero status, How it works, Join block |
| `/api/public/projects?college=&limit=` | shipped projects, newest first: name, pitch, verdict (live/demo), pot, date, college, skills, team size | Latest Work, /work, college pages |
| `/api/public/projects/:id` | one shipped project, plus proof labels and the named team (role and "what I did" line) | /work/:id |
| `/api/public/colleges` | active colleges with counts | Colleges list, nav count |
| `/api/public/colleges/:slug` | one college: domains, counts, shipped projects | /colleges/:slug |
| `/api/public/builders?limit=` | verified students with at least one shipped project, by credit earned | Builders index |
| `/api/public/builders/:id` | one builder's signed record: shipped projects, confirmed clubs, credit | /builders/:id |
| `/api/public/skills` | skills used across shipped projects, with counts | (not used since the Skills section was removed) |
| `/api/public/signed-lines?limit=` | "what I did" lines on shipped projects, with how many teammates signed | Signed, not said carousel |
| `GET /api/public/me` | the signed-in visitor (own name, picture, college, rank) or `{signedIn:false}`. Credentialed, trusted origins only | account menu |
| `POST /api/public/signout` | clears Connect's session cookie. Trusted origins only | account menu |

Builders, team members and signed lines also carry `avatar` (a path on Connect, or null), `tier` and `anonymous`. `/builders/:id` adds `rank` (with progress to the next) and `progress` (points, ranks reached, recent moves).
| `POST /api/public/college-interest` | **stub** (see TODOs) | "Bring Connect to your college" form |

**Privacy rule:** the API never shows more than a signed-out visitor can already see on Connect. That means a college's public page (`/c/slug`) and a verified student's resume link (`/u/id?tab=resume`). So it only covers active colleges, shipped and unhidden projects, and verified, active, onboarded students. It never includes emails, sign-in provider photos, anonymous people's real names, work in progress, open roles, messages, self-written claims, ledgers or credibility scores. `scripts/public.test.ts` checks this.

## How the two sources were combined

melon.studio is one designer's portfolio. Connect is a college project network. Each melon.studio section was mapped to the closest real Connect data:

| melon.studio section | Showcase section | Data |
|---|---|---|
| Hero: big wordmark, tagline, location clock, "open to projects" | "connect" wordmark on the liquid red gradient, Connect's tagline, IST clock, live "N projects being built now" | `overview` |
| Latest Work (caption + bending cover) | Latest shipped projects | `projects` |
| About me (statement that fills with colour as you scroll) | What Connect is (from Connect's README) | static copy |
| Experience (numbered rows with logo tiles) | How it works: 5 steps, numbers taken from Connect's live `RULES` | `overview.rules` |
| Freelance collaborators list | Colleges on Connect | `colleges` |
| Insights (article index with preview panel) | Builders index with a stats preview | `builders` |
| Testimonials carousel (01/03) | Signed lines carousel | `signed-lines` |
| Contact | Join, stats, rules links, interest form | `overview`, stub |
| Footer: huge wordmark, clock, legal links | Same layout, links to Connect's rules / privacy / terms | |

**Design system taken from the site:** near-black `#0f0000`, cream `#f6efed`, pure red `#ff0000` (plus `#e5524a` and `#ffb3b3`); white ink with 55% muted and 12% rules. Huge light display type (weight 300, tracking about −0.05em, line-height 0.86). Mono 13px captions. 40px gutters (20px on phones). Section spacing `clamp(72px, 9.5vw, 144px)`. The reveal easing `cubic-bezier(.11,.06,.18,1)`. Motion: reveal on scroll, project covers that bend in perspective as they pass, word-by-word colour fill, an animated liquid gradient, carousel slides, nav underline sweeps, row and tile hovers, a pulsing status dot, and a full-screen red menu on mobile. `prefers-reduced-motion` turns all of it off.

## Assumptions and where the sources didn't match

1. **Backend shape.** `pt-scheon/connect` is a full Next.js app (server actions + SQLite) with no JSON API for an outside frontend. I added `app/api/public/*` instead of rewriting it. The existing app, its UI and its server actions are untouched.
2. **Inspired by, not a clone.** The layout, type scale, colours and motion follow melon.studio. None of its brand, wordmark, text, photos, client logos or case studies are used, so the site can't be mistaken for Piotr Brzeziński's studio. Its fonts are commercial (early-sans, lekick), so Geist Sans and Geist Mono (free, OFL; melon.studio already uses Geist Mono) stand in. The blackletter hero wordmark is replaced by "CONNECT" in Broadway (Fascinate where Broadway isn't installed).
3. **Images.** Connect now lets teams add a project image, but only members can see it, so every project here keeps a typographic cover: its name set huge on a colour sheet, with the palette picked from the project id. People are shown by a photo they uploaded, by their pattern if they're anonymous, or by initials. Never by their Google or LinkedIn photo.
4. **No articles or testimonials in Connect.** Those slots carry builders and signed "what I did" lines, which are the closest public equivalents.
5. **The detail pages** (`/work/:id`, `/builders/:id`) only bring together facts that are already public separately (college page + resume links). Project pages inside Connect stay members-only, and the showcase links there only for colleges and resumes.
6. **"Real data."** Everything comes from the backend live. Locally that means Connect's own seed data, which is invented sample people. A deployed backend shows real ones. Nothing in the frontend is hard-coded except product copy taken from Connect itself.
7. **Counts in the nav** (work, colleges, builders) come from the same API. If the backend is down, pages show a "Can't reach Connect" screen instead of empty sections.
8. **404s.** A missing or non-public record shows the "Not here." page with a real 404 in production builds. `next dev` can report 200 for it.

## TODOs

- `// TODO:` in `backend/app/api/public/college-interest/route.ts`: Connect has nowhere to store interest from people who aren't signed in. The stub validates the request and logs it to the server console, and nothing is stored. The form says so and points people to the real route in: signing in with a college email opens an academic-domain college right away. To finish it, add a table, an admin list, rate limiting and a confirmation email.
- Optional: a Polish/Hindi toggle and cookie banner like the original. Connect sets no analytics cookies, so I left the banner out.
