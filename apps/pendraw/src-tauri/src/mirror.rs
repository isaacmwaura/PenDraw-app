use axum::{extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State}, http::{header, StatusCode, Uri}, response::{IntoResponse, Response, Redirect}, routing::get, Router};
use futures_util::{SinkExt, StreamExt};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::{Arc, Mutex}};
use tauri::Manager;
use tokio::sync::mpsc;

#[derive(Embed)]
#[folder = "../dist/"]
struct Assets;

#[derive(Default)]
struct Hub { elements: HashMap<String, Value>, files: serde_json::Map<String, Value>, viewport: Value, peers: HashMap<String, mpsc::Sender<String>> }
impl Hub {
  fn snapshot(&self) -> String { json!({"type":"scene","role":"server","elements":self.elements.values().collect::<Vec<_>>(),"files":self.files,"viewport":self.viewport}).to_string() }
  fn merge(&mut self, raw: &str) -> bool {
    let Ok(msg) = serde_json::from_str::<Value>(raw) else { return false };
    if msg["type"] != "scene" { return false; }
    if let Some(elements) = msg["elements"].as_array() {
      if elements.len() > 50_000 { return false; }
      for el in elements {
        let Some(id) = el["id"].as_str() else { continue };
        let newer = self.elements.get(id).map(|cur| (el["version"].as_u64().unwrap_or(0),el["versionNonce"].as_u64().unwrap_or(0)) > (cur["version"].as_u64().unwrap_or(0),cur["versionNonce"].as_u64().unwrap_or(0))).unwrap_or(true);
        if newer { self.elements.insert(id.to_owned(),el.clone()); }
      }
    }
    if let Some(files) = msg["files"].as_object() { self.files.extend(files.clone()); }
    if msg["role"] == "editor" && !msg["viewport"].is_null() { self.viewport = msg["viewport"].clone(); }
    true
  }
}
#[derive(Clone)]
struct Server { key: String, session: String, hub: Arc<Mutex<Hub>> }
#[derive(Default, Deserialize)]
struct Access { key: Option<String>, session: Option<String> }
#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct SharingInfo { pub links: Vec<String>, pub socket_url: String }
struct Running { task: tokio::task::JoinHandle<()>, info: SharingInfo, hub: Arc<Mutex<Hub>> }
#[derive(Default)]
pub struct MirrorHost(Mutex<Option<Running>>);

