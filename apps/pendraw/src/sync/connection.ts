// Own one socket and its timers. Retired sockets cannot reconnect, report
// status, or deliver messages after sync is disabled or the view is unmounted.
export type ConnStatus = "connecting" | "connected" | "disconnected" | "offline";
type Options = {
  url: string;
  onStatus: (s: ConnStatus) => void;
  onMessage?: (data: string) => void;
  onOpen?: (send: (raw: string) => void) => void;
};
const HEARTBEAT_MS = 3000;
const DEAD_AFTER_MS = 8000;

export function createResilientSocket(opts: Options) {
  let ws: WebSocket | null = null;
  let closed = false;
  let heartbeat: number | null = null;
  let reconnect: number | null = null;
  let opening: number | null = null;
  let lastTraffic = Date.now();

  function clearTimers() {
    if (heartbeat !== null) window.clearInterval(heartbeat);
    if (reconnect !== null) window.clearTimeout(reconnect);
    if (opening !== null) window.clearTimeout(opening);
    heartbeat = reconnect = opening = null;
  }
  function retire() {
    clearTimers();
    const previous = ws;
    ws = null;
    if (!previous) return;
    previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null;
    try { previous.close(); } catch { /* already closed */ }
  }
  function send(raw: string) {
    if (!closed && ws?.readyState === WebSocket.OPEN) ws.send(raw);
  }
  function retry() {
    if (closed) return;
    retire();
    opts.onStatus("disconnected");
    reconnect = window.setTimeout(connect, 1000);
  }
  function connect() {
    if (closed) return;
    retire();
    opts.onStatus("connecting");
    let socket: WebSocket;
    try { socket = new WebSocket(opts.url); } catch { retry(); return; }
    ws = socket;
    const active = () => !closed && ws === socket;
    // A handshake that never completes otherwise has no heartbeat to expire it.
    opening = window.setTimeout(() => { if (active()) retry(); }, DEAD_AFTER_MS);
    socket.onopen = () => {
      if (!active()) return;
      if (opening !== null) window.clearTimeout(opening);
      opening = null;
      lastTraffic = Date.now();
      opts.onStatus("connected");
      heartbeat = window.setInterval(() => {
        if (!active()) return;
        if (Date.now() - lastTraffic > DEAD_AFTER_MS) retry();
        else send(JSON.stringify({ type: "ping" }));
      }, HEARTBEAT_MS);
      opts.onOpen?.(send);
    };
    socket.onmessage = (event) => {
      if (!active() || typeof event.data !== "string") return;
      lastTraffic = Date.now();
      const data = event.data;
      try {
        const msg = JSON.parse(data);
        if (msg?.type === "pong" || msg?.type === "ping") return;
      } catch { /* caller handles malformed messages */ }
      opts.onMessage?.(data);
    };
    socket.onclose = () => { if (active()) retry(); };
    socket.onerror = () => { /* close or the opening/heartbeat timeout retries */ };
  }
  connect();
  return {
    send,
    reconnectNow() { if (!closed) connect(); },
    close() { closed = true; retire(); },
  };
}
