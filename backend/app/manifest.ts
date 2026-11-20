import type { MetadataRoute } from "next";

/* Lets students add Connect to their phone's home screen and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Connect",
    short_name: "Connect",
    description: "Build with people from your community. Credit comes only from what ships.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0A09",
    theme_color: "#0B0A09",
    // Lets you pick Connect in your phone's share sheet (Gallery, Files, Chrome...) and send it to someone.
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title", text: "text", url: "url",
        files: [{ name: "files", accept: ["image/*", "video/*", "audio/*", "application/pdf", ".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".csv", ".md"] }],
      },
    },
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/app-icon/192", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
