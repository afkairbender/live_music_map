import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // bind to the IPv4 loopback: Spotify only allows 127.0.0.1 redirect URIs,
  // and on newer Node "localhost" binds IPv6-only so 127.0.0.1 won't connect
  server: {
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
