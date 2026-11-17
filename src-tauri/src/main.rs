#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let query = boot_query(&args);

    tauri::Builder::default()
        .setup(move |app| {
            if query.is_empty() {
                return Ok(());
            }
            if let Some(window) = tauri::Manager::get_webview_window(app, "main") {
                if let Ok(mut url) = window.url() {
                    url.set_query(Some(&query));
                    window.navigate(url)?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running PDF Master");
}
