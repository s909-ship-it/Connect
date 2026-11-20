/* The cookie notice. Connect sets only cookies it needs (sign-in, your settings), so there is nothing to choose:
   the notice says so once, and this cookie remembers that it was closed.
   Earlier the notice offered a statistics choice; "necessary" from then still means "do not count my visits". */
export const CONSENT_COOKIE = "consent";
export const readConsent = (v: string | undefined | null): string | null => (v === "ok" || v === "all" || v === "necessary" ? v : null);
export const CONSENT_DAYS = 365;
/* The date of the terms people agree to at sign-up. Change it when the terms change in a way that matters. */
export const TERMS_DATE = "21 November 2026";
