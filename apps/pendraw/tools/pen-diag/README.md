# Pen input diagnostics (LAN)

A standalone page that simulates PenDraw's input model so a pen/touch device can
test it over the local network, while the raw pointer signals are streamed back
here for analysis. Used to validate the Stack 2 input rework (pen draw, one-finger
grab-pan, two-finger pinch/zoom, barrel-armed lasso, eraser).

## Run

```bash
node apps/pendraw/tools/pen-diag/diag-server.mjs
```

Then, on the pen laptop (use **Edge** — same engine as the app's WebView2), open
`http://<this-machine-lan-ip>:4100/`. Find the host IP with:

```bash
node -e "const n=require('os').networkInterfaces();for(const k in n)for(const a of n[k])if(a.family==='IPv4'&&!a.internal)console.log(k+': '+a.address)"
```

Step through each guided test, then **Finish & flush**. Events are appended as
JSON-lines to `pen-events2.jsonl` next to the script (gitignored). If the laptop
can't connect, allow Node through the Windows firewall (port 4100).

## What each step captures
1. Pen draw (tip only) — clean `buttons&1`, pressure/tilt.
2. Pen barrel **armed via hover** then loop — the key barrel-lasso path.
3. Pen barrel + tip **simultaneous** — the harder case.
4. Eraser — `buttons&32`.
5. One-finger pan — direction/feel (grab vs inverse).
6. Two-finger pinch/pan.
7. Mouse/trackpad (optional).
