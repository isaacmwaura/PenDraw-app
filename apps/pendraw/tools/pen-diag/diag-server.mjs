// Pen diagnostics v2 — a working mini-simulation of PenDraw's NEW input model,
// so testing it over the LAN both (a) lets you FEEL the fixes (grab-pan, pinch
// zoom, pen draw, barrel-arm lasso, eraser) and (b) captures clean signals to
// confirm the model is deterministic before we finalise the .exe.
//
// Open http://<this-machine-ip>:4100/ on the pen laptop (use Edge — same engine
// as the app's WebView2). Events append to pen-events2.jsonl next to this file.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, "pen-events2.jsonl");
const PORT = 4100;
writeFileSync(LOG, "");
let count = 0;

const PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<title>PenDraw — Input Diagnostics v2</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-user-select:none;user-select:none;}
  html,body{height:100%;font-family:"Segoe UI",system-ui,sans-serif;background:#0f1b2a;color:#e8f0f8;}
  #app{display:flex;flex-direction:column;height:100%;}
  header{padding:8px 12px;background:#17304a;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
  header h1{font-size:15px;font-weight:700;}
  .steps{display:flex;gap:6px;flex-wrap:wrap;}
  .step{font-size:12px;padding:5px 9px;border-radius:6px;background:#21456a;color:#cfe2f5;border:1px solid #2e5a86;cursor:pointer;}
  .step.active{background:#4ade80;color:#0f1b2a;border-color:#4ade80;font-weight:700;}
  .step.done{opacity:.55;}
  #hint{font-size:13px;padding:8px 12px;background:#0c2138;color:#ffe9c7;border-bottom:1px solid #2e5a86;min-height:34px;}
  #hint b{color:#ffd28a;}
  #surface{position:relative;flex:1 1 auto;touch-action:none;overflow:hidden;background:#0f1b2a;}
  canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
  #badge{position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#c78bff;color:#0f1b2a;font-weight:700;font-size:12px;padding:4px 10px;border-radius:14px;display:none;pointer-events:none;}
  #live{position:absolute;left:8px;bottom:8px;right:8px;font-family:"Cascadia Code",Consolas,monospace;font-size:11px;line-height:1.5;color:#9fd0ff;background:#0009;padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre-wrap;}
  footer{padding:8px 12px;background:#17304a;display:flex;gap:10px;align-items:center;}
  button.act{font-size:13px;padding:7px 14px;border-radius:6px;border:none;background:#2e75b6;color:#fff;cursor:pointer;}
  button.act.ghost{background:transparent;border:1px solid #4a83b6;color:#cfe2f5;}
  #status{font-size:12px;color:#9fb8d0;}
</style></head><body>
<div id="app">
  <header><h1>Input Diagnostics v2</h1><div class="steps" id="steps"></div></header>
  <div id="hint"></div>
  <div id="surface">
    <canvas id="c"></canvas>
    <div id="badge">LASSO ARMED</div>
    <div id="live">waiting…</div>
  </div>
  <footer>
    <button class="act" id="next">Next step ▶</button>
    <button class="act ghost" id="reset">Reset view</button>
    <button class="act ghost" id="finish">Finish &amp; flush</button>
    <span id="status">0 events sent</span>
  </footer>
</div>
<script>
const STEPS=[
 ["pen-draw","PEN — write normally","Write a few words with the pen tip, <b>no buttons</b>. Should draw blue and feel smooth."],
 ["pen-arm","PEN — side button, HOVER then draw a loop","<b>Hold a side button</b> and <b>hover just above</b> the glass — the purple <b>LASSO ARMED</b> badge should appear. Then <b>touch and draw a loop</b> — it should draw purple (lasso), not blue."],
 ["pen-both","PEN — side button + touch together","Press a side button and touch the tip at the <b>same moment</b>, then draw. (Tests the harder simultaneous case.)"],
 ["pen-eraser","PEN — eraser","Flip to the eraser end (or press the eraser-mapped button) and scribble. Should read red."],
 ["one-finger","ONE finger — pan","Drag <b>one finger</b> slowly right, then down. The grid should follow your finger like grabbing paper. Tell me if it feels natural or inverse."],
 ["two-finger","TWO fingers — pinch &amp; pan","Pinch to zoom and drag with <b>two fingers</b>. The grid should zoom and pan."],
 ["mouse","MOUSE / trackpad (optional)","If attached, drag to pan and use the wheel."],
];
let stepIdx=0; const done=new Set();
const stepsEl=document.getElementById("steps"),hintEl=document.getElementById("hint"),statusEl=document.getElementById("status"),liveEl=document.getElementById("live"),badge=document.getElementById("badge");
const surface=document.getElementById("surface"),canvas=document.getElementById("c"),ctx=canvas.getContext("2d");
function renderSteps(){stepsEl.innerHTML="";STEPS.forEach((s,i)=>{const b=document.createElement("div");b.className="step"+(i===stepIdx?" active":"")+(done.has(i)?" done":"");b.textContent=(i+1)+". "+s[1];b.onclick=()=>{stepIdx=i;renderSteps();};stepsEl.appendChild(b);});hintEl.innerHTML="<b>Step "+(stepIdx+1)+" — "+STEPS[stepIdx][1]+".</b> "+STEPS[stepIdx][2];}

// ---- view (grid) + strokes ----
let view={x:0,y:0,zoom:1};              // x,y = scroll (scene coord at top-left)
let strokes=[];                          // {type, pts:[{x,y}]} in SCENE coords
let cur=null;
function fit(){const r=surface.getBoundingClientRect();canvas.width=r.width;canvas.height=r.height;draw();}
window.addEventListener("resize",fit);
function toScene(cx,cy){const r=surface.getBoundingClientRect();return {x:(cx-r.left)/view.zoom+view.x,y:(cy-r.top)/view.zoom+view.y};}
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // grid
  const step=40*view.zoom; const ox=(-view.x*view.zoom)%step, oy=(-view.y*view.zoom)%step;
  ctx.strokeStyle="#ffffff14";ctx.lineWidth=1;ctx.beginPath();
  for(let x=ox;x<canvas.width;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);}
  for(let y=oy;y<canvas.height;y+=step){ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);}
  ctx.stroke();
  // origin marker so pan/zoom is obvious
  const o=fromScene(0,0);ctx.fillStyle="#ffd28a";ctx.beginPath();ctx.arc(o.x,o.y,5,0,7);ctx.fill();
  // strokes
  for(const s of strokes){ctx.strokeStyle=s.type==="lasso"?"#c78bff":s.type==="eraser"?"#ff5d5d":"#4aa3ff";
    ctx.lineWidth=(s.type==="eraser"?8:2)*view.zoom;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();
    s.pts.forEach((p,i)=>{const c=fromScene(p.x,p.y);i?ctx.lineTo(c.x,c.y):ctx.moveTo(c.x,c.y);});
    if(s.type==="lasso"&&s.pts.length>2)ctx.closePath();ctx.stroke();}
}
function fromScene(sx,sy){const r=surface.getBoundingClientRect();return {x:(sx-view.x)*view.zoom,y:(sy-view.y)*view.zoom};}

// ---- logging ----
let buf=[],sent=0;
function push(o){buf.push(o);if(buf.length>=60)flush();}
function flush(){if(!buf.length)return;const b=buf;buf=[];const body=JSON.stringify(b);
  try{navigator.sendBeacon?navigator.sendBeacon("/log",new Blob([body],{type:"application/json"})):fetch("/log",{method:"POST",body,keepalive:true});}catch(_){fetch("/log",{method:"POST",body}).catch(()=>{});}
  sent+=b.length;statusEl.textContent=sent+" events sent";}
setInterval(flush,1200);window.addEventListener("beforeunload",flush);
const r3=n=>n==null?n:Math.round(n*1000)/1000;
function rec(e,kind,decision){return {kind,step:STEPS[stepIdx][0],decision,t:Math.round(e.timeStamp),pointerType:e.pointerType,pointerId:e.pointerId,isPrimary:e.isPrimary,button:e.button,buttons:e.buttons,pressure:r3(e.pressure),tiltX:e.tiltX,tiltY:e.tiltY,x:Math.round(e.clientX),y:Math.round(e.clientY),view:{x:r3(view.x),y:r3(view.y),zoom:r3(view.zoom)}};}
function showLive(o){liveEl.textContent=o.decision.toUpperCase()+"  type="+o.pointerType+" button="+o.button+" buttons="+o.buttons+" pressure="+o.pressure+" tilt="+o.tiltX+","+o.tiltY;}

// ---- input model (mirrors the app's PenInputLayer) ----
const S={penDown:false,armed:false,lasso:null,pan:null,touches:new Map(),pinch:null};
const lastMove=new Map(),moveCnt=new Map();
function setArmed(v){if(S.armed!==v){S.armed=v;badge.style.display=v?"block":"none";}}

surface.addEventListener("pointerdown",e=>{
  surface.setPointerCapture?.(e.pointerId);
  if(e.pointerType==="pen"){
    S.penDown=true;
    if((e.buttons&2)||S.armed){setArmed(false);cur={type:"lasso",pts:[toScene(e.clientX,e.clientY)]};S.lasso=e.pointerId;strokes.push(cur);const o=rec(e,"down","lasso-start");push(o);showLive(o);return;}
    const type=(e.buttons&32||e.button===5)?"eraser":"draw";cur={type,pts:[toScene(e.clientX,e.clientY)]};strokes.push(cur);const o=rec(e,"down",type);push(o);showLive(o);return;
  }
  if(e.pointerType==="touch"){
    S.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(S.touches.size===1&&!S.penDown){S.pan={id:e.pointerId,lx:e.clientX,ly:e.clientY};const o=rec(e,"down","pan-start");push(o);showLive(o);}
    else if(S.touches.size===2){S.pan=null;const pts=[...S.touches.values()];S.pinch={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),cx:(pts[0].x+pts[1].x)/2,cy:(pts[0].y+pts[1].y)/2,zoom:view.zoom};const o=rec(e,"down","pinch-start");push(o);showLive(o);}
    return;
  }
  if(e.pointerType==="mouse"){S.pan={id:e.pointerId,lx:e.clientX,ly:e.clientY};const o=rec(e,"down","mouse-pan");push(o);}
});
surface.addEventListener("pointermove",e=>{
  if(e.pointerType==="pen"&&!(e.buttons&1))setArmed(!!(e.buttons&2));
  // sampled logging
  const now=e.timeStamp,last=lastMove.get(e.pointerId)||0,cnt=moveCnt.get(e.pointerId)||0;
  if(e.pointerType==="pen"&&S.lasso===e.pointerId&&cur){cur.pts.push(toScene(e.clientX,e.clientY));draw();}
  else if(e.pointerType==="pen"&&S.penDown&&cur){cur.pts.push(toScene(e.clientX,e.clientY));draw();}
  else if((e.pointerType==="touch"||e.pointerType==="mouse")&&S.pan&&S.pan.id===e.pointerId&&S.touches.size<=1){
    const dx=e.clientX-S.pan.lx,dy=e.clientY-S.pan.ly;S.pan.lx=e.clientX;S.pan.ly=e.clientY;
    view.x-=dx/view.zoom;view.y-=dy/view.zoom;draw(); // app sign: scroll -= d/zoom (grab-pan)
  } else if(e.pointerType==="touch"&&S.pinch&&S.touches.has(e.pointerId)){
    S.touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(S.touches.size===2){const pts=[...S.touches.values()];const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
      const nz=Math.max(0.2,Math.min(5,S.pinch.zoom*(d/S.pinch.d)));view.zoom=nz;draw();}
  }
  if(now-last>60&&cnt<80){lastMove.set(e.pointerId,now);moveCnt.set(e.pointerId,cnt+1);
    const dec=S.lasso===e.pointerId?"lasso":S.pan&&S.pan.id===e.pointerId?"pan":S.pinch&&e.pointerType==="touch"?"pinch":S.penDown&&e.pointerType==="pen"?(cur?cur.type:"pen"):(!(e.buttons&1)&&e.pointerType==="pen")?"hover":"move";
    const o=rec(e,"move",dec);push(o);showLive(o);}
});
function up(e){
  if(e.pointerType==="pen"){S.penDown=false;setArmed(false);if(S.lasso===e.pointerId)S.lasso=null;cur=null;}
  if(e.pointerType==="touch"){S.touches.delete(e.pointerId);if(S.pan&&S.pan.id===e.pointerId)S.pan=null;if(S.touches.size<2)S.pinch=null;}
  if(e.pointerType==="mouse")S.pan=null;
  push(rec(e,"up",""));
}
surface.addEventListener("pointerup",up);surface.addEventListener("pointercancel",up);
surface.addEventListener("contextmenu",e=>{e.preventDefault();push({kind:"contextmenu",step:STEPS[stepIdx][0],t:Math.round(e.timeStamp),x:Math.round(e.clientX),y:Math.round(e.clientY)});liveEl.textContent="CONTEXTMENU (suppressed) — a side button or press-hold fired it";});

document.getElementById("next").onclick=()=>{done.add(stepIdx);stepIdx=Math.min(STEPS.length-1,stepIdx+1);renderSteps();flush();};
document.getElementById("reset").onclick=()=>{view={x:0,y:0,zoom:1};draw();};
document.getElementById("finish").onclick=()=>{push({kind:"finish",step:"-",t:Math.round(performance.now())});flush();hintEl.innerHTML="<b>Done — thanks!</b> All events flushed. Tell me how pan/zoom/lasso felt.";};

function caps(){const mm=q=>{try{return matchMedia(q).matches;}catch(_){return null;}};push({kind:"device",ua:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints,anyPointerCoarse:mm("(any-pointer: coarse)"),anyPointerFine:mm("(any-pointer: fine)"),screen:screen.width+"x"+screen.height,dpr:window.devicePixelRatio});flush();}
renderSteps();fit();caps();
</script></body></html>`;

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const arr = JSON.parse(body);
        const lines = (Array.isArray(arr) ? arr : [arr]).map((o) => JSON.stringify(o)).join("\n") + "\n";
        appendFileSync(LOG, lines);
        count += Array.isArray(arr) ? arr.length : 1;
        process.stdout.write("\r" + count + " events logged   ");
      } catch (e) { /* ignore */ }
      res.writeHead(204).end();
    });
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url.startsWith("/?"))) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  res.writeHead(404).end("not found");
});
server.listen(PORT, "0.0.0.0", () => console.log("Pen diagnostics v2 on http://0.0.0.0:" + PORT + "  (log -> " + LOG + ")"));