async fn index(State(server): State<Server>, Query(access): Query<Access>) -> Response {
  if access.key.as_deref() != Some(&server.key) { return (StatusCode::FORBIDDEN,"Open the sharing link shown inside PenDraw.").into_response(); }
  if access.session.as_deref() != Some(&server.session) { return Redirect::temporary(&format!("/?mirror&key={}&session={}",server.key,server.session)).into_response(); }
  asset("index.html")
}
fn asset(path: &str) -> Response {
  match Assets::get(path) {
    Some(file) => ([(header::CONTENT_TYPE,mime_guess::from_path(path).first_or_octet_stream().to_string()),(header::CACHE_CONTROL,"no-cache".into())],file.data.into_owned()).into_response(),
    None => StatusCode::NOT_FOUND.into_response(),
  }
}
async fn static_asset(uri: Uri) -> Response { asset(uri.path().trim_start_matches('/')) }
async fn upgrade(State(server): State<Server>, Query(access): Query<Access>, ws: WebSocketUpgrade) -> Response {
  if access.key.as_deref()!=Some(&server.key) || access.session.as_deref()!=Some(&server.session) { return StatusCode::FORBIDDEN.into_response(); }
  ws.max_message_size(32*1024*1024).max_frame_size(32*1024*1024).on_upgrade(move |socket| peer(socket,server))
}
async fn peer(socket: WebSocket, server: Server) {
  let id=uuid::Uuid::new_v4().to_string();
  let (tx,mut rx)=mpsc::channel::<String>(8);
  { let mut hub=server.hub.lock().unwrap(); tx.try_send(hub.snapshot()).ok(); hub.peers.insert(id.clone(),tx); }
  let (mut sink,mut source)=socket.split();
  loop {
    tokio::select! {
      raw=rx.recv()=>{let Some(raw)=raw else{break};if sink.send(Message::Text(raw.into())).await.is_err(){break}},
      incoming=source.next()=>{
        match incoming {
          Some(Ok(Message::Text(raw)))=>{
            let raw=raw.to_string();
            if serde_json::from_str::<Value>(&raw).ok().map(|v|v["type"]=="ping").unwrap_or(false) { if sink.send(Message::Text("{\"type\":\"pong\"}".into())).await.is_err(){break}; continue; }
            let mut hub=server.hub.lock().unwrap();
            if hub.merge(&raw) { hub.peers.retain(|other,tx| other==&id || tx.try_send(raw.clone()).is_ok()); }
          },
          Some(Ok(Message::Close(_)))|Some(Err(_))|None=>break,
          _=>{}
        }
      }
    }
  }
  server.hub.lock().unwrap().peers.remove(&id);
}
#[tauri::command]
pub async fn start_mirror(app: tauri::AppHandle, host: tauri::State<'_,MirrorHost>) -> Result<SharingInfo,String> {
  let mut running=host.0.lock().map_err(|_|"Sharing state unavailable")?;
  if let Some(existing)=running.as_ref(){return Ok(existing.info.clone())}
  let config=app.path().app_config_dir().map_err(|e|e.to_string())?;
  std::fs::create_dir_all(&config).map_err(|e|e.to_string())?;
  let key_path=config.join("sharing-key.txt");
  let key=std::fs::read_to_string(&key_path).ok().filter(|k|uuid::Uuid::parse_str(k).is_ok()).unwrap_or_else(||uuid::Uuid::new_v4().to_string());
  std::fs::write(&key_path,&key).map_err(|e|e.to_string())?;
  let listener=std::net::TcpListener::bind(("0.0.0.0",4000)).map_err(|_|"Port 4000 is already in use. Close another PenDraw sharing host and try again.".to_string())?;
  listener.set_nonblocking(true).map_err(|e|e.to_string())?;
  let listener=tokio::net::TcpListener::from_std(listener).map_err(|e|e.to_string())?;
  let session=uuid::Uuid::new_v4().to_string();
  let mut links=Vec::new();
  if let Ok(ip)=local_ip_address::local_ip(){ links.push(format!("http://{ip}:4000/?mirror&key={key}")); }
  let computer=std::env::var("COMPUTERNAME").unwrap_or_default();
  if !computer.is_empty(){links.push(format!("http://{computer}:4000/?mirror&key={key}"));}
  if links.is_empty(){links.push(format!("http://127.0.0.1:4000/?mirror&key={key}"));}
  let info=SharingInfo{links,socket_url:format!("ws://127.0.0.1:4000/ws?key={key}&session={session}")};
  let hub=Arc::new(Mutex::new(Hub::default()));
  let router=Router::new().route("/",get(index)).route("/ws",get(upgrade)).fallback(get(static_asset)).with_state(Server{key,session,hub:hub.clone()});
  let task=tokio::spawn(async move{axum::serve(listener,router).await.ok();});
  *running=Some(Running{task,info:info.clone(),hub});
  Ok(info)
}
#[tauri::command]
pub fn stop_mirror(host: tauri::State<'_,MirrorHost>) -> Result<(),String> {
  if let Some(running)=host.0.lock().map_err(|_|"Sharing state unavailable")?.take(){running.task.abort();running.hub.lock().unwrap().peers.clear();}
  Ok(())
}
#[cfg(test)]
mod tests {
  use super::*;
  #[test] fn merged_snapshot_preserves_newer_edits_and_deletions(){let mut hub=Hub::default(); assert!(hub.merge(r#"{"type":"scene","elements":[{"id":"a","version":2,"versionNonce":3,"isDeleted":true}]}"#)); hub.merge(r#"{"type":"scene","elements":[{"id":"a","version":1,"versionNonce":9}]}"#); let snap:Value=serde_json::from_str(&hub.snapshot()).unwrap(); assert_eq!(snap["elements"][0]["isDeleted"],true);}
  #[test] fn image_and_viewport_snapshot_is_available_to_late_joiners(){let mut hub=Hub::default(); hub.merge(r#"{"type":"scene","role":"editor","elements":[],"files":{"img":{"id":"img"}},"viewport":{"zoom":2}}"#); let snap:Value=serde_json::from_str(&hub.snapshot()).unwrap();assert_eq!(snap["files"]["img"]["id"],"img");assert_eq!(snap["viewport"]["zoom"],2);}
}
