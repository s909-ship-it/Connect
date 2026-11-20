"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountMenu } from "./account-menu";

type Item = { href: string; label: string; count?: number; external?: boolean; cta?: boolean };

export function Header({ items, appUrl }: { items: Item[]; appUrl: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`site-header${open ? " is-open" : ""}`} data-header>
      <a className="skip" href="#main">Skip to content</a>
      <Link href="/" className="wordmark" aria-label="Connect showcase, home">connect<span className="wordmark-dot" aria-hidden="true" /></Link>
      <div className="header-right">
        <nav id="site-nav" className="site-nav" aria-label="Main">
          {items.map((it) => {
            const active = !it.external && (it.href === "/" ? pathname === "/" : pathname.startsWith(it.href));
            const cls = `nav-link${it.cta ? " nav-cta" : ""}`;
            const body = <>{it.label}{it.count !== undefined && <sup>({it.count})</sup>}</>;
            return it.external
              ? <a key={it.href} href={it.href} className={cls}>{body}</a>
              : <Link key={it.href} href={it.href} className={cls} aria-current={active ? "page" : undefined}>{body}</Link>;
          })}
        </nav>
        <AccountMenu appUrl={appUrl} />
        <button className="menu-btn" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((v) => !v)}>
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span className="menu-lines" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
