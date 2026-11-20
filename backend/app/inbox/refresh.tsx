"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Opening the inbox marks everything read, but the header and tab-bar badges were drawn before that. One refresh
   redraws them at zero. */
export function RefreshBadges() {
  const router = useRouter();
  useEffect(() => { router.refresh(); }, [router]);
  return null;
}
