"use client";

import Link from "next/link";
import { useState } from "react";
import type { Builder } from "@/lib/api";
import { Avatar } from "./avatar";
import { TierBadge, TierChip } from "./tier";

/* Builders as a list with a preview panel that follows the row you hover or focus, like an article index. */
export function BuilderList({ builders }: { builders: Builder[] }) {
  const [active, setActive] = useState(0);
  if (!builders.length) return <p className="muted">No one has shipped yet.</p>;
  const b = builders[Math.min(active, builders.length - 1)];
  return (
    <div className="index">
      <aside className="index-preview" aria-hidden="true">
        <div key={b.id} className="preview-card">
          <div className="preview-top">
            <Avatar name={b.name} src={b.avatar} className="preview-avatar" />
            <span className={`preview-tier tier-${b.tier.id}`}><TierBadge tier={b.tier} size={44} /><span className="mono">{b.tier.name}</span></span>
          </div>
          <dl className="preview-stats">
            <div><dt className="mono">Credit earned</dt><dd>{b.earned}</dd></div>
            <div><dt className="mono">Shipped</dt><dd>{b.shipped}<small>/{b.joined}</small></dd></div>
          </dl>
          <span className="mono preview-foot">{b.college.name}</span>
        </div>
      </aside>
      <ol className="index-rows">
        {builders.map((x, i) => (
          <li key={x.id} data-reveal style={{ ["--d" as string]: `${i * 60}ms` }}>
            <Link href={`/builders/${x.id}`} className="index-row" onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}>
              <span className="mono index-date">{x.classOf ? `Class of ${x.classOf}` : ""}</span>
              <span className="index-main">
                <span className="index-title">{x.name}{x.anonymous && <span className="mono anon-tag">anonymous</span>}</span>
                <span className="index-sub">{[x.branch, x.college.name].filter(Boolean).join(" · ")}. Shipped {x.shipped} of {x.joined} joined.</span>
              </span>
              <span className="index-meta">
                <span className="mono index-credit"><TierChip tier={x.tier} />{x.earned} credit</span>
                <span className="mono">Record →</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
