/* Re-mounts on every navigation, so each page fades in instead of snapping into place (see .page-fade). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
