import { PROVIDERS, ready } from "@/lib/oauth";
import { demoMode } from "@/lib/auth";

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
    <path fill="#FBBC05" d="M10.500 28.600A14.500 14.500 0 0 1 9.500 24c0-1.600.3-3.100.800-4.600l-7.900-6.200A24 24 0 0 0 0 24c0 3.900.900 7.500 2.600 10.800l7.900-6.200z" />
    <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.400-4.900 2.300-8.200 2.300-6.300 0-11.600-4.200-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z" />
  </svg>
);
const LinkedInMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
    <path d="M20.400 20.400h-3.500v-5.500c0-1.300 0-3-1.800-3s-2.100 1.400-2.100 2.900v5.600H9.400V9h3.400v1.600c.5-.9 1.600-1.800 3.400-1.800 3.600 0 4.300 2.400 4.300 5.500v6.100zM5.300 7.400a2.100 2.100 0 1 1 0-4.100 2.100 2.100 0 0 1 0 4.100zM7.100 20.400H3.600V9h3.500v11.400z" />
  </svg>
);

/* Sign-in buttons. In production only the providers that are set up are shown. */
export function SignInButtons({ large }: { large?: boolean }) {
  const dev = process.env.NODE_ENV !== "production";
  const show = Object.values(PROVIDERS).filter((p) => dev || ready(p));
  return (
    <div className="stack tight" style={large ? { maxWidth: 340 } : undefined}>
      {show.map((p) => (
        <a key={p.key} className={`oauth ${p.key === "linkedin" ? "li" : ""}`} href={`/api/auth/${p.key}`}>
          {p.key === "google" ? <GoogleMark /> : <LinkedInMark />}Continue with {p.label}
        </a>
      ))}
      {show.length === 0 && (demoMode
        ? <a className="btn lg" href="/signin">Sign in as a sample person</a>
        : <div className="note">Sign-in is not set up yet. Add Google or LinkedIn keys to the server.</div>)}
    </div>
  );
}
