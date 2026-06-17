import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// toolboy shell — local-first PWA client (design phase: the visual shell).
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5173 },
});
