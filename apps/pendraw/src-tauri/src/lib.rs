mod files;
mod handwriting;
mod mirror;

#[tauri::command]
fn bundled_runtime() -> bool { std::env::var_os("PENDRAW_BUNDLED_RUNTIME").is_some() }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // The portable release carries its own browser engine beside the executable.
  #[cfg(windows)]
  if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() {
      let runtime = parent.join("WebView2");
      if runtime.join("msedgewebview2.exe").is_file() {
        use std::os::windows::process::CommandExt;
        // Microsoft requires these read/execute permissions for unpackaged
        // fixed runtimes on Windows 10. This changes only our bundled folder.
        for sid in ["*S-1-15-2-2:(OI)(CI)(RX)", "*S-1-15-2-1:(OI)(CI)(RX)"] {
          let _ = std::process::Command::new("icacls.exe").arg(&runtime)
            .args(["/grant", sid]).creation_flags(0x08000000).output();
        }
        std::env::set_var("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER", runtime);
        std::env::set_var("PENDRAW_BUNDLED_RUNTIME", "1");
      }
    }
  }
  tauri::Builder::default()
    .manage(mirror::MirrorHost::default())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      handwriting::recognize_handwriting,
      files::read_text_file,
      files::write_text_file,
      mirror::start_mirror,
      mirror::stop_mirror,
      bundled_runtime
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
