# Startup Buildathon India 2026: idea submission answers

Team: Connectors · Product: Connect

## Team description (236 characters)

In college, finding people who actually want to build something is the hardest part. Connect puts every project and builder on one campus board and shows who really ships, so serious students find each other instead of waiting for luck.

## Problem Statement

In colleges, students who want to build things cannot find each other. Most campuses have no strong peer culture of building, so the serious students are scattered across 50+ WhatsApp groups and clubs. Posts asking for teammates get lost, and there is no way to tell who will actually do the work from who only talks about it. Profiles and resumes are self-written, so someone who lists "AI, Web3, Founder" looks the same as someone who shipped three projects. The result: good ideas die for lack of a team, teams break when members disappear midway, and students graduate with no proof of what they built. Alumni who want to fund student work have no way to know which teams are real.

## Proposed Solution

Connect is a campus network where students find teammates and build real projects together, and where reputation comes only from finished work.

One project board replaces scattered groups: every project shows its team, milestones, proof links and the roles it still needs. Students can see who has worked with whom before joining.

A credit system keeps it honest. Credit is earned only when a project ships. Two students outside the team review the proof and decide what it is worth. Teammates then split the credit between each other, and nobody sets their own share. Joining a project puts some of your credit at stake, which you lose if you leave midway.

Every student gets a shareable resume where each line is signed by the teammates who were there, with AI writing it only from verified records. Clubs keep confirmed rosters, and alumni can fund projects milestone by milestone, with teams needing real credit to apply.

A working version is already built, with Google sign-in and college email verification.

Growth: the same model works inside corporates. Employees team up on internal projects, credit comes only from work colleagues sign off, and managers see who actually delivers. A student's signed record from college carries straight into hiring.

## Solution Architecture

1. Web app: Next.js (React) with server-rendered pages and server actions. Works on phone and desktop.
2. Identity: Google sign-in (OAuth 2.0 / OpenID Connect). Students on the college Google domain are verified automatically; others confirm a college email by one-time code. Alumni are approved by an admin.
3. Data: a relational database holding users, projects, team members, milestones, proof links, reviews, credit splits, vouches, clubs and funding records.
4. Credit engine: credit is never stored. It is recalculated from team, review and split records every time, so it cannot be edited or drift. Rules cover outside review, median-based teammate splits, stakes, and limits on vouching.
5. AI layer (Gemini): writes resumes strictly from verified project records and helps reviewers by summarising a project's proof. Planned next: teammate and project suggestions by skill and past work.
6. Trust and safety: per-user rate limits, reporting, admin moderation, and security headers.
7. Deployment: one Docker container with a persistent volume and a health check.

## Google AI Tools

Google Antigravity (in use): our coding agent. It built Connect's Gemini features inside our codebase, the verified resume writer and the proof summary for reviewers, and we reviewed and tested every change before it went in.

Google AI Studio (in use): issues the Gemini API key that powers Connect's live AI features. We use it to design and test the prompt for each feature against real project records before it ships.

## Google AI Models

Gemini 3.8 Flash, through the Gemini API. It is fast and low-cost, so every student can use the AI features often, and it is the model our Antigravity coding agent runs on. It powers three features: a resume writer that uses only teammate-signed records (working), a proof summary that tells outside reviewers what to check without giving a verdict (working), and teammate suggestions based on skills used in shipped projects (planned). AI never changes anyone's credit; only people review, split and vouch.

## Pitch deck: what to type on each slide

The template has 9 pages. Make your editable copy, delete page 1 (the guidelines), fill pages 2 to 7, and export as PDF (under 5 MB).

### Slide 2 (cover)

- Team Name: Connectors
- Team Size: (number of people on your hack2skill team)
- Problem Statement: In colleges, students who want to build cannot find each other, and nothing shows who actually ships.

### Slide 3: Problem Statement

Builders exist in every college. They just never find each other.

- In a college, the students who want to build are scattered across 50+ WhatsApp groups and clubs. Requests for teammates get lost.
- Nobody can tell who will do the work. Profiles are self-written, so "AI | Web3 | Founder" looks the same as three shipped projects.
- Teams break when members disappear midway, and nothing records it.
- Students graduate with no proof of what they built. Alumni who want to fund student work cannot tell which teams are real.

### Slide 4: Proposed Solution

Connect: one campus network to find teammates and build, where reputation comes only from finished work.

- One project board for the whole college: team, milestones, proof and open roles for every project.
- Credit only when a project ships. Two students outside the team review the proof and set its worth.
- Teammates split the credit between each other. Nobody sets their own share.
- Joining puts credit at stake. Leave midway and you lose it, and it shows on your profile.
- A shareable resume where every line is signed by teammates, written by AI only from verified records.
- Clubs keep confirmed rosters. Alumni fund projects milestone by milestone.
- Status: working product built, with Google sign-in and college email verification.

### Slide 5: Solution Architecture

Insert the image `connect-architecture.png` from this folder, sized to fill the slide. No other text needed.

### Slide 6: Google AI Tools

See the finished deck: Connect-Idea-Submission.pdf

### Slide 7: Google AI Models

See the finished deck: Connect-Idea-Submission.pdf

### Slide 8: Already built, and where it grows

Two product screenshots, plus the growth band: the same model works inside corporates.

### Slide 9

"Thank you" slide. Leave as is.
