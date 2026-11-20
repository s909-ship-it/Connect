# Task for Antigravity: move Connect's AI features to Gemini

You are working in a Next.js 16 (App Router, TypeScript) app called Connect. Read `AGENTS.md` and `README.md` first.
Another agent is working in this same folder at the same time, so stay inside the file list below.

**You cannot run shell commands in this session. Do not try: any command is denied and ends the session with nothing saved. Only read files and edit files.** The `@google/genai` package is already installed (see `package.json` and `node_modules/@google/genai`); read its type definitions there if you need the exact API. The other agent will run the type-check and tests after you finish.

## What to build

1. **Gemini helper** in a new file `lib/gemini.ts`
   - Use Google's official JavaScript SDK for the Gemini API (`@google/genai`). It is already installed.
   - Read the key from `GEMINI_API_KEY`. Read the model name from `GEMINI_MODEL`, defaulting to the current fast Gemini Flash model.
   - Export one function: `askGemini(system: string, user: string): Promise<{ text?: string; error?: string }>`.
   - Never throw. Return a short, plain-English `error` when the key is missing, rejected, rate limited, or the network fails.

2. **Resume writer** in `lib/resume.ts`
   - Replace the Anthropic call inside `writeResume` with `askGemini`. Remove the `@anthropic-ai/sdk` import from this file.
   - Keep the exported names and types exactly as they are: `ResumeFacts`, `resumeFacts`, `writeResume(facts)` returning `{ text?: string; error?: string }`.
   - Keep the `SYSTEM` prompt's rule: use only the facts in the JSON, invent nothing.
   - Keep the early return when there are no shipped projects.

3. **Proof summary for reviewers** in a new file `lib/review-help.ts`
   - Export `proofSummary(projectId: number): Promise<{ text?: string; error?: string }>`.
   - Load the project's name, pitch, milestones, proof labels and URLs, and each active member's role and "did" line from SQLite using the helpers in `lib/db.ts` (`all`, `get`). Table and column names are in the schema at the top of `lib/db.ts`.
   - Ask Gemini for a neutral summary of at most five short bullet lines that tells a reviewer what to check. It must not give a verdict or a score, and must say plainly that it has not opened the links.
   - Do not wire this into any page. The other agent will do that.

4. **Docs**
   - In `.env.example`, add `GEMINI_API_KEY=` and `GEMINI_MODEL=` with a one-line comment saying the key comes from Google AI Studio. Remove the `ANTHROPIC_API_KEY` lines.
   - In `README.md`, change the mentions of `ANTHROPIC_API_KEY` and Claude to Gemini.

## Files you may change

`lib/gemini.ts` (new), `lib/review-help.ts` (new), `lib/resume.ts`, `.env.example`, `README.md`.

Do not edit anything under `app/`, `scripts/`, `buildathon/`, or any other file in `lib/`. Do not run git commands. Do not start a dev server.

## Done means

- The code is written to pass `npx tsc --noEmit` under strict TypeScript (you cannot run it).
- You reply with a short list of what you changed and anything you could not finish.
