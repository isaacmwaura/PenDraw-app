import { describe, it, expect } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { attachHub } from "./attach.mjs";

function makeServer() {
  return new Promise((resolve) => {
    const wss = new WebSocketServer({ port: 0 }, () => {
      resolve({ wss, port: wss.address().port });
    });
    attachHub(wss);
  });
}

// A client that queues incoming messages from the moment it opens, so a message
// pushed immediately on connect (the snapshot) is never missed.
function connect(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const queue = [];
    let waiter = null;
    ws.on("message", (d) => {
      const msg = d.toString();
      if (waiter) {
        const w = waiter;
        waiter = null;
        w(msg);
      } else {
        queue.push(msg);
      }
    });
    ws.on("open", () =>
      resolve({
        ws,
        next: () =>
          new Promise((res) => {
            if (queue.length) res(queue.shift());
            else waiter = res;
          }),
      }),
    );
    ws.on("error", reject);
  });
}

const scene = (id, role = "editor") =>
  JSON.stringify({
    type: "scene",
    role,
    elements: [{ id, version: 1, versionNonce: 1 }],
    files: {},
    viewport: role === "editor" ? { scrollX: 0, scrollY: 0, zoom: 1 } : null,
  });

describe("sync server (real WebSockets, two-way)", () => {
  it("relays a scene from one peer to the other, in both directions", async () => {
    const { wss, port } = await makeServer();
    const editor = await connect(port);
    const mirror = await connect(port);

    editor.ws.send(scene("from-editor", "editor"));
    expect(JSON.parse(await mirror.next()).elements[0].id).toBe("from-editor");

    // Two-way: the mirror can also send, and the editor receives it.
    mirror.ws.send(scene("from-mirror", "mirror"));
    expect(JSON.parse(await editor.next()).elements[0].id).toBe("from-mirror");

    editor.ws.close();
    mirror.ws.close();
    wss.close();
  });

  it("gives a late-joining peer a merged snapshot of the board", async () => {
    const { wss, port } = await makeServer();
    const editor = await connect(port);
    editor.ws.send(scene("z"));
    await new Promise((r) => setTimeout(r, 50)); // let the server merge it

    const late = await connect(port); // joins after the drawing already happened
    const snap = JSON.parse(await late.next());
    expect(snap.elements.some((e) => e.id === "z")).toBe(true);

    editor.ws.close();
    late.ws.close();
    wss.close();
  });

  it("answers a heartbeat ping with a pong (and does not broadcast it)", async () => {
    const { wss, port } = await makeServer();
    const a = await connect(port);
    const b = await connect(port);

    a.ws.send(JSON.stringify({ type: "ping" }));
    expect(JSON.parse(await a.next()).type).toBe("pong");

    let bGotSomething = false;
    b.next().then(() => (bGotSomething = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(bGotSomething).toBe(false);

    a.ws.close();
    b.ws.close();
    wss.close();
  });
});
