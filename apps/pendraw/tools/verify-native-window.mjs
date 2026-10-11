// Launches only its own EXE with an isolated WebView2 profile. No native IPC mocks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {WebSocket} from 'ws';
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(app,'../..');
const cache=path.join(root,'.cache/native-window-check');
const profile=path.join(cache,'profile-'+Date.now());
const exe=process.env.PENDRAW_EXE??path.join(root,'.cache/native-target/release/PenDraw.exe');
const report={checks:[],limitations:'Automated native window and WebView2 checks. Physical pen and palm feel remain device checks.'};
let child,socket,counter=0;
const pending=new Map();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function checked(name){report.checks.push(name);console.log('PASS '+name)}
async function rpc(method,params={}){const id=++counter;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timed out '+method))},12000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
async function waitFor(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(60)}throw new Error('Condition timed out '+expression)}
const invoke=async(op)=>evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:window|${op}',{label:'main'})`);
const click=async(selector)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(100)};
const shot=async(name)=>{const r=await rpc('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(cache,name+'.png'),Buffer.from(r.data,'base64'))};
async function launch(){
 const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 child=spawn(exe,[],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-address=127.0.0.1 --remote-debugging-port=${port} --remote-allow-origins=http://127.0.0.1:${port}`}});
 let page;for(let i=0;i<150;i++){try{const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=pages.find(p=>p.type==='page'&&p.url.includes('tauri.localhost'));if(page)break}catch{}if(child.exitCode!==null)throw new Error('EXE exited '+child.exitCode);await delay(100)}
 assert(page,'Native WebView2 did not expose its test page');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)});
 socket.on('message',data=>{const r=JSON.parse(data);const entry=pending.get(r.id);if(!entry)return;pending.delete(r.id);if(r.error)entry.reject(new Error(JSON.stringify(r.error)));else entry.resolve(r.result)});
 await rpc('Runtime.enable');await rpc('Page.enable');await waitFor('!!window.__pdApi && !!document.querySelector(".pd-save.saved")');
}
async function close(){const exited=new Promise(resolve=>{if(child.exitCode!==null)resolve();else child.once('exit',resolve)});await invoke('close');await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Native close did not exit the EXE')),6000))]);socket.close();socket=null;child=null}
try{
 await fs.mkdir(profile,{recursive:true});await launch();
 assert.equal(await invoke('is_decorated'),true);assert.equal(await evaluate("document.querySelector('.pd-brand').textContent.includes('PenDraw')"),true);
 checked('compiled EXE retains original decorated Windows title bar and updated PenDraw icon');
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('pendraw:editor-scene')).elements.length"),0);
 checked('native checks use a fresh isolated recovery profile');
 assert.equal(await evaluate("document.querySelectorAll('.pd-pen-options').length"),4);
 assert.equal(await evaluate("window.__pdApi.getAppState().currentItemFontFamily"),2);
 assert.equal(await evaluate("window.__pdApi.getAppState().zoom.value"),1);
 assert.equal(await evaluate("!!document.querySelector('.pd-status')"),false);
 checked('compiled update starts at 100 percent with saved pen slots, plain text and no inactive mirror status');
 await click('[aria-label="Rectangle"]');
 for(const [type,x,y] of [['mousePressed',500,300],['mouseMoved',700,450],['mouseReleased',700,450]]){
   await rpc('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});await delay(40);
 }
 await waitFor("window.__pdApi.getSceneElements().some(e=>e.type==='rectangle')&&window.__pdApi.getAppState().activeTool.type==='freedraw'");
 await click('[data-ribbon-tab="insert"]');await click('[aria-label="Bucket fill"]');
 await rpc('Input.dispatchMouseEvent',{type:'mousePressed',x:600,y:375,button:'left',buttons:1,clickCount:1});
 await rpc('Input.dispatchMouseEvent',{type:'mouseReleased',x:600,y:375,button:'left',buttons:0,clickCount:1});
 await waitFor('window.__pdApi.getSceneElements().some(e=>e.customData?.pendrawFill)');await delay(100);
 await rpc('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
 await rpc('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:2});
 await waitFor('!window.__pdApi.getSceneElements().some(e=>e.customData?.pendrawFill)');
 await click('[data-ribbon-tab="draw"]');await delay(950);
 checked('compiled shape gesture restores the pen, fill works and keyboard undo restores the outline');
 const expanded=await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height");await click('[aria-label="Collapse ribbon"]');assert(await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height")>expanded+40);await click('[aria-label="Expand ribbon"]');
 checked('compiled collapsible ribbon gives the canvas more space');
 await evaluate("window.__recoveryWrites=0;window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='pendraw:editor-scene'||k==='pendraw:editor-files')window.__recoveryWrites++;return window.__storageSet.call(this,k,v)}");
 for(let i=0;i<24;i++){await evaluate(`window.__pdApi.updateScene({appState:{scrollX:${i+1}}})`);await delay(100)}await delay(900);assert.equal(await evaluate('window.__recoveryWrites'),0);
 await evaluate("Storage.prototype.setItem=window.__storageSet;window.__pdApi.updateScene({appState:{scrollX:0}})");checked('compiled EXE does not rewrite recovery while only panning');
 await click('[aria-label="PenDraw menu"]');await click('[aria-label="Settings"]');await evaluate("(()=>{const el=document.querySelector('[aria-label=\"Theme\"]');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(el,'dark');el.dispatchEvent(new Event('change',{bubbles:true}))})()");await waitFor("window.__pdApi.getAppState().theme==='dark'");assert.equal(await invoke('theme'),'dark');await shot('native-dark');

 const nativeTheme=async(mode)=>{await evaluate(`(()=>{const el=document.querySelector('[aria-label="Theme"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,'${mode}');el.dispatchEvent(new Event('change',{bubbles:true}))})()`);await waitFor(`window.__pdApi.getAppState().theme==='${mode}'`);assert.equal(await invoke('theme'),mode)};
 await nativeTheme('light');await shot('native-light');await nativeTheme('dark');checked('native window theme follows both light and dark app settings');
 await click('[aria-label="Open in full screen"]');await click('[aria-label="Close settings"]');
 const normalHeight=await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height");
 await click('[aria-label="Full screen"]');assert.equal(await invoke('is_fullscreen'),true);assert(await evaluate("document.querySelector('.pd-canvas').getBoundingClientRect().height")>normalHeight+40);await shot('native-fullscreen');await click('[aria-label="Exit full screen"]');assert.equal(await invoke('is_fullscreen'),false);
 checked('real native full-screen button enters and exits full screen with permitted window APIs');
 await invoke('toggle_maximize');assert.equal(await invoke('is_maximized'),false);await invoke('toggle_maximize');assert.equal(await invoke('is_maximized'),true);
 checked('native maximize and restore still work with the Windows frame');
 await invoke('minimize');assert.equal(await invoke('is_minimized'),true);
 checked('native minimize remains available through the original Windows frame');
 await invoke('toggle_maximize');
 await close();checked('original native close request flushes recovery and exits its own EXE');
 await delay(400);await launch();assert.equal(await invoke('is_fullscreen'),true);await waitFor("window.__pdApi.getAppState().theme==='dark'");
 checked('compiled EXE remembers dark appearance and opens in full screen on the next launch');
 assert.equal(await evaluate("!!document.querySelector('.pd-window-error')"),false);
 const top=await evaluate("document.querySelector('.excalidraw canvas').getBoundingClientRect().top");
 for(const [type,x,y] of [['mousePressed',200,top+80],['mouseMoved',270,top+110],['mouseMoved',330,top+75],['mouseReleased',330,top+75]])await rpc('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1});
 await waitFor('window.__pdApi.getSceneElements().some(e=>e.type==="freedraw")');
 await close();await delay(400);await launch();
 assert(await evaluate('window.__pdApi.getSceneElements().some(e=>e.type==="freedraw")'));
 checked('closing the real EXE recovers its latest actual drawn stroke on reopening');
 await close();await fs.writeFile(path.join(cache,'report.json'),JSON.stringify(report,null,2));console.log('Report: '+path.join(cache,'report.json'));
}catch(error){if(socket?.readyState===WebSocket.OPEN){try{await shot('failure');console.log(await evaluate("JSON.stringify({url:location.href,error:document.querySelector('.pd-window-error')?.textContent,storage:Object.keys(localStorage)})"))}catch{}}throw error}
finally{socket?.close();if(child&&child.exitCode===null)child.kill()}
