"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Phone-only tab bar: the five places people go most, within thumb reach. The top tabs still hold the rest. */
const ICONS: Record<string, React.ReactNode> = {
  projects: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  messages: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  inbox: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  you: <><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" /></>,
};

export function BottomNav({ me, dms, unread }: { me: number; dms: number; unread: number }) {
  const path = usePathname();
  const items: [key: string, href: string, label: string, count: number, on: boolean][] = [
    ["projects", "/", "Projects", 0, path === "/" || path.startsWith("/projects")],
    ["people", "/people", "People", 0, path.startsWith("/people") || (path.startsWith("/u/") && path !== `/u/${me}`)],
    ["messages", "/messages", "Messages", dms, path.startsWith("/messages")],
    ["inbox", "/inbox", "Inbox", unread, path.startsWith("/inbox")],
    ["you", `/u/${me}`, "You", 0, path === `/u/${me}` || path.startsWith("/settings")],
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {items.map(([key, href, label, count, on]) => (
        <Link key={key} href={href} aria-current={on ? "page" : undefined} aria-label={count ? `${label}, ${count} unread` : label}>
          <span className="bn-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[key]}</svg>
            {count > 0 && <b>{count > 9 ? "9+" : count}</b>}
          </span>
          <span className="bn-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
