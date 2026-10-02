// Every app command is listed so it gets its own permission. Windows only get the commands their
// capability grants: the main window gets the app's commands, the ACORN window only `acorn_capture`.
const COMMANDS: &[&str] = &[
    "session", "api_get", "prefetch", "mcp_info", "clear_cache", "set_token", "logout", "login_sso",
    "open_url", "download_file", "file_bytes", "prefetch_files", "open_path", "reveal_path",
    "notify_prefs", "set_notify_prefs", "notify_test", "save_calendar",
    "acorn_open", "acorn_sync", "acorn_data", "acorn_capture", "acorn_sync_done",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
