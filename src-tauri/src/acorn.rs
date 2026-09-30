//! ACORN and Degree Explorer (U of T's student systems).
//!
//! Neither has a public API. Their own web pages load JSON from internal read-only routes
//! (documented by the community: github.com/SleepyPandas/unofficial-UofT-api-registry). To sync, we
//! open each site in a hidden window, where UofT SSO signs in on its own, and run a fixed script that
//! GETs those routes from inside the page. The browser supplies the session; the app never handles
//! ACORN cookies. Results come back through `acorn_capture` and are stored under the app data dir.
//!
//! Only GET requests to a fixed list of routes are made. Nothing in ACORN is ever changed.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use url::Url;

const ACORN_HOME: &str = "https://acorn.utoronto.ca/sws/";
const DX_HOME: &str = "https://degreeexplorer.utoronto.ca/degreeExplorer/";
const ACORN_HOST: &str = "acorn.utoronto.ca";
const DX_HOST: &str = "degreeexplorer.utoronto.ca";
const MAX_BODY: usize = 4 << 20;

/// Runs inside the hidden ACORN window once ACORN has loaded (i.e. SSO succeeded).
const SYNC_ACORN_JS: &str = r#"
(async () => {
  const T = window.__TAURI_INTERNALS__;
  const put = (key, r) => T.invoke("acorn_capture", { key, url: r.url, status: r.status, body: r.text });
  const done = (ok, note) => T.invoke("acorn_sync_done", { source: "acorn", ok, note });
  const xsrf = (document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/) || [])[1];
  const headers = { Accept: "application/json" };
  if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf);
  const get = async (path) => {
    const r = await fetch("/sws/rest" + path, { credentials: "include", headers });
    const text = await r.text();
    if (new URL(r.url).host !== location.host) throw new Error("signin");
    if (!(r.headers.get("content-type") || "").includes("json")) throw new Error(r.ok ? "signin" : "http-" + r.status);
    return { url: r.url, status: r.status, text, json: JSON.parse(text) };
  };
  const soft = async (key, path) => {
    try { await put(key, await get(path)); } catch (e) { if (e.message === "signin") throw e; }
  };
  const FIELDS = ["postCode","postDescription","sessionCode","sessionDescription","status","assocOrgCode","acpDuration",
    "levelOfInstruction","typeOfProgram","designationCode1","primaryOrgCode","secondaryOrgCode","collaborativeOrgCode",
    "adminOrgCode","coSecondaryOrgCode","yearOfStudy","postAcpDuration"];
  try {
    const regs = await get("/enrolment/eligible-registrations");
    await put("registrations", regs);
    for (const reg of Array.isArray(regs.json) ? regs.json : []) {
      const p = reg.registrationParams || {};
      if (!p.sessionCode) continue;
      const q = new URLSearchParams();
      for (const f of FIELDS) if (p[f] != null) q.set(f, String(p[f]));
      await soft("enrolled:" + String(p.sessionCode).replace(/[^A-Za-z0-9-]/g, ""), "/enrolment/course/enrolled-courses?" + q);
    }
    await soft("notifications", "/notification");
    await soft("profile", "/profile/studentRegistrationInfo");
    await done(true, "");
  } catch (e) {
    await done(false, String((e && e.message) || e));
  }
})();
"#;

/// Runs inside the hidden Degree Explorer window.
const SYNC_DX_JS: &str = r#"
(async () => {
  const T = window.__TAURI_INTERNALS__;
  try {
    const r = await fetch("/degreeExplorer/rest/dxStudent/getAcademicHistory", { credentials: "include", headers: { Accept: "application/json" } });
    const text = await r.text();
    if (new URL(r.url).host !== location.host || !(r.headers.get("content-type") || "").includes("json")) throw new Error(r.ok ? "signin" : "http-" + r.status);
    await T.invoke("acorn_capture", { key: "history", url: r.url, status: r.status, body: text });
    await T.invoke("acorn_sync_done", { source: "dx", ok: true, note: "" });
  } catch (e) {
    await T.invoke("acorn_sync_done", { source: "dx", ok: false, note: String((e && e.message) || e) });
  }
})();
"#;

pub struct Acorn {
    dir: PathBuf,
    busy: AtomicBool,
    interactive: AtomicBool,
    last: Mutex<(String, String)>, // (state, note)
}

#[derive(Clone, Serialize)]
struct SyncState {
    state: String,
    note: String,
}

