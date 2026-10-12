// Real compiled app + real browser + built-in Rust relay. Creates only synthetic
// demo content, isolated profiles and screenshots. No Node sharing server.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
const root=process.cwd(), cache=path.join(root,'.cache/showcase'), out=path.join(root,'docs/images');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const profiles=path.join(cache,String(Date.now()));
const exe=process.env.PENDRAW_EXE;
assert(exe,'Set PENDRAW_EXE to the complete portable release executable');
const report=[];
function check(name){report.push(name);console.log('PASS '+name)}
async function connect(url){
 const ws=new WebSocket(url);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let n=0;const pending=new Map();
 ws.on('message',raw=>{const msg=JSON.parse(raw),p=pending.get(msg.id);if(!p)return;pending.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result)});
 const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++n,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))});
 const evalJS=async expression=>{const r=await rpc('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value};
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evalJS(expression))return;await delay(100)}throw Error('Condition '+expression)};
 const click=async label=>{await evalJS(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.getAttribute('aria-label')===${JSON.stringify(label)});if(!b)throw Error('Button missing');b.click()})()`);await delay(150)};
 const shot=async name=>{await delay(500);const r=await rpc('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))};
 await rpc('Runtime.enable');await rpc('Page.enable');
 return {ws,rpc,evalJS,wait,click,shot};
}
async function debugPage(port,fragment){for(let i=0;i<200;i++){try{const list=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const page=list.find(p=>p.type==='page'&&p.url.includes(fragment));if(page)return page}catch{}await delay(100)}throw Error('Debug page unavailable')}
async function reserve(){const server=http.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port}
let native,browser,editor,mirror;
try{
 await fs.mkdir(profiles,{recursive:true});await fs.mkdir(out,{recursive:true});
 const port=await reserve();
 native=spawn(exe,[],{windowsHide:true,stdio:'ignore',env:{...process.env,WEBVIEW2_USER_DATA_FOLDER:path.join(profiles,'native'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 --remote-allow-origins=http://127.0.0.1:${port}`}});
 editor=await connect((await debugPage(port,'tauri.localhost')).webSocketDebuggerUrl);
 await editor.wait(`!!window.__pdApi||!!document.querySelector('[aria-label="Bundled browser terms"]')`);
 if(await editor.evalJS(`!!document.querySelector('[aria-label="Bundled browser terms"]')`)){await editor.click('Agree and open');check('complete portable package presents bundled runtime terms once');}
 await editor.rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false});
 await editor.wait('!!window.__pdApi');
 assert.equal(await editor.evalJS('!!document.querySelector(".pd-status")'),false);
 check('sharing starts off in the real executable');
 let seq=0;const elements=[];
 const base=(type,x,y,width,height,extra={})=>({id:'demo-'+(++seq),type,x,y,width,height,angle:0,strokeColor:'#243550',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:2,strokeStyle:'solid',roughness:1,opacity:100,groupIds:[],frameId:null,roundness:null,seed:100+seq,version:1,versionNonce:1000+seq,isDeleted:false,boundElements:null,updated:1,link:null,locked:false,index:'a'+'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[seq-1],...extra});
 const text=(str,x,y,size=24,color='#243550')=>elements.push(base('text',x,y,str.length*size*.55,size*1.3,{text:str,originalText:str,fontSize:size,fontFamily:2,textAlign:'left',verticalAlign:'top',containerId:null,autoResize:true,lineHeight:1.25,strokeColor:color}));
 const box=(label,x,color)=>{elements.push(base('rectangle',x,235,250,130,{backgroundColor:color,roundness:{type:3}}));text(label,x+28,275,28)};
 text('One board. Two devices.',105,100,42,'#2563eb');text('Sketch a plan, explain it, and share it live.',108,163,23,'#5f6b7b');
 box('1  Sketch',105,'#dbeafe');box('2  Discuss',505,'#fff2cc');box('3  Refine',905,'#d3f9d8');
 for(const x of [380,780])elements.push(base('arrow',x,300,105,0,{points:[[0,0],[105,0]],startBinding:null,endBinding:null,startArrowhead:null,endArrowhead:'arrow',elbowed:false}));
 text('Pens + shapes + text',110,398,22);text('Live browser mirror',510,398,22);text('Save your drawing',910,398,22);
 elements.push(base('freedraw',110,485,420,65,{strokeColor:'#2563eb',strokeWidth:3,points:[[0,35],[25,15],[50,30],[90,0],[120,55],[160,20],[190,35],[225,5],[270,45],[305,18],[355,32],[420,15]],pressures:[],simulatePressure:true,lastCommittedPoint:null}));
 text('Ideas start as ink.',115,580,26,'#2563eb');
 elements.push(base('rectangle',725,480,430,145,{backgroundColor:'#f1f3f5',roundness:{type:3}}));text('Same Wi-Fi • no account',750,508,24);text('Keep the Windows app open',750,554,20,'#5f6b7b');
 await editor.evalJS(`window.__pdApi.updateScene({elements:${JSON.stringify(elements)},appState:{scrollX:0,scrollY:0,zoom:{value:1}}})`);
 await editor.click('PenDraw menu');await editor.click('Settings');await editor.shot('settings-sharing');await editor.click('Start sharing');
 await editor.wait(`!!document.querySelector('[aria-label="Sharing link"]')&&document.querySelector('.pd-status')?.dataset.status==='connected'`);
 const info=await editor.evalJS('window.__TAURI_INTERNALS__.invoke("start_mirror")');
 const socketURL=new URL(info.socketUrl), key=socketURL.searchParams.get('key');
 const bookmark=`http://127.0.0.1:4000/?mirror&key=${key}`;
 assert.equal((await fetch('http://127.0.0.1:4000/')).status,403);
 assert.equal((await fetch('http://127.0.0.1:4000/?mirror&key=wrong')).status,403);
 const response=await fetch(bookmark);assert.equal(response.status,200);assert(new URL(response.url).searchParams.has('session'));
 check('built-in host serves its embedded app, rejects missing/wrong access keys and resolves a stable bookmark');
 await editor.click('Close settings');
 const browserProfile=path.join(profiles,'browser');
 browser=spawn(process.env.PENDRAW_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${browserProfile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let browserPort;for(let i=0;i<150;i++){try{browserPort=Number((await fs.readFile(path.join(browserProfile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(100)}}assert(browserPort);
 mirror=await connect((await debugPage(browserPort,'about:blank')).webSocketDebuggerUrl);
 await mirror.rpc('Emulation.setDeviceMetricsOverride',{width:1280,height:820,deviceScaleFactor:1,mobile:false});
 await mirror.rpc('Page.navigate',{url:bookmark});await mirror.wait('!!window.__pdApi&&window.__pdApi.getSceneElements().length>=17');
 assert.equal(await mirror.evalJS('document.querySelector(".pd-status").textContent'),'connected');
 check('browser mirror loads the existing desktop drawing without a Node server');
 await mirror.rpc('Network.enable');await mirror.rpc('Network.setBlockedURLs',{urls:['https://*']});
 const font=await fetch('http://127.0.0.1:4000/fonts/Cascadia/CascadiaCode-Regular.woff2');assert.equal(font.status,200);assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0,4).toString(),'wOF2');
 assert.equal(await mirror.evalJS(`new FontFace('PenDrawOfflineTest','url(/fonts/Cascadia/CascadiaCode-Regular.woff2)').load().then(f=>f.status)`),'loaded');
 check('bundled font is served and decoded locally with external HTTPS requests blocked');
 await editor.shot('windows-board');await mirror.shot('browser-mirror');
 // Real bidirectional edits and presenter following.
 await delay(1700);const note=base('text',108,665,600,32,{text:'Added from the browser — visible on Windows too',originalText:'Added from the browser — visible on Windows too',fontSize:24,fontFamily:2,textAlign:'left',verticalAlign:'top',containerId:null,autoResize:true,lineHeight:1.25,strokeColor:'#2b8a3e'});
 await mirror.evalJS(`window.__pdApi.updateScene({elements:[...window.__pdApi.getSceneElements(),${JSON.stringify(note)}]})`);
 await editor.wait(`window.__pdApi.getSceneElements().some(e=>e.id===${JSON.stringify(note.id)})`);
 await mirror.wait('!document.querySelector(".pd-switch input").checked');
 check('browser edit reaches Windows and switches the mirror to free look');
 await mirror.shot('mirror-contribution');
 await mirror.evalJS('document.querySelector(".pd-switch input").click()');
 await editor.evalJS('window.__pdApi.updateScene({appState:{scrollX:40,scrollY:30,zoom:{value:.9}}})');
 await mirror.wait('Math.abs(window.__pdApi.getAppState().zoom.value-.9)<.001');check('locked mirror follows the desktop viewport');
 await editor.evalJS('window.__pdApi.updateScene({appState:{scrollX:0,scrollY:0,zoom:{value:1}}})');
 // Deletions reach both pages and late joiners.
 await mirror.evalJS(`window.__pdApi.updateScene({elements:window.__pdApi.getSceneElementsIncludingDeleted().map(e=>e.id===${JSON.stringify(note.id)}?{...e,isDeleted:true,version:e.version+1,versionNonce:e.versionNonce+1}:e)})`);
 await editor.wait(`!window.__pdApi.getSceneElements().some(e=>e.id===${JSON.stringify(note.id)})`);check('browser deletion reaches the host');
 const oldSession=socketURL.searchParams.get('session');
 await editor.click('PenDraw menu');await editor.click('Settings');await editor.click('Stop sharing');
 await delay(300);await assert.rejects(()=>fetch(bookmark));check('Stop sharing closes the HTTP listener');
 await editor.click('Start sharing');await editor.wait(`!!document.querySelector('[aria-label="Sharing link"]')`);
 const next=await editor.evalJS('window.__TAURI_INTERNALS__.invoke("start_mirror")');
 assert.equal(new URL(next.socketUrl).searchParams.get('key'),key);assert.notEqual(new URL(next.socketUrl).searchParams.get('session'),oldSession);
 const fresh=await fetch(bookmark);assert.equal(fresh.status,200);assert.notEqual(new URL(fresh.url).searchParams.get('session'),oldSession);
 const rejected=await new Promise(resolve=>{const peer=new WebSocket(info.socketUrl);peer.on('unexpected-response',(_,r)=>{r.resume();resolve(r.statusCode)});peer.on('error',()=>{});peer.on('open',()=>{peer.close();resolve(101)})});assert.equal(rejected,403);
 check('restarted sharing preserves bookmarks, changes session and rejects old sockets');
 await mirror.rpc('Page.reload');await mirror.wait('!!window.__pdApi&&document.querySelector(".pd-status")?.textContent==="connected"');
 await mirror.wait(`!window.__pdApi.getSceneElements().some(e=>e.id===${JSON.stringify(note.id)})`);check('refresh joins the new session without injecting old cached content');
 await editor.click('Stop sharing');await editor.click('Close settings');
 await editor.evalJS('window.__TAURI_INTERNALS__.invoke("plugin:window|close",{label:"main"})');
 await fs.writeFile(path.join(cache,'report.json'),JSON.stringify({checks:report,limitations:'Local Windows and browser tests. Physical phone, tablet, firewall policy and pen behavior need device acceptance.'},null,2));
}finally{editor?.ws.close();mirror?.ws.close();if(native?.exitCode===null)native.kill();if(browser?.exitCode===null)browser.kill()}
