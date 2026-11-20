"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SignedLine } from "@/lib/api";
import { monthYear, pad2 } from "@/lib/api";
import { Avatar } from "./avatar";

/* The "what people say" slot, filled with lines builders wrote about their own work and teammates signed. */
export function SignedCarousel({ lines }: { lines: SignedLine[] }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const paused = useRef(false);
  const n = lines.length;
  const go = useCallback((d: 1 | -1) => { setDir(d); setI((x) => (x + d + n) % n); }, [n]);

  useEffect(() => {
    if (n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { if (!paused.current) go(1); }, 7000);
    return () => clearInterval(t);
  }, [go, n]);

  if (!n) return <p className="lead">No signed lines yet. They appear here once a project ships.</p>;
  const l = lines[i];
  return (
    <div className="quote" onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)} onBlur={() => (paused.current = false)}>
      <blockquote key={i} className={`quote-body ${dir > 0 ? "from-r" : "from-l"}`} aria-live="polite">
        <span className="quote-mark" aria-hidden="true">“</span>
        <p>{l.did}.</p>
        <footer>
          <span className="quote-rule" aria-hidden="true" />
          <Link href={`/builders/${l.builder.id}`} className="quote-who"><Avatar name={l.builder.name} src={l.builder.avatar} className="quote-avatar" /><b>{l.builder.name}</b></Link>
          <span>{l.role ? `${l.role} on ` : "On "}<Link href={`/work/${l.project.id}`}>{l.project.name}</Link>, {monthYear(l.shippedAt)}</span>
          <span className="mono quote-signed">{l.signedBy ? `Signed by ${l.signedBy} teammate${l.signedBy > 1 ? "s" : ""}` : "Solo project"}</span>
        </footer>
      </blockquote>
      {n > 1 && (
        <div className="pager">
          <button onClick={() => go(-1)} aria-label="Previous line">←</button>
          <span className="mono">{pad2(i + 1)}/{pad2(n)}</span>
          <button onClick={() => go(1)} aria-label="Next line">→</button>
        </div>
      )}
    </div>
  );
}
