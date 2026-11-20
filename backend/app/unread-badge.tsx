"use client";

import { useEffect } from "react";

/* Shows the number of unread messages and inbox entries in the browser tab ("(3) Projects · Connect") and, when
   Connect is installed on a phone or computer, as a badge on its app icon. Keeps out of the way of the call
   screen's own "📞" mark at the start of the title. */
export function UnreadBadge({ count }: { count: number }) {
  useEffect(() => {
    const mark = count > 0 ? `(${count > 99 ? "99+" : count}) ` : "";
    const apply = () => {
      const t = document.title, m = t.match(/^(📞 )?(\(\d+\+?\) )?([\s\S]*)$/);
      const want = `${m?.[1] ?? ""}${mark}${m?.[3] ?? t}`;
      if (t !== want) document.title = want;
    };
    apply();
    // The page title changes on every navigation; put the count back each time.
    const head = document.querySelector("head");
    const watch = new MutationObserver(apply);
    if (head) watch.observe(head, { subtree: true, childList: true, characterData: true });
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count > 0) nav.setAppBadge?.(count).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
    return () => watch.disconnect();
  }, [count]);
  return null;
}
