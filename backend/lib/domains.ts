/* Pure helpers for telling which college an email address belongs to. No database here, so they are easy to test. */

/* Personal mail services. An address on these proves nothing about where someone studies. */
const PUBLIC = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "rediffmail.com", "zoho.com", "zohomail.in",
  "yandex.com", "mail.com", "gmx.com", "gmx.net", "tutanota.com", "fastmail.com", "hey.com", "duck.com", "inbox.com",
]);

/* Labels that sit in front of a college's own domain for student mailboxes: students.xyz.edu is xyz.edu. */
const PREFIXES = new Set(["students", "student", "stu", "mail", "my", "learner", "learners", "st"]);

export const domainOf = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

export const isEmail = (email: string) => /^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(email.trim());

export const isPublicMail = (domain: string) => PUBLIC.has(domain) || [...PUBLIC].some((p) => domain.endsWith("." + p));

/* The college's own domain, with student-mailbox prefixes taken off. */
export function baseDomain(domain: string) {
  const parts = domain.toLowerCase().split(".");
  while (parts.length > 2 && PREFIXES.has(parts[0])) parts.shift();
  return parts.join(".");
}

/* Domains only real institutions can register: .edu, .ac.in, .edu.in, .ac.uk, .edu.au and the like.
   A new college on one of these opens straight away; any other domain waits for a person to check it. */
export function isAcademic(domain: string) {
  return /\.edu$/.test(domain) || /\.(ac|edu)\.[a-z]{2}$/.test(domain);
}

/* True when an address on `domain` belongs to a college that owns `owned`.
   Exact match or a subdomain of it: x@cse.nirmauni.ac.in counts for nirmauni.ac.in, x@fakenirmauni.ac.in does not. */
export const onDomain = (domain: string, owned: string) => domain === owned || domain.endsWith("." + owned);

/* The college an email domain belongs to, picking the most specific match. */
export function matchCollege<T extends { domains: string }>(domain: string, colleges: T[]): T | undefined {
  let best: T | undefined, len = 0;
  for (const c of colleges)
    for (const d of c.domains.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))
      if (onDomain(domain, d) && d.length > len) { best = c; len = d.length; }
  return best;
}

export function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "college";
}

/* A readable first guess at a name from a domain: nirmauni.ac.in becomes "Nirmauni". */
export function guessName(domain: string) {
  const w = baseDomain(domain).split(".")[0] ?? domain;
  return w.charAt(0).toUpperCase() + w.slice(1);
}
