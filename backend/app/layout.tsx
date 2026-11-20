import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { get } from "@/lib/db";
import { collegeById, isMember } from "@/lib/college";
import { unreadMessages } from "@/lib/chat";
import { CallProvider } from "./calls/ui";
import { BottomNav } from "./bottom-nav";
import { Shortcuts } from "./shortcuts";
import { UnreadBadge } from "./unread-badge";
import { SettingsMenu } from "./settings-menu";
import { baseUrl, currentUser, demoMode, standings } from "@/lib/auth";
import { setConsent, signOut } from "./actions";
import { NavLinks, Toast } from "./client";
import { ConsentBanner } from "./consent";
import { CONSENT_COOKIE, readConsent } from "@/lib/consent";
import { Av } from "./ui";
import "./globals.css";
import "./public.css";


const about = "Build things with people from your community, like your college or workplace. Credit comes only from projects that ship, signed by your teammates.";
export const metadata: Metadata = {
  metadataBase: new URL(baseUrl()),
  title: { default: "Connect", template: "%s · Connect" },
  description: about,
  openGraph: { title: "Connect", description: about, type: "website" },
  appleWebApp: { capable: true, title: "Connect", statusBarStyle: "black-translucent" },
  // The test copy stays out of search engines.
  ...(demoMode ? { robots: { index: false, follow: false } } : {}),
};
export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0B0A09" }, { media: "(prefers-color-scheme: light)", color: "#F7F5F2" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  const signedIn = !!me?.onboarded;
  const member = signedIn && isMember(me);
  const college = member ? collegeById(me.college_id) : null;
  const dms = member ? unreadMessages(me.id) : 0;
  const jar = await cookies();
  const saved = jar.get("theme")?.value;
  // The cookie notice shows on this device until it is closed.
  const consent = readConsent(jar.get(CONSENT_COOKIE)?.value);
  // A saved choice wins; with none, the page follows the device setting (see globals.css).
  const theme = saved === "light" || saved === "dark" ? saved : undefined;
  const unread = signedIn ? get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND seen=0", me.id).n : 0;
  return (
    <html lang="en" data-theme={theme}>
      <body className={me ? undefined : "guest"}>
        <a className="skip" href="#main">Skip to content</a>
        <header className="bar">
          <div className="wrap">
            <Link href="/" className="logo"><i />Connect</Link>
            {college && <Link href={`/c/${college.slug}`} className="college-chip" title={college.name}>{college.name}</Link>}
            {signedIn ? (
              <>
                <nav className="tabs" aria-label="Sections">
                  {member ? <NavLinks admin={!!me.admin} /> : <span className="small muted">Finish verifying to see your community</span>}
                </nav>
                <div className="right">
                  {member && (
                    <Link href="/messages" className="bell top-only" aria-label={dms ? `Messages, ${dms} unread` : "Messages"}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      {dms > 0 && <b>{dms > 9 ? "9+" : dms}</b>}
                    </Link>
                  )}
                  <Link href="/inbox" className="bell top-only" aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                    {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
                  </Link>
                  <Link href={`/u/${me.id}`} className="who" aria-label="Your profile">
                    {me.role === "student" && <span className="bal">{standings().get(me.id)?.credit ?? 0}<span className="hide-sm"> credit</span></span>}
                    <Av u={me} />
                  </Link>
                  <SettingsMenu name={me.name} profile={`/u/${me.id}`} saved={theme} signOut={signOut} member={member} />
                </div>
              </>
            ) : (
              <nav className="right guest-nav" aria-label="Site" style={{ marginLeft: "auto" }}>{me ? <SettingsMenu name={me.name} saved={theme} signOut={signOut} member={false} /> : <><Link href="/rules">How credit works</Link><Link href="/colleges">Communities</Link><Link className="btn sm" href="/signin">Sign in</Link></>}</nav>
            )}
          </div>
        </header>
        {demoMode && <div className="strip"><div className="wrap">Test site with invented sample people. Nothing here is real. The real Connect is at <a href="https://connect-production-77ec4d79.up.railway.app">connect-production-77ec4d79.up.railway.app</a>.</div></div>}
        {signedIn && !member && (
          <div className="strip"><div className="wrap">
            {me.role === "alum" ? "Your alumni account is waiting for an admin of your community to approve it."
              : <>Your community&rsquo;s projects and people stay hidden until you <Link href="/onboarding">prove your college or work email</Link>.</>}
          </div></div>
        )}
        <main id="main" tabIndex={-1} className="wrap">{children}</main>
        <footer className="foot"><div className="wrap">
          <span>Connect. Credit comes only from what ships.</span>
          <span className="row"><Link href="/rules">How credit works</Link><Link href="/colleges">Communities</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/cookies">Cookies</Link>{signedIn ? <><Link href="/feedback">Feedback</Link><Link href="/settings">Settings</Link></> : <Link href="/signin">Sign in</Link>}</span>
        </div></footer>
        <Suspense><Toast /></Suspense>
        {!consent && <ConsentBanner action={setConsent} />}
        {member && <CallProvider anon={!!me?.anon} />}
        {member && <BottomNav me={me.id} dms={dms} unread={unread} />}
        {member && <Shortcuts />}
        {signedIn && <UnreadBadge count={unread + dms} />}
      </body>
    </html>
  );
}
