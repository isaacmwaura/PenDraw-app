import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResilientSocket } from "./connection";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor() { FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
}
beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", globalThis);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = () => {
  const status = vi.fn(), message = vi.fn(), open = vi.fn();
  const conn = createResilientSocket({ url: "ws://example.test", onStatus: status, onMessage: message, onOpen: open });
  return { conn, status, message, open };
};
describe("socket lifetime", () => {
  it("cancels a queued reconnect when sync is disabled", () => {
    const { conn, status } = setup();
    FakeSocket.instances[0].onclose?.();
    conn.close();
    const calls = status.mock.calls.length;
    vi.advanceTimersByTime(30000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(status).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reconnects immediately and ignores late events from the old socket", () => {
    const { conn, status, message, open } = setup();
    const first = FakeSocket.instances[0];
    const lateOpen = first.onopen!, lateClose = first.onclose!, lateMessage = first.onmessage!;
    conn.reconnectNow();
    expect(FakeSocket.instances).toHaveLength(2);
    const calls = status.mock.calls.length;
    lateOpen(); lateClose(); lateMessage({ data: '{"type":"scene"}' });
    expect(status).toHaveBeenCalledTimes(calls);
    expect(message).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    FakeSocket.instances[1].open();
    expect(open).toHaveBeenCalledOnce();
    conn.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("expires a stalled handshake and a silent open connection", () => {
    const { conn } = setup();
    vi.advanceTimersByTime(9000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open();
    vi.advanceTimersByTime(10000);
    expect(FakeSocket.instances).toHaveLength(3);
    conn.close();
  });
  it("traffic keeps the connection alive and heartbeat messages stay internal", () => {
    const { conn, message } = setup();
    const socket = FakeSocket.instances[0]; socket.open();
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(5000);
      socket.onmessage?.({ data: '{"type":"pong"}' });
    }
    expect(FakeSocket.instances).toHaveLength(1);
    expect(message).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalled();
    socket.onmessage?.({ data: '{"type":"scene"}' });
    expect(message).toHaveBeenCalledOnce();
    conn.close(); conn.reconnectNow();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
