// Headless regression check against the real Excalidraw canvas. Uses an
// isolated browser profile and temporary localhost port, then closes both.
// Desktop IPC is simulated; this does NOT test Windows Ink or file dialogs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import {attachHub} from "../server/attach.mjs";
import sirv from "sirv";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(app, "../..");
const expectedVersion = JSON.parse(await fs.readFile(path.join(app,'package.json'),'utf8')).version;
const cache = path.join(root, ".cache", "browser-check");
const profile = path.join(cache, `profile-${Date.now()}`);
const browserPath = process.env.PENDRAW_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const serveApp = sirv(path.join(app, "dist"), { single: true });
const server = http.createServer((request, response) => serveApp(request, response));
const hubSockets=new WebSocketServer({server});
attachHub(hubSockets);
let browser;
let mirrorSocket;
let ws;
let counter = 0;
const pending = new Map();
const browserErrors = [];
const report = { checks: [], limitations: "Simulated desktop IPC; real-device pen feel, Windows handwriting, and file dialogs remain unverified." };
const checked = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };

async function rpc(method, params = {}) {
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, { resolve: (r) => { clearTimeout(timer); resolve(r); },
      reject: (error) => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw new Error(`Condition timed out: ${expression}`);
}
async function mouse(type, x, y) {
  await rpc("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: type === "mouseMoved" ? 0 : 1 });
  await delay(35);
}
async function touch(type, points) {
  await rpc("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  await delay(65);
}

try {
  await fs.mkdir(profile, { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = spawn(browserPath, ["--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  browser.on("error", (error) => browserErrors.push(error.message));
  let port;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { port = Number((await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); break; }
    catch { await delay(100); }
  }
  assert(port, `Headless browser did not start: ${browserErrors.join(", ")}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(pages.find((p) => p.type === "page").webSocketDebuggerUrl);
  const wireSocket=(socket)=>socket.on("message", (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id) {
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
      else entry.resolve(msg.result);
    }
    if (msg.method === "Runtime.exceptionThrown") browserErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  });
  wireSocket(ws);
  await new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
  await rpc("Runtime.enable");
  await rpc("Page.enable");
  await rpc("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await rpc("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 10 });
  await rpc("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.isTauri = !sessionStorage.getItem("browser-mode");
    window.__windowOps=[];window.__nativeFullscreen=false;window.__nativeMaximized=true;
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(message);
    window.__confirmAnswer = true;
    window.confirm = () => window.__confirmAnswer;
    window.__writes = [];
    window.__savePath = 'C:/PenDraw-test/drawing.excalidraw';
    window.__TAURI_INTERNALS__ = { transformCallback:()=>1,metadata:{currentWindow:{label:'main'}}, invoke: async (command, args) => {
      if(command.startsWith('plugin:event|'))return 1;
      if(command.startsWith('plugin:window|')) {
        const op=command.split('|')[1];window.__windowOps.push({op,args});
        if(op==='is_fullscreen')return window.__nativeFullscreen;
        if(op==='is_maximized')return window.__nativeMaximized;
        if(op==='set_fullscreen'){window.__nativeFullscreen=args.value;return;}
        if(op==='toggle_maximize'){window.__nativeMaximized=!window.__nativeMaximized;return;}
        if(['minimize','close','destroy','start_dragging','set_theme'].includes(op))return;
      }
      if (command === 'plugin:dialog|save' || command === 'plugin:dialog|open') return window.__savePath;
      if (command === 'write_text_file') {
        window.__writes.push(args.contents);
        if (window.__holdWrite) await new Promise(resolve => {window.__finishWrite = resolve});
        window.__disk = args.contents;
        return;
      }
      if (command === 'read_text_file') {
        if (window.__holdRead) await new Promise(resolve => {window.__finishRead = resolve});
        return window.__disk;
      }
      if (command === 'recognize_handwriting') {
        if (window.__holdRecognition) await new Promise(resolve => {window.__finishRecognition = resolve});
        return args.strokes.map((stroke, i) => {
        const xs = stroke.map(p => p[0]), ys = stroke.map(p => p[1]);
        return {text: i ? (window.__twoWords ? 'Second line' : '′') : 'Sample text', x: Math.min(...xs), y: Math.min(...ys),
          width: Math.max(...xs)-Math.min(...xs), height: window.__twoWords && i ? 70 : Math.max(12,Math.max(...ys)-Math.min(...ys)), stroke_indices:[i]};
        });
      }
      throw new Error('Unexpected desktop command in browser check: ' + command);
    }};
  ` });
  await rpc("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
  await waitFor("!!window.__pdApi && window.__pdApi.getAppState().activeTool.type === 'freedraw'");
  await delay(500);
  assert.equal(await evaluate("window.__pdApi.getAppState().penMode"), true);
  checked("desktop pen mode is applied at initialization");

  await evaluate("window.__pdApi.setActiveTool({type:'rectangle'})");
  await delay(80);
  const drawingTop=await evaluate("document.querySelector('.excalidraw canvas').getBoundingClientRect().top");
  await mouse("mousePressed", 220, drawingTop+45);
  await mouse("mouseMoved", 380, drawingTop+155);
  await mouse("mouseReleased", 380, drawingTop+155);
  await waitFor("window.__pdApi.getSceneElements().some(e => e.type === 'rectangle' && e.width > 100 && e.height > 80)");
  checked("rectangle remains a full shape after release");

  await evaluate("window.__pdApi.setActiveTool({type:'freedraw'})");
  await delay(80);
  const beforePan = await evaluate("({x:window.__pdApi.getAppState().scrollX,y:window.__pdApi.getAppState().scrollY,z:window.__pdApi.getAppState().zoom.value,n:window.__pdApi.getSceneElements().length})");
  await touch("touchStart", [[700, 500, 1]]);
  await touch("touchMove", [[780, 560, 1]]);
  await touch("touchEnd", []);
  const afterPan = await evaluate("({x:window.__pdApi.getAppState().scrollX,y:window.__pdApi.getAppState().scrollY,t:window.__pdApi.getAppState().activeTool.type,n:window.__pdApi.getSceneElements().length})");
  assert(Math.abs((afterPan.x-beforePan.x)*beforePan.z-80) < 5, JSON.stringify({ beforePan, afterPan }));
  assert(Math.abs((afterPan.y-beforePan.y)*beforePan.z-60) < 5);
  assert.equal(afterPan.t, "freedraw");
  assert.equal(afterPan.n, beforePan.n);
  checked("one finger grab-pans in the right direction without drawing and restores the pen");

  // Simulate a tool changing while the first finger is down, then add a
  // second finger. Routing must recheck the tool on that second contact.
  const elementsBeforeInterruptedPan = await evaluate("window.__pdApi.getSceneElements().length");
  await touch("touchStart", [[650, 500, 1]]);
  await evaluate("window.__pdApi.setActiveTool({type:'freedraw'})");
  await delay(80);
  await touch("touchStart", [[650, 500, 1], [850, 500, 2]]);
  assert.equal(await evaluate("window.__pdApi.getAppState().activeTool.type"), "hand");
  await touch("touchMove", [[650, 540, 1], [850, 540, 2]]);
  await touch("touchEnd", []);
  assert.equal(await evaluate("window.__pdApi.getSceneElements().length"), elementsBeforeInterruptedPan);
  assert.equal(await evaluate("window.__pdApi.getAppState().activeTool.type"), "freedraw");
  checked("second finger cannot bypass navigation after a mid-gesture tool change");

  const beforeZoom = await evaluate("window.__pdApi.getAppState().zoom.value");
  await touch("touchStart", [[650, 500, 1]]);
  await touch("touchStart", [[650, 500, 1], [850, 500, 2]]);
  await touch("touchMove", [[600, 500, 1], [900, 500, 2]]);
  await touch("touchEnd", []);
  assert((await evaluate("window.__pdApi.getAppState().zoom.value")) > beforeZoom * 1.1);
  assert.equal(await evaluate("window.__pdApi.getAppState().activeTool.type"), "freedraw");
  checked("pinch zoom works from the pen tool and restores it afterwards");

  const rectangle = await evaluate(`(() => {
    const api=window.__pdApi,a=api.getAppState(),r=api.getSceneElements().find(e=>e.type==='rectangle');
    window.__rectangleId=r.id;
    return { x:(r.x+a.scrollX)*a.zoom.value+a.offsetLeft, y:(r.y+a.scrollY)*a.zoom.value+a.offsetTop,
      w:r.width*a.zoom.value,h:r.height*a.zoom.value};
  })()`);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Lasso select').click()");
  const x=rectangle.x-15, y=rectangle.y-15, right=rectangle.x+rectangle.w+15, bottom=rectangle.y+rectangle.h+15;
  await mouse("mousePressed", x, y);
  for (const p of [[right,y],[right,bottom],[x,bottom],[x,y]]) await mouse("mouseMoved", ...p);
  await mouse("mouseReleased", x, y);
  await waitFor("!!window.__pdApi.getAppState().selectedElementIds[window.__rectangleId]");
  checked("lasso selects the physical rectangle after pan and zoom");

  const selectionBefore = await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__rectangleId).x");
  const currentZoom = await evaluate("window.__pdApi.getAppState().zoom.value");
  // An unfilled rectangle is hit on its stroke, not its empty middle.
  // Use its right edge, clear of the property panel on the left.
  const grabX = rectangle.x+rectangle.w-2, grabY = rectangle.y+rectangle.h/2;
  await touch("touchStart", [[grabX,grabY,1]]);
  await touch("touchMove", [[grabX+45,grabY,1]]);
  await touch("touchEnd", []);
  const selectionAfter = await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__rectangleId).x");
  assert(Math.abs((selectionAfter-selectionBefore)*currentZoom-45) < 5, JSON.stringify({selectionBefore,selectionAfter,currentZoom}));
  checked("finger moves a selected shape through native selection handling");

  await touch("touchStart", [[grabX+45,grabY,1]]);
  await delay(500);
  assert.equal(await evaluate("!!document.querySelector('.pd-selmenu')"), false);
  await touch("touchEnd", []);
  await waitFor("!!document.querySelector('.pd-selmenu')");
  checked("hold-and-release opens the unified menu after release");
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });

  await evaluate("window.__pdApi.setActiveTool({type:'freedraw'})");
  await delay(80);
  for (const offset of [0, 160]) {
    await mouse("mousePressed", 650+offset, 400);
    await mouse("mouseMoved", 680+offset, 430);
    await mouse("mouseMoved", 710+offset, 405);
    await mouse("mouseReleased", 710+offset, 405);
  }
  await evaluate(`(() => {const a=window.__pdApi,ink=a.getSceneElements().filter(e=>e.type==='freedraw');
    window.__inkIds=ink.map(e=>e.id); a.setActiveTool({type:'selection'});
    a.updateScene({appState:{selectedElementIds:Object.fromEntries(ink.map(e=>[e.id,true]))}});})()`);
  await waitFor("window.__inkIds.length === 2 && window.__inkIds.every(id=>window.__pdApi.getAppState().selectedElementIds[id])");
  await evaluate("document.querySelector('[data-ribbon-tab=draw]').click()");
  await delay(60);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Turn to text').click()");
  await waitFor("document.querySelectorAll('.pd-textpreview-box').length === 2");
  const previewBefore = await evaluate("document.querySelector('.pd-textpreview-box').getBoundingClientRect().x");
  await evaluate("window.__pdApi.updateScene({appState:{scrollX:window.__pdApi.getAppState().scrollX+30}})");
  await delay(100);
  const previewAfter = await evaluate("document.querySelector('.pd-textpreview-box').getBoundingClientRect().x");
  assert(Math.abs(previewAfter-previewBefore-30*currentZoom)<2);
  checked("handwriting preview follows a changed viewport");
  assert.equal(await evaluate("document.querySelectorAll('.pd-textpreview-box')[1].classList.contains('excluded')"), true);
  checked("suspected drawing is automatically kept as ink in the preview");
  await evaluate("document.querySelectorAll('.pd-tp-group')[1].dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelectorAll('.pd-textpreview-box')[1].classList.contains('excluded')"), false);
  await evaluate("document.querySelectorAll('.pd-tp-group')[1].dispatchEvent(new MouseEvent('click',{bubbles:true}))");
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Convert 1 to text')).click()");
  await delay(100);
  const conversion = await evaluate("({first:window.__pdApi.getSceneElements().some(e=>e.id===window.__inkIds[0]),second:window.__pdApi.getSceneElements().some(e=>e.id===window.__inkIds[1]),text:window.__pdApi.getSceneElements().some(e=>e.type==='text'&&e.text==='Sample text')})");
  assert.deepEqual(conversion, { first: false, second: true, text: true });
  assert.equal(await evaluate("window.__pdApi.getSceneElementsIncludingDeleted().find(e=>e.id===window.__inkIds[0]).isDeleted"), true);
  checked("conversion preserves excluded ink and replaces only the included block");
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await waitFor("window.__inkIds.every(id=>window.__pdApi.getSceneElements().some(e=>e.id===id)) && !window.__pdApi.getSceneElements().some(e=>e.type==='text')");
  checked("one undo restores the original ink after conversion");

  const selectInk = async () => {
    await evaluate(`(() => {const a=window.__pdApi,ink=a.getSceneElements().filter(e=>e.type==='freedraw');
      a.setActiveTool({type:'selection'}); a.updateScene({appState:{selectedElementIds:Object.fromEntries(ink.map(e=>[e.id,true]))}});})()`);
    await waitFor("window.__inkIds.every(id=>window.__pdApi.getAppState().selectedElementIds[id])");
  };
  const turnToText = async () => {
    await evaluate("document.querySelector('[data-ribbon-tab=draw]').click()");
  await delay(60);
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Turn to text').click()");
  };
  const changeInk = async () => {
    await evaluate(`(() => {const a=window.__pdApi;
      a.updateScene({captureUpdate:'IMMEDIATELY',elements:a.getSceneElementsIncludingDeleted().map(e=>e.id===window.__inkIds[0]
        ? {...e,x:e.x+20,version:e.version+1,versionNonce:e.versionNonce+1}:e)});})()`);
    await delay(70);
  };
  const fileAction = async (label) => {
    await evaluate("document.querySelector('.pd-filemenu > button').click()");
    await waitFor("!!document.querySelector('.pd-filemenu-panel')");
    await evaluate(`[...document.querySelectorAll('.pd-filemenu-panel button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  };
  await evaluate("window.__twoWords=true");
  await selectInk(); await turnToText();
  await waitFor("document.querySelectorAll('.pd-textpreview-box').length === 2");
  await evaluate("document.querySelector('.pd-textpreview-bar button').click()");
  await waitFor("window.__pdApi.getSceneElements().filter(e=>e.type==='text').length === 2");
  const textSizes = await evaluate("window.__pdApi.getSceneElements().filter(e=>e.type==='text').map(e=>e.fontSize)");
  assert.equal(textSizes[0], textSizes[1]);
  checked("different-height text blocks convert at one shared letter size");
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await waitFor("!window.__pdApi.getSceneElements().some(e=>e.type==='text')");
  await evaluate("window.__twoWords=false");

  await selectInk(); await turnToText();
  await waitFor("document.querySelectorAll('.pd-textpreview-box').length === 2");
  await changeInk();
  await evaluate("document.querySelector('.pd-textpreview-bar button').click()");
  await waitFor("!document.querySelector('.pd-textpreview')");
  assert.equal(await evaluate("window.__pdApi.getSceneElements().some(e=>e.type==='text')"), false);
  checked("changed ink cannot be replaced using a stale preview");

  await evaluate("window.__holdRecognition=true");
  await selectInk(); await turnToText();
  await waitFor("!!window.__finishRecognition");
  await changeInk();
  await evaluate("window.__finishRecognition()");
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Turn to text'&&!b.disabled)");
  assert.equal(await evaluate("!!document.querySelector('.pd-textpreview')"), false);
  checked("edits during native analysis discard its stale result");
  await evaluate("window.__finishRecognition=null");
  await turnToText(); await waitFor("!!window.__finishRecognition");
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await evaluate("window.__finishRecognition();window.__holdRecognition=false");
  await delay(100);
  assert.equal(await evaluate("!!document.querySelector('.pd-textpreview')"), false);
  checked("Escape cancels an in-flight recognition request");

  const versionBeforeDelete = await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__inkIds[0]).version");
  await evaluate("document.querySelector('.excalidraw canvas').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:760,clientY:300}))");
  await waitFor("!!document.querySelector('.pd-selmenu')");
  await evaluate("[...document.querySelectorAll('.pd-selmenu button')].find(b=>b.textContent.includes('Delete')).click()");
  await waitFor("window.__inkIds.every(id=>window.__pdApi.getSceneElementsIncludingDeleted().find(e=>e.id===id).isDeleted)");
  assert((await evaluate("window.__pdApi.getSceneElementsIncludingDeleted().find(e=>e.id===window.__inkIds[0]).version")) > versionBeforeDelete);
  await delay(100); // allow the canvas to commit its history capture
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await waitFor("window.__inkIds.every(id=>window.__pdApi.getSceneElements().some(e=>e.id===id))");
  checked("menu deletion leaves newer tombstones and one undo restores the selection");

  await fileAction("Save As…");
  await waitFor("window.__writes.length===1 && !document.querySelector('.pd-filename').textContent.includes('●')");
  checked("Save As establishes a clean baseline and file name");
  await evaluate("window.__holdWrite=true");
  await fileAction("Save");
  await waitFor("!!window.__finishWrite");
  const countBefore = await evaluate("window.__pdApi.getSceneElements().length");
  await rpc("Input.dispatchKeyEvent", { type: "keyDown", key: "n", code: "KeyN", windowsVirtualKeyCode: 78, modifiers: 2 });
  await rpc("Input.dispatchKeyEvent", { type: "keyUp", key: "n", code: "KeyN", windowsVirtualKeyCode: 78, modifiers: 2 });
  assert.equal(await evaluate("window.__pdApi.getSceneElements().length"), countBefore);
  await changeInk();
  await evaluate("window.__finishWrite();window.__holdWrite=false");
  await delay(100);
  assert.equal(await evaluate("document.querySelector('.pd-filename').textContent.includes('●')"), true);
  checked("edits during a disk write remain unsaved and another file action cannot overlap");
  await fileAction("Save");
  await waitFor("!document.querySelector('.pd-filename').textContent.includes('●')");
  checked("a subsequent save includes the newer edits");

  await evaluate("window.__holdRead=true");
  await fileAction("Open…"); await waitFor("!!window.__finishRead");
  await changeInk();
  const xBeforeOpen = await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__inkIds[0]).x");
  await evaluate("window.__confirmAnswer=false;window.__finishRead()");
  await delay(200);
  assert.equal(await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__inkIds[0]).x"), xBeforeOpen);
  assert.equal(await evaluate("document.querySelector('.pd-filename').textContent.includes('●')"), true);
  checked("Open protects edits arriving during a file read when discard is declined");
  await evaluate("window.__confirmAnswer=true;window.__holdRead=false");
  await fileAction("New");
  await waitFor("window.__pdApi.getSceneElements().length===0 && document.querySelector('.pd-filename').textContent==='Untitled'");
  assert.equal(await evaluate("window.__pdApi.getAppState().penMode"), true);
  assert.equal(await evaluate("document.querySelector('.pd-filename').textContent.includes('●')"), false);
  checked("New creates a clean document and preserves pen mode");
  await fileAction("Open…");
  await waitFor("window.__pdApi.getSceneElements().length===3 && !document.querySelector('.pd-filename').textContent.includes('●')");
  assert.equal(await evaluate("window.__pdApi.getAppState().penMode"), true);
  checked("Open restores the saved content, file binding and pen mode");
  await changeInk();
  await evaluate("window.dispatchEvent(new Event('pagehide'))");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('pendraw:editor-scene')).elements.find(e=>e.id===window.__inkIds[0]).x"),
    await evaluate("window.__pdApi.getSceneElements().find(e=>e.id===window.__inkIds[0]).x"));
  checked("page exit flushes the latest pending recovery snapshot");
  await rpc("Page.reload");
  await waitFor("window.__pdApi?.getSceneElements().length===3 && window.__pdApi.getAppState().activeTool.type==='freedraw'");
  assert.equal(await evaluate("document.querySelector('.pd-filename').textContent.includes('drawing.excalidraw') && document.querySelector('.pd-filename').textContent.includes('●')"), true);
  assert.equal(await evaluate("window.__pdApi.getAppState().penMode"), true);
  checked("reload recovers the drawing, named-file binding, dirty state and pen mode");

  const click=async(selector)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(70)};
  const change=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);await delay(70)};
  const undo=async()=>{await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});await delay(100)};
  const tab=async(name)=>click('[data-ribbon-tab='+name+']');
  const menu=async(label,more=false)=>{
    await evaluate("document.querySelector('.excalidraw canvas').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:900,clientY:500}))");
    await waitFor("!!document.querySelector('.pd-selmenu')");
    if(more)await click('.pd-selmenu-more');
    await evaluate(`[...document.querySelectorAll('.pd-selmenu button')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);
    await delay(100);
  };
  await tab('draw');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.excalidraw .App-menu_top__left')).display"),'none');
  await click('[aria-label="Highlighter"]');
  assert.equal(await evaluate('window.__pdApi.getAppState().currentItemOpacity'),35);
  await evaluate("document.querySelector('[aria-label=\"Highlighter options\"]').click()");
  await change('[aria-label="Pen preset color"]','#eecc33');
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('pendraw:pens'))[3].color"),'#eecc33');
  await evaluate("document.querySelector('[aria-label=\"Highlighter options\"]').click()");
  await click('[aria-label="Pen 1"]');
  await fileAction('About PenDraw');
  assert(await evaluate("document.querySelector('[aria-label=\"About PenDraw\"]').contains(document.activeElement)"));
  assert(await evaluate(`document.querySelector('[aria-label="About PenDraw"]').textContent.includes(${JSON.stringify('PenDraw '+expectedVersion)}) && document.querySelector('[aria-label="About PenDraw"]').textContent.includes('MIT License')`));
  await evaluate("[...document.querySelectorAll('[aria-label=\"About PenDraw\"] button')].find(b=>b.textContent==='Close').click()");
  checked('ribbon replaces native controls, applies editable pen/highlighter presets and shows version/licence');
  await tab('view');
  await change('[aria-label="Writing guides"]','grid');
  await change('[aria-label="Guide spacing"]','48');
  await evaluate("window.__pdApi.updateScene({appState:{scrollX:37,scrollY:59,zoom:{value:1.5}}})");
  await delay(100);
  const guide=await evaluate("(()=>{const el=document.querySelector('.pd-guides'),a=window.__pdApi.getAppState(),r=el.getBoundingClientRect();return {size:el.style.backgroundSize,pos:el.style.backgroundPosition,x:a.offsetLeft-r.left+a.scrollX*a.zoom.value,y:a.offsetTop-r.top+a.scrollY*a.zoom.value,pointer:getComputedStyle(el).pointerEvents}})()");
  assert.equal(guide.size,'72px 72px');assert.equal(guide.pointer,'none');
  assert.equal(guide.pos,`${guide.x}px ${guide.y}px`);
  assert.equal(await evaluate("window.__pdApi.getSceneElements().length"),3);
  checked('adjustable grid stays anchored to scene pan/zoom and adds no ink elements');
  await change('[aria-label="Writing guides"]','none');
  await click('[aria-label="Straighten held lines"]');
  await tab('draw');await click('[aria-label="Pen 1"]');
  await evaluate("window.__pdApi.resetScene();window.__pdApi.updateScene({appState:{penMode:true,scrollX:0,scrollY:0,zoom:{value:1}}});window.__pdApi.setActiveTool({type:'freedraw'})");
  await delay(100);
  await mouse('mousePressed',600,400);
  for(const p of [[640,401],[680,399],[730,402],[780,400]])await mouse('mouseMoved',...p);
  await delay(750);await waitFor("document.querySelector('.pd-drawing-hint')?.textContent.includes('Release to straighten')");
  await mouse('mouseReleased',780,400);
  await waitFor("window.__pdApi.getSceneElements().length===1 && window.__pdApi.getSceneElements()[0].points.length===2");
  await undo();
  await waitFor("window.__pdApi.getSceneElements().length===1 && window.__pdApi.getSceneElements()[0].points.length>2");
  checked('held nearly straight ink becomes a line only after release and one undo restores original ink');
  await mouse('mousePressed',620,470);
  for(const p of [[625,455],[635,470],[645,455],[655,470]])await mouse('mouseMoved',...p);
  await delay(750);await mouse('mouseReleased',655,470);
  assert.equal(await evaluate('window.__pdApi.getSceneElements().filter(e=>e.points.length===2).length'),0);
  checked('pause during short handwriting does not straighten it');
  await tab('view');await click('[aria-label="Straighten held lines"]');await tab('draw');
  await evaluate("window.__pdApi.resetScene();window.__pdApi.setActiveTool({type:'freedraw'})");await delay(100);
  const drawPath=async(points)=>{await mouse('mousePressed',...points[0]);for(let i=1;i<points.length;i++){const from=points[i-1],to=points[i],steps=Math.ceil(Math.hypot(to[0]-from[0],to[1]-from[1])/18);for(let j=1;j<=steps;j++)await mouse('mouseMoved',from[0]+(to[0]-from[0])*j/steps,from[1]+(to[1]-from[1])*j/steps);}await mouse('mouseReleased',...points.at(-1))};
  await drawPath([[250,350],[500,350],[500,650],[250,650],[250,350]]);
  await drawPath([[325,425],[400,425],[400,500],[325,500],[325,425]]);
  await click('[aria-label="Bucket fill"]');await mouse('mousePressed',280,390);await mouse('mouseReleased',280,390);
  await waitFor("window.__pdApi.getSceneElements().some(e=>e.customData?.pendrawFill)");
  const fillPixels=await evaluate("(async()=>{const a=window.__pdApi,e=a.getSceneElements().find(e=>e.customData?.pendrawFill),f=a.getFiles()[e.fileId],image=new Image();image.src=f.dataURL;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {outside:[...ctx.getImageData(70,70,1,1).data],hole:[...ctx.getImageData(image.width/2,image.height/3,1,1).data],ids:e.customData.boundaryIds,group:e.groupIds}})()");
  assert.equal(fillPixels.outside[3],255);assert.equal(fillPixels.hole[3],0);
  assert.equal(fillPixels.ids.length,2);assert.equal(fillPixels.group.length,1);
  await change('[aria-label="Bucket color"]','#aa22cc');await click('[aria-label="Bucket fill"]');await mouse('mousePressed',280,390);await mouse('mouseReleased',280,390);
  await waitFor("window.__pdApi.getSceneElementsIncludingDeleted().filter(e=>e.customData?.pendrawFill&&e.isDeleted).length===1");
  assert.equal(await evaluate('window.__pdApi.getSceneElements().filter(e=>e.customData?.pendrawFill).length'),1);
  checked('bucket fills a freehand region, preserves a nested hole and recolors without stacked old fills');
  const fillBefore=await evaluate('window.__pdApi.getSceneElements().find(e=>e.customData?.pendrawFill).id');
  await delay(100); // let Excalidraw capture the pointerup-created fill in history
  await undo();await waitFor(`window.__pdApi.getSceneElements().some(e=>e.customData?.pendrawFill&&e.id!==${JSON.stringify(fillBefore)})`);
  checked('one undo restores the previous bucket color');
  await evaluate("(()=>{const a=window.__pdApi;a.setActiveTool({type:'selection'});a.updateScene({appState:{selectedElementIds:Object.fromEntries(a.getSceneElements().map(e=>[e.id,true]))}})})()");
  await menu('Duplicate');
  await waitFor('window.__pdApi.getSceneElements().length===6');
  const cloned=await evaluate('(()=>{const a=window.__pdApi,els=a.getSceneElements(),ids=a.getAppState().selectedElementIds;return {old:els.filter(e=>!ids[e.id]).map(e=>e.groupIds),copies:els.filter(e=>ids[e.id]).map(e=>e.groupIds)}})()');
  assert.equal(new Set(cloned.copies.flat()).size,new Set(cloned.old.flat()).size);
  assert(cloned.copies.flat().every(g=>!cloned.old.flat().includes(g)));
  checked('duplicating a filled group makes independently grouped copies');
  const beforeMove=await evaluate('window.__pdApi.getSceneElements().filter(e=>window.__pdApi.getAppState().selectedElementIds[e.id]).map(e=>({id:e.id,x:e.x,y:e.y}))');
  await touch('touchStart',[[280,395,1]]);await touch('touchMove',[[320,425,1]]);await touch('touchEnd',[]);
  const afterMove=await evaluate('window.__pdApi.getSceneElements().filter(e=>window.__pdApi.getAppState().selectedElementIds[e.id]).map(e=>({id:e.id,x:e.x,y:e.y}))');
  assert.equal(beforeMove.length,afterMove.length);assert(beforeMove.every(e=>{const n=afterMove.find(v=>v.id===e.id);return Math.abs(n.x-e.x-40)<3&&Math.abs(n.y-e.y-30)<3}));
  checked('finger moves fill and its boundary ink together');
  await tab('draw');
  await evaluate("window.__downloads=[];window.__originalAnchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__downloads.push({name:this.download,blob:fetch(this.href).then(r=>r.blob())});else window.__originalAnchorClick.call(this)}");
  await fileAction('Export selection → PNG');
  await waitFor('window.__downloads.length>0');
  const png=await evaluate('(async()=>{const blob=await window.__downloads[0].blob;return {size:blob.size,type:blob.type,name:window.__downloads[0].name}})()');
  assert(png.size>100);assert.equal(png.type,'image/png');
  checked('selection PNG export contains the filled artwork');
  await evaluate('HTMLAnchorElement.prototype.click=window.__originalAnchorClick');
  await fileAction('Save As…');await waitFor('window.__writes.length>0');
  await evaluate('window.__savedFill=window.__disk');await fileAction('New');await fileAction('Open…');
  await waitFor('window.__pdApi.getSceneElements().length===6 && Object.keys(window.__pdApi.getFiles()).length>0');
  checked('saved files roundtrip filled artwork and its image data');
  await evaluate("window.__disk='{broken json'");const beforeInvalid=await evaluate('window.__pdApi.getSceneElements().map(e=>e.id)');
  await fileAction('Open…');await delay(100);
  assert.deepEqual(await evaluate('window.__pdApi.getSceneElements().map(e=>e.id)'),beforeInvalid);
  assert.equal(await evaluate('window.__alerts.length'),1);await evaluate('window.__alerts=[];window.__disk=window.__savedFill');
  checked('invalid opened file preserves current drawing');
  const filledFile=await evaluate('window.__savedFill');
  // Two real browser pages communicating through the production WebSocket hub.
  await evaluate(`localStorage.setItem('pendraw:sync-prefs',JSON.stringify({enabled:true,address:'127.0.0.1:${server.address().port}'}));window.dispatchEvent(new Event('pagehide'))`);
  await rpc('Page.reload');await waitFor("window.__pdApi?.getSceneElements().length===6 && (document.querySelector('.pd-status')?.dataset.status??document.querySelector('.pd-status')?.textContent)==='connected'");
  await evaluate(`window.__disk=${JSON.stringify(filledFile)}`);
  const editorSocket=ws;
  const target=await rpc('Target.createTarget',{url:`http://127.0.0.1:${server.address().port}/?mirror`});
  const mirrorPages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  mirrorSocket=new WebSocket(mirrorPages.find(p=>p.id===target.targetId).webSocketDebuggerUrl);wireSocket(mirrorSocket);
  await new Promise((resolve,reject)=>{mirrorSocket.once('open',resolve);mirrorSocket.once('error',reject)});
  ws=mirrorSocket;await rpc('Runtime.enable');await rpc('Page.enable');
  await waitFor("window.__pdApi?.getSceneElements().length===6 && (document.querySelector('.pd-status')?.dataset.status??document.querySelector('.pd-status')?.textContent)==='connected'");
  assert.equal(await evaluate('window.__pdApi.getSceneElements().filter(e=>e.customData?.pendrawFill&&window.__pdApi.getFiles()[e.fileId]).length'),2);
  const versions=await evaluate('window.__pdApi.getSceneElements().map(e=>[e.id,e.version])');await delay(600);
  assert.deepEqual(await evaluate('window.__pdApi.getSceneElements().map(e=>[e.id,e.version])'),versions);
  checked('second live view receives filled images on initial connection without a version feedback loop');
  ws=editorSocket;await delay(150);
  await evaluate("(()=>{const a=window.__pdApi,fill=a.getSceneElements().find(e=>e.customData?.pendrawFill);window.__layerId=fill.id;a.setActiveTool({type:'selection'});a.updateScene({appState:{selectedElementIds:{[fill.id]:true}}})})()");
  await menu('Bring to front',true);
  const order=await evaluate('window.__pdApi.getSceneElements().map(e=>e.id)');
  ws=mirrorSocket;await waitFor(`JSON.stringify(window.__pdApi.getSceneElements().map(e=>e.id))===${JSON.stringify(JSON.stringify(order))}`);
  checked('selection layer order propagates to another live view');
  ws=editorSocket;
  await fileAction('Settings');await click('[aria-label="Connect to a contributor mirror"]');
  await waitFor("!document.querySelector('.pd-status')");
  const deleted=await evaluate("(()=>{const a=window.__pdApi,e=a.getSceneElements().find(e=>e.type==='freedraw');window.__deleteId=e.id;a.updateScene({captureUpdate:'IMMEDIATELY',elements:a.getSceneElementsIncludingDeleted().map(v=>v.id===e.id?{...v,isDeleted:true,version:v.version+1,versionNonce:v.versionNonce+1}:v)});return e.id})()");
  await click('[aria-label="Connect to a contributor mirror"]');await fileAction('Settings');
  await waitFor("(document.querySelector('.pd-status')?.dataset.status??document.querySelector('.pd-status')?.textContent)==='connected'");
  ws=mirrorSocket;await waitFor(`window.__pdApi.getSceneElementsIncludingDeleted().some(e=>e.id===${JSON.stringify(deleted)}&&e.isDeleted)`);
  ws=editorSocket;await delay(200);assert.equal(await evaluate(`window.__pdApi.getSceneElements().some(e=>e.id===${JSON.stringify(deleted)})`),false);
  checked('offline deletion survives reconnect and reaches the second live view');
  const peerIds=await evaluate('window.__pdApi.getSceneElements().map(e=>e.id)');
  await fileAction('New');await waitFor("window.__pdApi.getSceneElements().length===0&&!document.querySelector('.pd-status')");await delay(150);
  assert.equal(await evaluate('window.__pdApi.getSceneElements().length'),0);
  ws=mirrorSocket;assert.deepEqual(await evaluate('window.__pdApi.getSceneElements().map(e=>e.id)'),peerIds);
  ws=editorSocket;
  checked('New disconnects before replacing shared scene and leaves the other device intact');
  await fileAction('Open…');await waitFor('window.__pdApi.getSceneElements().length===6');
  await fileAction('Settings');await click('[aria-label="Connect to a contributor mirror"]');await fileAction('Settings');
  await waitFor("(document.querySelector('.pd-status')?.dataset.status??document.querySelector('.pd-status')?.textContent)==='connected'");
  await fileAction('Open…');await waitFor("!document.querySelector('.pd-status') && window.__pdApi.getSceneElements().length===6");
  checked('Open disconnects sharing before replacing the current document');

  await tab('draw');
  await fileAction('Settings');await evaluate("[...document.querySelectorAll('.pd-settings-panel button')].find(b=>b.textContent==='Handwriting quality').click()");
  await waitFor("document.querySelector('.pd-dialog h2')?.textContent==='Handwriting quality'" );
  const sample=JSON.parse(await fs.readFile(path.join(app,'tests/fixtures/drawing-box.json'),'utf8'));
  await evaluate(`(()=>{const el=document.querySelector('[aria-label="Handwriting quality"] input[type=file]'),dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(sample))}],'drawing-box.json',{type:'application/json'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await waitFor("document.querySelector('[aria-label=\"Handwriting quality\"]').textContent.includes('Loaded a synthetic test sample.')");
  await evaluate("[...document.querySelectorAll('[aria-label=\"Handwriting quality\"] button')].find(b=>b.textContent.includes('Compare line')).click()");
  await waitFor("document.querySelector('[aria-label=\"Handwriting quality\"]').textContent.includes('Paragraph:')");
  assert(await evaluate("document.querySelector('[aria-label=\"Handwriting quality\"]').textContent.includes('character differences')"));
  await evaluate("[...document.querySelectorAll('[aria-label=\"Handwriting quality\"] button')].find(b=>b.textContent==='Close').click()");
  checked('saved ink sample imports and compares line/paragraph with explicit character differences');
  await tab('draw');


  // New feedback uses actual canvas gestures, rather than canned source-shaped checks.
  await rpc('Page.bringToFront'); // touch dispatch requires the editor, not the mirror tab, in front
  await tab('draw');
  for(const name of ['Rectangle','Ellipse','Diamond','Line','Arrow'])assert(await evaluate(`!!document.querySelector('[aria-label="${name}"]')`));
  assert.equal(await evaluate("document.querySelectorAll('.pd-pen-options').length"),4);
  await click('[aria-label="Pen 2 options"]');await change('[aria-label="Pen preset color"]','#a033cc');await change('[aria-label="Thickness"]','1.2');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Pen 2\"]').title.includes('#a033cc')"),true);
  await click('[aria-label="Pen 2 options"]');await click('[aria-label="Pen 1"]');
  await click('[aria-label="Pen 2"]');assert.equal(await evaluate('window.__pdApi.getAppState().currentItemStrokeWidth'),1.2);
  assert.equal(await evaluate('window.__pdApi.getAppState().currentItemStrokeColor'),'#a033cc');
  checked('each pen has independent editable saved colour and width, with truthful numbered names');
  await tab('view');await click('[aria-label="Show tool labels"]');await tab('draw');
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Pan\"]').textContent"),'Pan');
  await tab('view');await click('[aria-label="Show tool labels"]');await click('[aria-label="Zoom to 100%"]');
  assert.equal(await evaluate('window.__pdApi.getAppState().zoom.value'),1);
  checked('optional tool labels and explicit 100 percent view work');
  await evaluate('window.__feedbackScene=structuredClone(window.__pdApi.getSceneElementsIncludingDeleted())');
  await tab('draw');
  for(const name of ['Rectangle','Ellipse','Diamond']){
    await click('[aria-label="'+name+'"]');
    await mouse('mousePressed',700,330);await mouse('mouseMoved',880,450);await mouse('mouseReleased',880,450);
    await waitFor("window.__pdApi.getAppState().activeTool.type==='freedraw'");
    assert.deepEqual(await evaluate('window.__pdApi.getAppState().selectedElementIds'),{});
    await tab('insert');await click('[aria-label="Bucket fill"]');
    const before=await evaluate("window.__pdApi.getSceneElements().filter(e=>e.customData?.pendrawFill).length");
    await touch('touchStart',[[790,390,1]]);await touch('touchEnd',[]);
    await waitFor('window.__pdApi.getSceneElements().filter(e=>e.customData?.pendrawFill).length>'+before);
    await tab('draw');await evaluate('window.__pdApi.updateScene({elements:window.__feedbackScene,appState:{selectedElementIds:{}}})');
  }
  checked('native rectangle ellipse and diamond gestures restore pen, and finger taps fill each shape');
  await tab('draw');await click('[aria-label="Rectangle"]');await mouse('mousePressed',730,330);await mouse('mouseMoved',880,450);await mouse('mouseReleased',880,450);
  await waitFor("window.__pdApi.getAppState().activeTool.type==='freedraw'");
  await touch('touchStart',[[790,390,1]]);await delay(550);await touch('touchEnd',[]);
  await waitFor("window.__pdApi.getAppState().activeTool.type==='selection' && !!document.querySelector('.pd-selmenu')");
  const placement=await evaluate("(()=>{const a=window.__pdApi,e=a.getSceneElements().find(e=>a.getAppState().selectedElementIds[e.id]),s=a.getAppState(),r=document.querySelector('.pd-selmenu').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,elLeft:(e.x+s.scrollX)*s.zoom.value+s.offsetLeft,elRight:(e.x+e.width+s.scrollX)*s.zoom.value+s.offsetLeft,elTop:(e.y+s.scrollY)*s.zoom.value+s.offsetTop,elBottom:(e.y+e.height+s.scrollY)*s.zoom.value+s.offsetTop}})()");
  assert(placement.right<placement.elLeft||placement.left>placement.elRight||placement.bottom<placement.elTop||placement.top>placement.elBottom);
  checked('finger hold selects a newly drawn object and selection menu sits outside its handles');
  await click('[aria-label="Pen 1"]');
  await evaluate('window.__pdApi.updateScene({elements:window.__feedbackScene,appState:{selectedElementIds:{}}})');
  await tab('insert');await click('[aria-label="Text options"]');await change('[aria-label="Text size"]','24');await change('[aria-label="Font"]','2');
  await change('[aria-label="Text color"]','#223388');await change('[aria-label="Text box background"]','#ffeedd');await click('[aria-label="Text options"]');
  await click('[aria-label="Text"]');await mouse('mousePressed',700,330);await mouse('mouseMoved',950,460);await mouse('mouseReleased',950,460);
  await waitFor("!!document.querySelector('[aria-label=\"Text box content\"]')");await change('[aria-label="Text box content"]','Two lines\nof typed text');
  await evaluate("[...document.querySelectorAll('[aria-label=\"Write in text box\"] button')].find(b=>b.textContent==='Add text').click()");
  await waitFor('window.__pdApi.getSceneElements().some(e=>e.customData?.pendrawTextBox)');
  const textBox=await evaluate("(()=>{const a=window.__pdApi,b=a.getSceneElements().find(e=>e.customData?.pendrawTextBox),t=a.getSceneElements().find(e=>e.containerId===b.id);window.__feedbackBox=b.id;return {size:t.fontSize,color:t.strokeColor,font:t.fontFamily,background:b.backgroundColor}})()");
  assert.deepEqual(textBox,{size:24,color:'#223388',font:2,background:'#ffeedd'});
  const corner=await evaluate("(()=>{const a=window.__pdApi,b=a.getSceneElements().find(e=>e.id===window.__feedbackBox),s=a.getAppState();return {x:(b.x+b.width+s.scrollX)*s.zoom.value+s.offsetLeft,y:(b.y+b.height+s.scrollY)*s.zoom.value+s.offsetTop,width:b.width}})()");
  await mouse('mousePressed',corner.x,corner.y);await mouse('mouseMoved',corner.x+70,corner.y+50);await mouse('mouseReleased',corner.x+70,corner.y+50);
  assert(await evaluate('window.__pdApi.getSceneElements().find(e=>e.id===window.__feedbackBox).width')>corner.width+40);
  assert.equal(await evaluate('window.__pdApi.getSceneElements().find(e=>e.containerId===window.__feedbackBox).fontSize'),24);
  checked('drawn text box uses chosen font size and colours, with letter size preserved during resizing');
  await evaluate('window.__pdApi.updateScene({elements:window.__feedbackScene,appState:{selectedElementIds:{}}})');await tab('draw');
  assert(await evaluate("!!document.querySelector('[aria-label=\"Export selection to PNG\"]')===false"));
  assert.equal(await evaluate("document.querySelector('.pd-status')"),null);
  checked('mirror connection status stays absent while sharing is off');


  await click('[aria-label="Rename drawing"]');await change('[aria-label="Drawing name"]','Meeting notes');
  await evaluate("window.__savePath='C:/PenDraw-test/Meeting notes.excalidraw'");
  await evaluate("[...document.querySelectorAll('[aria-label=\"Rename drawing\"] button')].find(b=>b.textContent==='Rename').click()");
  await waitFor("!document.querySelector('[aria-label=\"Drawing name\"]')");
  assert.equal(await evaluate("document.querySelector('.pd-filename').textContent.includes('Meeting notes.excalidraw')"),true);
  await fileAction('New');
  await click('[aria-label="Rename drawing"]');await change('[aria-label="Drawing name"]','New board title');
  await evaluate("[...document.querySelectorAll('[aria-label=\"Rename drawing\"] button')].find(b=>b.textContent==='Rename').click()");
  await waitFor("document.querySelector('.pd-filename').textContent==='New board title'");
  assert.equal(await evaluate("localStorage.getItem('pendraw:drawing-title')"),'New board title');
  assert.equal(await evaluate('window.__pdApi.getAppState().zoom.value'),1);
  assert.equal(await evaluate('window.__pdApi.getAppState().currentItemFontFamily'),2);
  await fileAction('New');await evaluate('window.__pdApi.updateScene({elements:window.__feedbackScene})');
  checked('tappable title supports native Save As and remembered untitled-board naming');

  // Validate the style controls that replace the hidden native panel.
  await evaluate('window.__baseScene=structuredClone(window.__pdApi.getSceneElementsIncludingDeleted())');
  await tab('draw');await click('[aria-label="Rectangle"]');
  await mouse('mousePressed',800,350);await mouse('mouseMoved',1000,475);await mouse('mouseReleased',1000,475);
  await waitFor('window.__pdApi.getSceneElements().some(e=>e.type===\'rectangle\')');
  await evaluate("(()=>{const a=window.__pdApi,e=a.getSceneElements().find(e=>e.type==='rectangle');window.__styleBox=e.id;a.setActiveTool({type:'selection'});a.updateScene({appState:{selectedElementIds:{[e.id]:true}}})})()");
  await delay(100);
  await evaluate("window.__pdApi.updateScene({appState:{selectedElementIds:{[window.__styleBox]:true}}})");
  await delay(100);
  assert(await evaluate('!!window.__pdApi.getAppState().selectedElementIds[window.__styleBox]'));
  await tab('draw');await click('[aria-label="Selection formatting"]');
  await change('[aria-label="Stroke color"]','#123456');await change('[aria-label="Shape fill color"]','#ccffee');
  await change('[aria-label="Selection width"]','1.4');await change('[aria-label="Opacity"]','70');
  const styled=await evaluate('window.__pdApi.getSceneElements().find(e=>e.id===window.__styleBox)');
  assert.equal(styled.strokeColor,'#123456');assert.equal(styled.backgroundColor,'#ccffee');assert.equal(styled.opacity,70);assert(Math.abs(styled.strokeWidth-1.4*4.25)<.001);
  checked('replacement shape controls change selected color, fill, width and opacity');
  await rpc('Input.dispatchMouseEvent',{type:'mousePressed',x:880,y:400,button:'left',buttons:1,clickCount:2});
  await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',x:880,y:400,button:'left',buttons:0,clickCount:2});
  await rpc('Input.insertText',{text:'Ribbon text'});
  await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor("window.__pdApi.getSceneElements().some(e=>e.type==='text'&&e.containerId===window.__styleBox)");
  await evaluate("(()=>{const a=window.__pdApi,e=a.getSceneElements().find(e=>e.type==='text'&&e.containerId===window.__styleBox);window.__styleText=e.id;window.__oldHeight=e.height;a.updateScene({appState:{selectedElementIds:{[e.id]:true}}})})()");
  await evaluate("document.querySelector('[aria-label=\"Selection formatting\"]').click()");
  await change('[aria-label="Text size"]','36');
  assert(await evaluate('(()=>{const e=window.__pdApi.getSceneElements().find(e=>e.id===window.__styleText);return e.fontSize===36&&e.height>window.__oldHeight})()'));
  await evaluate("document.querySelector('[aria-label=\"Selection formatting\"]').click()");
  checked('replacement text size control recalculates visible text dimensions');
  await evaluate("window.__pdApi.updateScene({appState:{selectedElementIds:{[window.__styleBox]:true}}})");
  await menu('Duplicate');
  assert(await evaluate("(()=>{const a=window.__pdApi,ids=a.getAppState().selectedElementIds,box=a.getSceneElements().find(e=>ids[e.id]&&e.type==='rectangle'),text=a.getSceneElements().find(e=>e.type==='text'&&e.containerId===box?.id);return !!text&&box.id!==window.__styleBox&&text.id!==window.__styleText&&box.boundElements.some(b=>b.id===text.id)})()"));
  checked('actual canvas duplication preserves bound text with reciprocal new ids');
  const imagesBefore=await evaluate("window.__pdApi.getSceneElements().filter(e=>e.type==='image').length");
  await tab('insert');
  await evaluate("(async()=>{const a=window.__pdApi,file=Object.values(a.getFiles())[0],blob=await(await fetch(file.dataURL)).blob(),el=document.querySelector('#pd-insert input[accept=\"image/*\"]'),dt=new DataTransfer();dt.items.add(new File([blob],'test-image.png',{type:'image/png'}));el.files=dt.files;el.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await waitFor(`window.__pdApi.getSceneElements().filter(e=>e.type==='image').length===${imagesBefore+1}`);
  checked('ribbon image insertion decodes a file and adds an editable image with its asset');
  await evaluate("window.__pdApi.updateScene({elements:window.__baseScene,appState:{selectedElementIds:{}}});window.__pdApi.setActiveTool({type:'freedraw'})");
  await rpc('Target.closeTarget',{targetId:target.targetId});mirrorSocket.close();
  await rpc('Page.bringToFront');await delay(100);


  // App chrome: real controls and canvas; only native window IPC is simulated.
  const key=async(name)=>{await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name});await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name});await delay(80)};
  const shot=async(name)=>{const r=await rpc('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(cache,name+'.png'),Buffer.from(r.data,'base64'))};
  const appearance=async(mode)=>{if(await evaluate("location.search.includes('mirror')"))await click('.pd-settings > button');else await fileAction('Settings');await change('[aria-label="Theme"]',mode);await delay(120)};
  const contrast=async(selectors)=>{
    const results=await evaluate(`(()=>{const luminance=c=>{const v=c.match(/[\\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722};return [...document.querySelectorAll(${JSON.stringify(selectors)})].filter(e=>e.getClientRects().length).map(e=>{let bg=e;while(bg.parentElement&&getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement;const a=luminance(getComputedStyle(e).color),b=luminance(getComputedStyle(bg).backgroundColor);return {text:e.textContent.trim().slice(0,30),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})})()`);
    assert(results.length>0);for(const r of results)assert(r.ratio>=4.5,JSON.stringify(r));
  };
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.default-sidebar-trigger')).display"),'none');
  await fileAction('Library');await waitFor("!!document.querySelector('.library-menu-items-container')");
  await evaluate("(async()=>{const a=window.__pdApi;await a.updateLibrary({libraryItems:[{id:'test-library-shape',status:'unpublished',created:Date.now(),elements:[a.getSceneElements().find(e=>e.type==='freedraw')]}],merge:false})})()");
  await waitFor("JSON.parse(localStorage.getItem('pendraw:library')??'[]').some(i=>i.id==='test-library-shape')");
  await shot('library-light');
  await evaluate("window.__pdApi.toggleSidebar({name:'default',force:false})");
  checked('Library is reachable from the unified app menu and stores reusable shapes locally');
  const unchanged=await evaluate('JSON.stringify(window.__pdApi.getSceneElements())');
  await appearance('dark');await waitFor("window.__pdApi.getAppState().theme==='dark'");
  assert.equal(await evaluate('JSON.stringify(window.__pdApi.getSceneElements())'),unchanged);
  await contrast('.pd-settings-row,.pd-settings-title,.pd-settings-note,.pd-bar .pd-btn,.pd-filename,.pd-status,.pd-save');
  await shot('settings-dark');await key('Escape');assert.equal(await evaluate("!!document.querySelector('.pd-settings-panel')"),false);
  await click('.pd-filemenu > button');await contrast('.pd-menu-heading,.pd-menu-item');await shot('menu-dark');
  await key('Escape');assert.equal(await evaluate("!!document.querySelector('.pd-filemenu-panel')"),false);
  await tab('draw');await contrast('.pd-ribbon-panel button,.pd-ribbon-panel label');await shot('drawing-dark');
  await fileAction('About PenDraw');await contrast('.pd-dialog,.pd-dialog a');await shot('about-dark');await key('Escape');
  checked('dark theme covers header, menus, settings, ribbon and dialogs with readable contrast and unchanged drawing data');
  await evaluate("(()=>{const a=window.__pdApi; a.updateScene({appState:{selectedElementIds:Object.fromEntries(a.getSceneElements().filter(e=>e.type==='freedraw').map(e=>[e.id,true]))}})})()");
  await turnToText();await waitFor("!!document.querySelector('.pd-textpreview-bar')");await contrast('.pd-textpreview-bar,.pd-tp-hint,.pd-textpreview-bar button');await shot('conversion-dark');
  await evaluate("[...document.querySelectorAll('.pd-textpreview-bar button')].find(b=>b.textContent==='Cancel').click()");
  await evaluate("document.querySelector('.excalidraw canvas').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:900,clientY:500}))");await waitFor("!!document.querySelector('.pd-selmenu')");await contrast('.pd-selmenu-label,.pd-selmenu-item,.pd-selmenu-more');await shot('selection-dark');await key('Escape');
  await fileAction('Settings');await evaluate("[...document.querySelectorAll('.pd-settings-panel button')].find(b=>b.textContent==='Handwriting quality').click()");await waitFor("!!document.querySelector('[aria-label=\"Handwriting quality\"]')");await contrast('.pd-dialog,.pd-dialog button,.pd-dialog label');await shot('quality-dark');await key('Escape');
  checked('conversion previews, selection actions and handwriting quality remain readable in dark mode');
  const canvasBeforeFocus=await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height");
  await click('[aria-label="Full screen"]');await waitFor("!!document.querySelector('[aria-label=\"Exit full screen\"]')");
  assert(await evaluate("window.__windowOps.some(o=>o.op==='set_fullscreen'&&o.args.value===true)"));
  assert(await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height")>canvasBeforeFocus+40);
  await click('[aria-label="Hide pen toolbar"]');assert.equal(await evaluate("document.querySelector('#pd-draw').getClientRects().length"),0);await click('[aria-label="Show pen toolbar"]');
  checked('fullscreen grows the work canvas and its floating pens can hide');
  await key('F11');await waitFor("!!document.querySelector('[aria-label=\"Full screen\"]')");
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Minimize\"], [aria-label=\"Maximize\"], [aria-label=\"Close PenDraw\"]')"),false);
  await fileAction('Settings');await click('[aria-label="Open in full screen"]');await key('Escape');
  await rpc('Page.reload');await waitFor("!!window.__pdApi && window.__pdApi.getAppState().theme==='dark' && !!document.querySelector('[aria-label=\"Exit full screen\"]')");await delay(250);
  await fileAction('Library');await waitFor("!!document.querySelector('.library-menu-items-container')");
  assert(await evaluate("!!document.querySelector('.library-menu-items-container svg')"));await shot('library-dark');
  const beforeLibraryInsert=await evaluate('window.__pdApi.getSceneElements().length');await click('.library-unit__dragger');await waitFor('window.__pdApi.getSceneElements().length>'+beforeLibraryInsert);
  checked('reopened Library can insert its saved drawing back onto the board');
  await evaluate("window.__pdApi.toggleSidebar({name:'default',force:false})");
  checked('theme, startup full screen and saved Library survive reopening; custom native window controls are absent');
  await fileAction('Settings');await click('[aria-label="Open in full screen"]');await key('Escape');await key('F11');
  await rpc('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:false});await delay(200);
  const targetSizes=await evaluate("[...document.querySelectorAll('.pd-bar button,.pd-ribbon-tabs button,.pd-ribbon-panel:not([hidden]) button')].filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label')??e.textContent,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))");
  for(const size of targetSizes)assert(size.width>=44&&size.height>=44,JSON.stringify(size));
  assert(await evaluate("document.querySelector('.pd-bar').scrollWidth<=360"));
  await fileAction('Settings');assert(await evaluate("(()=>{const r=document.querySelector('.pd-settings-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));await shot('touch-dark');await key('Escape');
  checked('360px touch layout fits its header and settings with targets of at least 44px');
  await rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await appearance('system');await key('Escape');await rpc('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await waitFor("window.__pdApi.getAppState().theme==='light'");
  await rpc('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await waitFor("window.__pdApi.getAppState().theme==='dark'");
  checked('device theme follows live system changes');
  await appearance('light');await contrast('.pd-settings-row,.pd-settings-title,.pd-settings-note,.pd-bar .pd-btn,.pd-filename,.pd-status,.pd-save');await shot('settings-light');await key('Escape');
  await tab('draw');await contrast('.pd-ribbon-panel button,.pd-ribbon-panel label');await click('.pd-filemenu > button');await contrast('.pd-menu-heading,.pd-menu-item');await shot('menu-light');await key('Escape');await shot('drawing-light');
  checked('light theme remains readable across header, settings, app menu and ribbon');

  await delay(1000);
  await evaluate("window.__recoveryWrites=[];window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pendraw:editor-scene'||k==='pendraw:editor-files')window.__recoveryWrites.push(k);return window.__storageSet.call(this,k,v)}");
  const savedLabel=await evaluate("document.querySelector('.pd-save').textContent");
  for(let i=0;i<24;i++){await evaluate(`window.__pdApi.updateScene({appState:{scrollX:100+${i},scrollY:50,zoom:{value:1+${i}/100},selectedElementIds:{}}})`);await delay(100)}
  await evaluate("window.__pdApi.setActiveTool({type:'hand'})");await delay(1000);
  assert.equal(await evaluate('window.__recoveryWrites.length'),0);assert.equal(await evaluate("document.querySelector('.pd-save').textContent"),savedLabel);
  await evaluate("(()=>{const a=window.__pdApi,e=a.getSceneElements()[0];a.updateScene({elements:a.getSceneElementsIncludingDeleted().map(el=>el.id===e.id?{...el,strokeColor:'#184c80',version:el.version+1,versionNonce:9821}:el)})})()");
  await delay(950);assert(await evaluate("window.__recoveryWrites.includes('pendraw:editor-scene')"));
  await evaluate("window.__recoveryWrites=[];window.__pdApi.updateScene({appState:{scrollX:4321}})");await waitFor('window.__pdApi.getAppState().scrollX===4321');await evaluate("window.dispatchEvent(new Event('pagehide'))");
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('pendraw:editor-scene')).appState.scrollX"),4321);
  checked('panning, zooming, selection and tools do not trigger recovery writes; content edits and closing preserve drawing and view');

  await evaluate("window.__failedAttempts=0;Storage.prototype.setItem=function(k,v){if(k==='pendraw:editor-scene'){window.__failedAttempts++;throw new Error('synthetic storage quota')}return window.__storageSet.call(this,k,v)};window.__pdApi.updateScene({appState:{viewBackgroundColor:'#f4f7fb'}})");
  await delay(1000);assert.equal(await evaluate('window.__failedAttempts'),1);assert(await evaluate("document.querySelector('.pd-save').textContent.includes('Recovery unavailable')"));
  for(let i=0;i<12;i++){await evaluate(`window.__pdApi.updateScene({appState:{scrollX:${4500+i}}})`);await delay(100)}await delay(900);assert.equal(await evaluate('window.__failedAttempts'),1);
  await evaluate("Storage.prototype.setItem=window.__storageSet;window.__pdApi.updateScene({appState:{viewBackgroundColor:'#ffffff'}})");await delay(1000);assert.equal(await evaluate("document.querySelector('.pd-save').textContent"),'Saved');
  checked('storage failures remain visible without retrying on pan; the next content edit retries recovery successfully');
  await evaluate("Storage.prototype.setItem=window.__storageSet;window.__pdApi.updateScene({appState:{scrollX:0,scrollY:0,zoom:{value:1}}})");
  const expandedHeight=await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height");
  await click('[aria-label="Collapse ribbon"]');assert(await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height")>expandedHeight+40);
  await rpc('Page.reload');await waitFor("!!window.__pdApi&&!!document.querySelector('[aria-label=\"Expand ribbon\"]')");
  await tab('insert');assert.equal(await evaluate("document.querySelector('#pd-insert').hidden"),false);await tab('draw');
  checked('collapse expands the canvas, remembers its state and clicking a tab reopens tools');

  // The plain-browser path uses the actual fullscreen API and retains file backup options.
  await evaluate("sessionStorage.setItem('browser-mode','1')");await rpc('Page.reload');await waitFor("!!window.__pdApi && !!document.querySelector('[aria-label=\"Full screen\"]')");
  await click('.pd-filemenu > button');assert(await evaluate("document.querySelector('.pd-filemenu-panel').textContent.includes('Save backup')"));await key('Escape');
  await click('[aria-label="Full screen"]');await waitFor('!!document.fullscreenElement');await key('F11');await waitFor('!document.fullscreenElement');
  assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Close PenDraw\"]')"),false);
  checked('browser edition keeps its backup menu and enters/exits real browser full screen');

  await rpc('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?mirror`});await waitFor('!!window.__pdApi');await appearance('dark');await waitFor("window.__pdApi.getAppState().theme==='dark'");await contrast('.pd-settings-row,.pd-settings-note,.pd-bar .pd-btn');await shot('mirror-dark');await key('Escape');
  await contrast('.pd-mode.mirror');
  await rpc('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:false});await delay(150);assert(await evaluate("document.querySelector('.pd-bar').scrollWidth<=360"));await shot('mirror-touch-dark');
  await rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  checked('editable mirror shares app appearance, readable badge and a fitting touch header');
  assert.deepEqual(await evaluate("window.__alerts"), []);
  assert.deepEqual(browserErrors, []);
  const screenshot = await rpc("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(path.join(cache, "verified.png"), Buffer.from(screenshot.data, "base64"));
  await fs.writeFile(path.join(cache, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Report: ${path.join(cache, "report.json")}`);
} catch(error) {
  if(ws?.readyState===WebSocket.OPEN){try{console.log(await evaluate("JSON.stringify({selected:window.__pdApi?.getAppState().selectedElementIds,canvas:document.querySelector('.excalidraw canvas')?.getBoundingClientRect().toJSON(),els:window.__pdApi?.getSceneElements().map(e=>({id:e.id,type:e.type,x:e.x,y:e.y}))})"));const shot=await rpc("Page.captureScreenshot",{format:"png"});await fs.writeFile(path.join(cache,"failure.png"),Buffer.from(shot.data,"base64"));}catch{}}
  throw error;
} finally {
  if (ws?.readyState === WebSocket.OPEN) {
    try { await rpc("Browser.close"); } catch { /* process may already have exited */ }
    ws.close();
  }
  mirrorSocket?.close();
  browser?.kill();
  hubSockets.clients.forEach(c=>c.terminate());
  await new Promise(resolve=>hubSockets.close(resolve));
  await new Promise((resolve) => server.close(resolve));
}
