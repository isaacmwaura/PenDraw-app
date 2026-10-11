// Write beside the destination, flush, then replace it. A failed write must
// leave the last saved drawing intact. Picker authorization remains in the UI.
use std::{fs, io::Write, path::Path, sync::atomic::{AtomicU64, Ordering}};
static NEXT: AtomicU64 = AtomicU64::new(0);
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}
#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{core::PCWSTR, Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH}};
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe { MoveFileExW(PCWSTR(from.as_ptr()), PCWSTR(to.as_ptr()), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) }
        .map_err(|e| std::io::Error::other(e.to_string()))
}
#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> { fs::rename(from, to) }
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let destination = Path::new(&path);
    let parent = destination.parent().filter(|p| !p.as_os_str().is_empty()).unwrap_or(Path::new("."));
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = destination.file_name().ok_or("Missing file name")?.to_string_lossy();
    let temp = parent.join(format!(".{}.{}.{}.tmp", name, std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        replace(&temp, destination)
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result.map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn folder() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("pendraw-save-{}-{}",std::process::id(),NEXT.fetch_add(1,Ordering::Relaxed)));
        fs::create_dir_all(&p).unwrap();p
    }
    #[test]
    fn unicode_save_overwrite_roundtrip_and_no_leftovers() {
        let dir=folder();let p=dir.join("drawing.excalidraw").to_string_lossy().into_owned();
        write_text_file(p.clone(), "previous".into()).unwrap();
        let text="{\"words\":\"naïve 日本語 🖊\"}";
        write_text_file(p.clone(),text.into()).unwrap();
        assert_eq!(read_text_file(p).unwrap(),text);
        assert_eq!(fs::read_dir(&dir).unwrap().count(),1);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_replace_preserves_existing_destination_and_cleans_temp() {
        let dir=folder();let destination=dir.join("folder");fs::create_dir(&destination).unwrap();
        fs::write(destination.join("sentinel"),"keep").unwrap();
        assert!(write_text_file(destination.to_string_lossy().into_owned(),"bad".into()).is_err());
        assert_eq!(fs::read_to_string(destination.join("sentinel")).unwrap(),"keep");
        assert_eq!(fs::read_dir(&dir).unwrap().count(),1);
        assert!(read_text_file(dir.join("missing").to_string_lossy().into_owned()).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
}
