import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// toolboy shell — local-first PWA client (design phase: the visual shell).
//
// The port is part of the app's identity, not a detail: every favourite, tool
// storage entry and keyring record lives in browser storage keyed by ORIGIN, so
// http://localhost:5181 is a different toolboy with an empty home screen. 5173 is
// held by another project's docker container here, hence 5180 — and `strictPort`
// so a busy port fails loudly instead of drifting to 5181 and "losing" everything.
export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5180, strictPort: true },
});
