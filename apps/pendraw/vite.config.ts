import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {cpSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Excalidraw otherwise falls back to an online font CDN. Prepare a generated
// public directory with our existing icons and all engine fonts for both hosts.
const generatedPublic=fileURLToPath(new URL('../../.cache/frontend-public/',import.meta.url));
mkdirSync(generatedPublic,{recursive:true});
cpSync(fileURLToPath(new URL('./public/',import.meta.url)),generatedPublic,{recursive:true});
cpSync(fileURLToPath(new URL('../../node_modules/@excalidraw/excalidraw/dist/prod/fonts/',import.meta.url)),generatedPublic+'fonts',{recursive:true});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  publicDir: generatedPublic,
  // host: true makes the dev server reachable from other machines on the LAN.
  server: { host: true },
  // Excalidraw references process.env in a few places; define it for the browser.
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
});
