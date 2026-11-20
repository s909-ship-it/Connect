import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Motion } from "@/components/motion";
import { api, app, APP_URL } from "@/lib/api";

/* The hero wordmark is set in Broadway when the visitor's computer has it (it ships with Microsoft Office, and its
   licence doesn't allow bundling). Everyone else gets Fascinate, a free Art Deco face in the same spirit (OFL, app/fonts). */
const deco = localFont({ src: "./fonts/fascinate.woff2", variable: "--font-deco", display: "swap", weight: "400" });
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Connect — credit only for what ships", template: "%s — Connect" },
  description: "A network of colleges where students build projects together. Credit comes only from projects that ship, signed by teammates and outside reviewers.",
};
export const viewport: Viewport = { themeColor: "#0f0000", width: "device-width", initialScale: 1 };

async function navCounts() {
  try {
    const [o, c, b] = await Promise.all([api.overview(), api.colleges(), api.builders(100)]);
    return { work: o.stats.shipped, colleges: c.length, builders: b.length };
  } catch {
    return {} as { work?: number; colleges?: number; builders?: number };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const n = await navCounts();
  return (
    <html lang="en-IN" className={`${GeistSans.variable} ${GeistMono.variable} ${deco.variable}`}>
      <body>
        <Header items={[
          { href: "/work", label: "work", count: n.work },
          { href: "/colleges", label: "colleges", count: n.colleges },
          { href: "/builders", label: "builders", count: n.builders },
          { href: app.signin, label: "join", external: true, cta: true },
        ]} appUrl={APP_URL} />
        <main id="main">{children}</main>
        <Footer />
        <Motion />
      </body>
    </html>
  );
}
