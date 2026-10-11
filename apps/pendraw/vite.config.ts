import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // host: true makes the dev server reachable from other machines on the LAN.
  server: { host: true },
  // Excalidraw references process.env in a few places; define it for the browser.
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
});
