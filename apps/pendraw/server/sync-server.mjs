import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import sirv from "sirv";
import { attachHub } from "./attach.mjs";

// Find this machine's address(es) on the local network, so we can print the
// exact URL to open on the other computer.
function lanAddresses() {
  const out = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

// If the app has been built (npm run build), serve the static files so the
// desktop can open the app over the LAN. In dev, Vite serves the app instead
// and this server only relays WebSocket traffic.
const distDir = path.join(__dirname, "..", "dist");
const hasDist = fs.existsSync(distDir);
const serve = hasDist ? sirv(distDir, { single: true, dev: false }) : null;

const server = http.createServer((req, res) => {
  if (serve) {
    serve(req, res, () => {
      res.statusCode = 404;
      res.end("Not found");
    });
  } else {
    res.statusCode = 200;
    res.end("PenDraw sync server running (dev mode — the app is served by Vite).");
  }
});

const wss = new WebSocketServer({ server });
attachHub(wss);

server.listen(PORT, "0.0.0.0", () => {
  const mode = hasDist ? "serving built app from /dist" : "relay only (dev)";
  const ips = lanAddresses();
  const host = ips[0] || "<this-computer-ip>";
  console.log("");
  console.log(`  PenDraw is running (${mode}).`);
  console.log("  ------------------------------------------------------------");
  console.log(`  On THIS computer (mirror view):  http://localhost:${PORT}/?mirror`);
  console.log(`  On the OTHER computer (draw here): http://${host}:${PORT}/`);
  if (ips.length > 1) {
    console.log(`  (other addresses for this computer: ${ips.slice(1).join(", ")})`);
  }
  console.log("  ------------------------------------------------------------");
  console.log("  Both computers must be on the same network. Keep this window open.");
  console.log("");
});
