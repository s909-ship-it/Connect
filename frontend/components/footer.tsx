import Link from "next/link";
import { app } from "@/lib/api";
import { Clock } from "./clock";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-mark" aria-hidden="true">connect<span className="wordmark-dot" /></div>
      <div className="footer-bar">
        <Clock />
        <span className="mono">© {new Date().getFullYear()} Connect</span>
        <nav className="footer-links mono" aria-label="Legal">
          <a href={app.rules}>Credit rules</a>
          <a href={app.privacy}>Privacy</a>
          <a href={app.terms}>Terms</a>
          <a href={app.cookies}>Cookies</a>
          <Link href="/colleges">Colleges</Link>
        </nav>
      </div>
    </footer>
  );
}
