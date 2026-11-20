"use client";

import { useState } from "react";
import { domainOf, isAcademic, isPublicMail, matchCollege } from "@/lib/domains";

/* College email box. As you type it says which college the address belongs to, or asks for the name of a new one. */
export function EmailField({ colleges, initial }: { colleges: { name: string; domains: string }[]; initial: string }) {
  const [email, setEmail] = useState(initial);
  const d = domainOf(email);
  const ready = /\.[a-z]{2,}$/.test(d);
  const known = ready ? matchCollege(d, colleges) : undefined;
  const personal = ready && isPublicMail(d);
  return (
    <>
      <span className="row">
        <input type="email" name="email" id="email" placeholder="you@college.ac.in or you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <button className="btn ghost">Send code</button>
      </span>
      {ready && (personal ? <span className="small neg">That is a personal address. Use the one your college or workplace gave you.</span>
        : known ? <span className="small ok-text">✓ {known.name}</span>
        : (
          <label className="field"><span>Your community&rsquo;s full name</span>
            <input type="text" name="college_name" id="college_name" placeholder="e.g. Nirma University or Acme Labs" minLength={3} maxLength={80} required />
            <small>@{d} is new on Connect. {isAcademic(d) ? "It is an academic domain, so your community opens as soon as you confirm the code." : "The Connect team checks new non-academic domains before the community opens."}</small>
          </label>
        ))}
    </>
  );
}
