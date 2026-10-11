import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {isDesktopApp} from '../handwriting/recognize';
import terms from './WEBVIEW2-LICENSE.txt?raw';
const KEY='pendraw:webview2-terms:1';
// Applies only to the portable package's bundled proprietary Microsoft runtime.
export default function RuntimeTerms({children}:{children:ReactNode}){
  const [state,setState]=useState<'checking'|'accept'|'ready'>(()=>isDesktopApp()?'checking':'ready');
  const [error,setError]=useState('');
  useEffect(()=>{if(!isDesktopApp())return;let active=true;
    void invoke<boolean>('bundled_runtime').then(bundled=>{let accepted=false;try{accepted=localStorage.getItem(KEY)==='accepted'}catch{}if(active)setState(bundled&&!accepted?'accept':'ready')}).catch(()=>{if(active)setState('ready')});
    return()=>{active=false};
  },[]);
  if(state==='ready')return children;
  if(state==='checking')return <p>Opening PenDraw…</p>;
  return <div className="pd-modal-shade"><section className="pd-dialog" role="dialog" aria-modal="true" aria-label="Bundled browser terms" style={{maxWidth:760}}>
    <h2>Welcome to PenDraw</h2>
    <p>PenDraw is free and its source is MIT licensed. This complete Windows download also includes Microsoft WebView2, so you do not need a separate installation.</p>
    <p>The included browser engine uses Microsoft's terms below. It includes Microsoft Defender SmartScreen and collects and sends user information to Microsoft as described in the <a href="https://aka.ms/privacy" target="_blank" rel="noreferrer">Microsoft privacy statement</a> and <a href="https://learn.microsoft.com/en-us/microsoft-edge/privacy-whitepaper#smartscreen" target="_blank" rel="noreferrer">SmartScreen privacy explanation</a>.</p>
    <pre tabIndex={0} aria-label="Microsoft WebView2 license terms" style={{whiteSpace:'pre-wrap',maxHeight:'40vh',overflow:'auto',fontFamily:'inherit',fontSize:13,border:'1px solid #888',padding:12}}>{terms}</pre>
    <p>By selecting Agree and open, you accept these terms for the included Microsoft runtime. They do not replace PenDraw's MIT license.</p>
    {error&&<p role="alert">{error}</p>}
    <button className="pd-btn" onClick={()=>{try{localStorage.setItem(KEY,'accepted')}catch{}setState('ready')}}>Agree and open</button>
    <button className="pd-btn ghost" onClick={()=>void invoke('plugin:window|close',{label:'main'}).catch(e=>setError(String(e)))}>Decline and close</button>
  </section></div>;
}
