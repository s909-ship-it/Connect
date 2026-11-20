"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/* All scroll-driven motion in one place, re-applied on every route change:
   - [data-reveal]       fades and lifts in once it enters the viewport (stagger with style="--d: 120ms")
   - [data-words]        each word fills from muted to full colour as the block scrolls past (the About statement)
   - .warp               the project covers bend in perspective as they move through the viewport
   - [data-header]       gets .is-scrolled once the page leaves the top
   Everything is skipped for people who ask for reduced motion. */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    root.classList.add("js");

    const reveals = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (reduce) reveals.forEach((el) => el.classList.add("is-in"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    if (!reduce) reveals.forEach((el) => io.observe(el));

    const wordBlocks = [...document.querySelectorAll<HTMLElement>("[data-words]")];

    const warps = [...document.querySelectorAll<HTMLElement>(".warp")];
    const header = document.querySelector<HTMLElement>("[data-header]");
    let raf = 0;

    const frame = () => {
      raf = 0;
      const vh = window.innerHeight;
      header?.classList.toggle("is-scrolled", window.scrollY > 24);
      if (header) {
        // Dark text while the header sits over a light (cream) section.
        const under = document.elementsFromPoint(window.innerWidth / 2, header.offsetHeight / 2).find((el) => !header.contains(el) && el.closest("section, footer"));
        header.classList.toggle("is-light", !!under?.closest(".light"));
      }
      if (reduce) return;
      for (const b of wordBlocks) {
        const r = b.getBoundingClientRect();
        // 0 when the block's top is at 85% of the viewport, 1 when its bottom reaches 45%.
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.4)));
        const words = b.querySelectorAll<HTMLElement>(".w");
        const lit = Math.round(p * words.length);
        words.forEach((w, i) => w.classList.toggle("on", i < lit));
      }
      for (const w of warps) {
        const r = w.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) continue;
        // -1 entering from below, 0 centred, 1 leaving at the top.
        const t = Math.max(-1, Math.min(1, (vh / 2 - (r.top + r.height / 2)) / (vh / 2 + r.height / 2)));
        w.style.setProperty("--rx", `${(-t * 14).toFixed(2)}deg`);
        w.style.setProperty("--sk", `${(t * 4).toFixed(2)}deg`);
        w.style.setProperty("--sc", `${(1 - Math.abs(t) * 0.06).toFixed(3)}`);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return null;
}
