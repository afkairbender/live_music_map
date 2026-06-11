import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1600,
  },
  server: {
    proxy: {
      // Resident Advisor's GraphQL API has no CORS headers, so the app calls
      // it same-origin via /api/ra. In production a Netlify rewrite does the
      // same job (see netlify.toml).
      "/api/ra": {
        target: "https://ra.co",
        changeOrigin: true,
        rewrite: () => "/graphql",
        headers: {
          Origin: "https://ra.co",
          Referer: "https://ra.co/events",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
      // Fallback route for Bandsintown — the app calls it directly first and
      // only uses this if the direct call is blocked.
      "/api/bit": {
        target: "https://rest.bandsintown.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/bit/, ""),
      },
    },
  },
});
