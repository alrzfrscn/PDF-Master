#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

/// A `.pdf` handed to the app by Windows Explorer, read once and consumed by the frontend.
#[derive(Clone, serde::Serialize)]
struct StartupPdf {
    name: String,
    base64: String,
}

static STARTUP_PDF: Mutex<Option<StartupPdf>> = Mutex::new(None);

/// Percent-encodes a value for the boot query; spaces become `+` so a paper name
/// such as `A4 Landscape` survives the trip into the webview.
fn encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (byte as char).to_string(),
            b' ' => "+".to_string(),
            other => format!("%{other:02X}"),
        })
        .collect()
}

/// Maps `--new "A4 Landscape" --fullscreen --print` onto the same query contract
/// the browser build reads (`?new=A4+Landscape&fullscreen=1&print=1`).
fn boot_query(args: &[String]) -> String {
    let mut query: Vec<String> = Vec::new();
    let mut index = 0;
    while index < args.len() {
        let trimmed = args[index].trim_start_matches('-');
        let (name, inline) = match trimmed.split_once(['=', ':']) {
            Some((name, value)) => (name, Some(value.to_string())),
            None => (trimmed, None),
        };
        match name.to_lowercase().as_str() {
            "new" => {
                let value = match inline {
                    Some(value) => Some(value),
                    None if index + 1 < args.len() => {
                        index += 1;
                        Some(args[index].clone())
                    }
                    None => None,
                };
                if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
                    query.push(format!("new={}", encode(value.trim())));
                }
            }
            "fullscreen" | "print" => {
                let on = inline.map(|value| value != "0").unwrap_or(true);
                if on {
                    query.push(format!("{name}=1"));
                }
            }
            _ => {}
        }
        index += 1;
    }
    query.join("&")
}

/// Standard base64 so the frontend can rebuild the bytes with `atob`.
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);
        let value = ((chunk[0] as u32) << 16) | ((second as u32) << 8) | third as u32;
        out.push(TABLE[((value >> 18) & 63) as usize] as char);
        out.push(TABLE[((value >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((value >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(value & 63) as usize] as char } else { '=' });
    }
    out
}

/// The first positional argument that names an existing PDF file.
fn find_startup_pdf(args: &[String]) -> Option<StartupPdf> {
    let path = args
        .iter()
        .find(|arg| arg.to_lowercase().ends_with(".pdf") && std::path::Path::new(arg).is_file())?;
    let bytes = std::fs::read(path).ok()?;
    let name = std::path::Path::new(path).file_name()?.to_string_lossy().to_string();
    Some(StartupPdf {
        name,
        base64: base64_encode(&bytes),
    })
}

/// Hands the file to the first window that asks; later calls see nothing.
#[tauri::command]
fn get_startup_pdf() -> Option<StartupPdf> {
    STARTUP_PDF.lock().ok().and_then(|mut slot| slot.take())
}

/// The boot query is read by the frontend once it mounts. Navigating the window
/// from `setup` instead would race the first load and can leave it blank.
#[tauri::command]
fn get_boot_query() -> String {
    boot_query(&std::env::args().skip(1).collect::<Vec<_>>())
}

/// Last-resort recovery for a stuck WebView2 profile: the boot guard calls this
/// before reloading so a stale HTTP cache or service worker cannot survive.
#[tauri::command]
fn clear_webview_cache(window: tauri::WebviewWindow) -> Result<(), String> {
    window.clear_all_browsing_data().map_err(|error| error.to_string())
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Ok(mut slot) = STARTUP_PDF.lock() {
        *slot = find_startup_pdf(&args);
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_startup_pdf,
            get_boot_query,
            clear_webview_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running PDF Master");
}
