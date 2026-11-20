import { ogCard, ogSize } from "./og";

export const size = ogSize;
export const contentType = "image/png";
export const alt = "Connect: build with people from your community";

/* Preview card for the home page and any page without its own. */
export default async function Image() {
  return ogCard({
    eyebrow: "For communities",
    title: "Build with people from your community",
    subtitle: "Find teammates, ship real projects, and earn credit only for what ships, signed by your teammates.",
  });
}