impl Acorn {
    pub fn new(data_dir: PathBuf) -> Self {
        Acorn {
            dir: data_dir.join("acorn"),
            busy: AtomicBool::new(false),
            interactive: AtomicBool::new(false),
            last: Mutex::new(("idle".into(), String::new())),
        }
    }

    pub fn clear(&self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

/// Only these names may be written, so a page can't make us store anything else.
fn valid_key(k: &str) -> bool {
    matches!(k, "registrations" | "notifications" | "profile" | "history")
        || k.strip_prefix("enrolled:").is_some_and(|s| !s.is_empty() && s.len() <= 20 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
}

fn file_for(key: &str) -> String {
    format!("{}.json", key.replace(':', "_"))
}

fn set_state(app: &AppHandle, state: &str, note: &str) {
    let a = app.state::<Acorn>();
    *a.last.lock().unwrap() = (state.into(), note.into());
    let _ = app.emit("acorn-state", SyncState { state: state.into(), note: note.into() });
}

fn finish(app: &AppHandle, state: &str, note: &str) {
    for label in ["acorn-sync", "dx-sync"] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.close();
        }
    }
    app.state::<Acorn>().busy.store(false, Ordering::SeqCst);
    set_state(app, state, note);
    let _ = app.emit("acorn-updated", ());
}

/// Hidden window on `home`. When the site itself (not the UofT login pages) finishes loading, run `script`.
/// If sign-in needs the user, show the window when interactive; otherwise give up after a while.
fn open_sync_window(app: &AppHandle, label: &str, home: &str, host: &'static str, script: &'static str) -> Result<(), String> {
    let ran = std::sync::Arc::new(AtomicBool::new(false));
    let interactive = app.state::<Acorn>().interactive.load(Ordering::SeqCst);
    WebviewWindowBuilder::new(app, label, WebviewUrl::External(Url::parse(home).unwrap()))
        .title("Sign in to UofT")
        .inner_size(520.0, 760.0)
        .visible(false)
        .on_page_load(move |w, p| {
            if p.event() != PageLoadEvent::Finished {
                return;
            }
            let u = p.url();
            let on_site = u.host_str() == Some(host) && !u.path().starts_with("/Shibboleth.sso");
            if on_site {
                if !ran.swap(true, Ordering::SeqCst) {
                    let _ = w.hide();
                    let _ = w.eval(script);
                }
            } else if interactive {
                // UofT wants a password or Duo: let the user do it.
                let _ = w.show();
                let _ = w.set_focus();
            }
        })
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Refresh ACORN and Degree Explorer data. `interactive` shows the sign-in window if UofT asks for input.
///
/// Must stay `async`: synchronous commands run on the main thread, and creating a webview window from
/// there deadlocks on Windows (WebView2 needs that thread), freezing every other IPC call with it.
#[tauri::command]
pub async fn acorn_sync(app: AppHandle, interactive: bool) -> Result<(), String> {
    let a = app.state::<Acorn>();
    if a.busy.swap(true, Ordering::SeqCst) {
        if interactive {
            for label in ["acorn-sync", "dx-sync"] {
                if let Some(w) = app.get_webview_window(label) {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
        }
        return Ok(());
    }
    a.interactive.store(interactive, Ordering::SeqCst);
    set_state(&app, "syncing", "");
    if let Err(e) = open_sync_window(&app, "acorn-sync", ACORN_HOME, ACORN_HOST, SYNC_ACORN_JS) {
        finish(&app, "error", &e);
        return Err(e);
    }
    // Silent syncs that stall on a login page, or anything that hangs, end here.
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(if interactive { 300 } else { 45 })).await;
        let a = handle.state::<Acorn>();
        if a.busy.load(Ordering::SeqCst) {
            finish(&handle, if interactive { "error" } else { "needs-signin" }, "timeout");
        }
    });
    Ok(())
}

/// Called by the sync scripts only (capabilities/acorn.json).
#[tauri::command]
pub fn acorn_capture(window: WebviewWindow, state: tauri::State<'_, Acorn>, key: String, url: String, status: u16, body: String) -> Result<(), String> {
    let host = match window.label() {
        "acorn-sync" => ACORN_HOST,
        "dx-sync" => DX_HOST,
        _ => return Err("not allowed".into()),
    };
    let u = Url::parse(&url).map_err(|e| e.to_string())?;
    if u.host_str() != Some(host) || !valid_key(&key) || body.len() > MAX_BODY || !(200..300).contains(&status) {
        return Err("rejected".into());
    }
    let parsed: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&state.dir).map_err(|e| e.to_string())?;
    let b = serde_json::to_vec(&parsed).map_err(|e| e.to_string())?;
    crate::canvas::write_private(&state.dir.join(file_for(&key)), &b);
    Ok(())
}

