import { Hub } from "./relay.mjs";

// Wire a ws WebSocketServer to a Hub. Shared by the real server and the tests so
// both exercise the exact same connection handling.
export function attachHub(wss, hub = new Hub()) {
  wss.on("connection", (ws) => {
    const client = {
      send: (raw) => {
        if (ws.readyState === ws.OPEN) ws.send(raw);
      },
    };
    hub.add(client);
    ws.on("message", (data) => {
      const text = data.toString();
      // Heartbeat: reply to a ping with a pong so the client can tell the
      // connection is still alive. Pings are not broadcast.
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        msg = null;
      }
      if (msg && msg.type === "ping") {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      hub.handle(client, text);
    });
    ws.on("close", () => hub.remove(client));
    ws.on("error", () => hub.remove(client));
  });
  return hub;
}