/// `async` for the same reason as `acorn_sync`: it opens the Degree Explorer window.
#[tauri::command]
pub async fn acorn_sync_done(app: AppHandle, window: WebviewWindow, source: String, ok: bool, note: String) -> Result<(), String> {
    match (window.label(), source.as_str()) {
        ("acorn-sync", "acorn") => {
            if let Some(w) = app.get_webview_window("acorn-sync") {
                let _ = w.close();
            }
            if !ok {
                finish(&app, if note == "signin" { "needs-signin" } else { "error" }, &note);
                return Ok(());
            }
            // ACORN worked, so the SSO session is live: Degree Explorer should sign in on its own.
            if let Err(e) = open_sync_window(&app, "dx-sync", DX_HOME, DX_HOST, SYNC_DX_JS) {
                write_synced_at(&app);
                finish(&app, "idle", &format!("history: {e}"));
            }
        }
        ("dx-sync", "dx") => {
            write_synced_at(&app);
            // Academic history failing shouldn't hide a good timetable sync.
            finish(&app, "idle", if ok { "" } else { "history-failed" });
        }
        _ => return Err("not allowed".into()),
    }
    Ok(())
}

fn write_synced_at(app: &AppHandle) {
    let a = app.state::<Acorn>();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let _ = std::fs::create_dir_all(&a.dir);
    crate::canvas::write_private(&a.dir.join("synced_at"), now.to_string().as_bytes());
}

/// Everything synced so far, for the ACORN screens.
#[tauri::command]
pub fn acorn_data(state: tauri::State<'_, Acorn>) -> Value {
    load(&state.dir, &state.last.lock().unwrap())
}

pub(crate) fn load(dir: &std::path::Path, last: &(String, String)) -> Value {
    let read = |name: &str| -> Value {
        std::fs::read(dir.join(name)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or(Value::Null)
    };
    let mut enrolled = Map::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if let Some(session) = name.strip_prefix("enrolled_").and_then(|s| s.strip_suffix(".json")) {
                enrolled.insert(session.to_string(), read(&name));
            }
        }
    }
    let synced_at: Option<u64> = std::fs::read_to_string(dir.join("synced_at")).ok().and_then(|s| s.trim().parse().ok());
    serde_json::json!({
        "syncedAt": synced_at,
        "state": last.0,
        "note": last.1,
        "registrations": read("registrations.json"),
        "enrolled": enrolled,
        "notifications": read("notifications.json"),
        "profile": read("profile.json"),
        "history": read("history.json"),
    })
}

/// Open ACORN itself, for enrolment changes and anything the app doesn't show.
#[tauri::command]
pub async fn acorn_open(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("acorn") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "acorn", WebviewUrl::External(Url::parse(ACORN_HOME).unwrap()))
        .title("ACORN")
        .inner_size(1180.0, 820.0)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_keys_are_stored() {
        for k in ["registrations", "notifications", "profile", "history", "enrolled:20259", "enrolled:20259-20261"] {
            assert!(valid_key(k), "{k}");
        }
        for k in ["", "enrolled:", "enrolled:../x", "enrolled:a/b", "cookies", "enrolled:0123456789012345678901"] {
            assert!(!valid_key(k), "{k}");
        }
        assert_eq!(file_for("enrolled:20259"), "enrolled_20259.json");
    }

    #[test]
    fn loads_what_was_synced() {
        let dir = std::env::temp_dir().join(format!("qd-acorn-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("enrolled_20259.json"), r#"{"APP":[{"code":"CSC263H1"}]}"#).unwrap();
        std::fs::write(dir.join("history.json"), r#"{"facultyCourses":[]}"#).unwrap();
        std::fs::write(dir.join("synced_at"), "1790000000").unwrap();
        let v = load(&dir, &("idle".into(), String::new()));
        assert_eq!(v["enrolled"]["20259"]["APP"][0]["code"], "CSC263H1");
        assert_eq!(v["history"]["facultyCourses"], serde_json::json!([]));
        assert_eq!(v["syncedAt"], 1790000000);
        assert_eq!(v["profile"], Value::Null);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
