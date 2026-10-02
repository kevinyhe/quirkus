mod acorn;
mod canvas;
pub mod mcp;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use canvas::{valid_api_path, Auth, Canvas, Error, BASE};
use futures_util::StreamExt;
use serde_json::Value;
use tauri::http::{header::CONTENT_TYPE, Response as HttpResponse};
use tauri::ipc::Response;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tokio::io::AsyncWriteExt;
use url::Url;

type Api<'a> = State<'a, Arc<Canvas>>;

/// Where the app keeps its files. Normally the OS app dirs; QUERCUS_PROFILE_DIR moves all of them
/// (used by the end-to-end tests so they never touch a real profile).
struct Dirs {
    cache: PathBuf,
    config: PathBuf,
    data: PathBuf,
}

fn dirs(app: &AppHandle) -> tauri::State<'_, Dirs> {
    app.state::<Dirs>()
}

const DEFAULT_MAX_AGE: u64 = 60;
const STREAM: &str = "/api/v1/users/self/activity_stream?only_active_courses=true";

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// ---------- API ----------

#[tauri::command]
fn session(api: Api) -> bool {
    api.has_auth()
}

#[tauri::command]
async fn api_get(app: AppHandle, api: Api<'_>, path: String, max_age: Option<u64>) -> Result<Response, String> {
    if !valid_api_path(&path) {
        return Err("bad path".into());
    }
    let v = api.get(&app, &path, Duration::from_secs(max_age.unwrap_or(DEFAULT_MAX_AGE))).await.map_err(err)?;
    Ok(Response::new(serde_json::to_string(&*v).map_err(err)?))
}

/// Where this program lives and which OS it's on, for the "Use with Claude" setup instructions.
#[tauri::command]
fn mcp_info() -> serde_json::Value {
    let exe = std::env::current_exe().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    serde_json::json!({ "exe": exe, "os": std::env::consts::OS })
}

#[tauri::command]
fn prefetch(app: AppHandle, api: Api, paths: Vec<String>, max_age: Option<u64>) {
    api.prefetch(&app, paths, Duration::from_secs(max_age.unwrap_or(300)));
}

#[tauri::command]
fn clear_cache(api: Api) {
    api.clear_cache();
}

// ---------- Sign-in ----------

#[tauri::command]
async fn set_token(api: Api<'_>, token: String) -> Result<(), String> {
    api.set_auth(Some(Auth::Token(token.trim().to_string())));
    if let Err(e) = api.fetch("/api/v1/users/self").await {
        api.set_auth(None);
        return Err(match e {
            Error::SignedOut => "Quercus rejected that token.".into(),
            e => e.to_string(),
        });
    }
    Ok(())
}

#[tauri::command]
async fn logout(app: AppHandle, api: Api<'_>) -> Result<(), String> {
    api.set_auth(None);
    api.clear_cache();
    app.state::<acorn::Acorn>().clear();
    for label in ["acorn", "acorn-sync", "dx-sync"] {
        if let Some(w) = app.get_webview_window(label) {
            let _ = w.close();
        }
    }
    // Drop the UofT SSO cookies too, or the next sign-in would skip the password page.
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.clear_all_browsing_data();
    }
    Ok(())
}

/// Copy the Quercus session cookies out of the login webview and check they work.
async fn capture_session(app: &AppHandle, win: &WebviewWindow) -> Result<(), String> {
    let base = Url::parse(BASE).unwrap();
    let cookies = win.cookies_for_url(base).map_err(err)?;
    let header = cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; ");
    if header.is_empty() {
        return Err("no cookies".into());
    }
    let api = app.state::<Arc<Canvas>>();
    api.set_auth(Some(Auth::Cookie(header)));
    if let Err(e) = api.fetch("/api/v1/users/self").await {
        api.set_auth(None);
        return Err(e.to_string());
    }
    Ok(())
}

/// Open the UofT sign-in page. With `silent`, the window starts hidden and only
/// appears if SSO can't finish on its own (e.g. MFA is needed).
#[tauri::command]
async fn login_sso(app: AppHandle, silent: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("login") {
        if !silent {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }
    let busy = Arc::new(AtomicBool::new(false));
    let handle = app.clone();
    let url = Url::parse(&format!("{BASE}/login")).unwrap();
    WebviewWindowBuilder::new(&app, "login", WebviewUrl::External(url))
        .title("Sign in to Quercus")
        .inner_size(520.0, 760.0)
        .visible(!silent)
        .on_page_load(move |win, p| {
            let u = p.url();
            if p.event() != PageLoadEvent::Finished
                || u.host_str() != Some("q.utoronto.ca")
                || u.path().starts_with("/login")
                || busy.swap(true, Ordering::SeqCst)
            {
                return;
            }
            let (app, busy) = (handle.clone(), busy.clone());
            tauri::async_runtime::spawn(async move {
                match capture_session(&app, &win).await {
                    Ok(()) => {
                        let _ = app.emit("signed-in", ());
                        let _ = win.close();
                    }
                    Err(_) => {
                        busy.store(false, Ordering::SeqCst);
                        let _ = win.show();
                    }
                }
            });
        })
        .build()
        .map_err(err)?;

    if silent {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_secs(12)).await;
            if let Some(w) = app.get_webview_window("login") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        });
    }
    Ok(())
}

// ---------- Links, files ----------

/// Quercus links open in an in-app window that shares the sign-in; everything else goes to the browser.
#[tauri::command]
async fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    let u = Url::parse(&url).map_err(err)?;
    if u.host_str() == Some("q.utoronto.ca") {
        if let Some(w) = app.get_webview_window("quercus") {
            let _ = w.navigate(u);
            let _ = w.show();
            let _ = w.set_focus();
        } else {
            WebviewWindowBuilder::new(&app, "quercus", WebviewUrl::External(u))
                .title("Quercus")
                .inner_size(1100.0, 800.0)
                .build()
                .map_err(err)?;
        }
        return Ok(());
    }
    // webcal: hands a calendar feed to the default calendar app.
    if matches!(u.scheme(), "http" | "https" | "mailto" | "webcal") {
        app.opener().open_url(url, None::<&str>).map_err(err)?;
    }
    Ok(())
}

fn downloads_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().download_dir().map_err(err)?.join("Quercus"))
}

fn clean_name(s: &str) -> String {
    let s: String = s
        .chars()
        .map(|c| if c.is_control() || r#"/\:*?"<>|"#.contains(c) { '_' } else { c })
        .collect();
    let s = s.trim().trim_matches('.').to_string();
    if s.is_empty() { "untitled".into() } else { s }
}

const FILE_CACHE_MAX: u64 = 1 << 30; // 1 GB of viewed files kept locally
const PREVIEW_MAX: u64 = 200 << 20;

/// Make sure file `file_id` is in the local file cache. Returns its path and Canvas metadata.
/// Viewing and downloading both go through here, so a file crosses the network once.
/// `course_id` matters: when a course hides its Files tab, only the course-scoped endpoint lets
/// students fetch files linked from modules.
pub fn file_meta_path(file_id: u64, course_id: Option<u64>) -> String {
    match course_id {
        Some(c) => format!("/api/v1/courses/{c}/files/{file_id}"),
        None => format!("/api/v1/files/{file_id}"),
    }
}

async fn cache_file(app: &AppHandle, api: &Arc<Canvas>, file_id: u64, course_id: Option<u64>) -> Result<(PathBuf, Arc<Value>), String> {
    let meta = api.get(app, &file_meta_path(file_id, course_id), Duration::from_secs(300)).await.map_err(err)?;
    let url = meta["url"].as_str().filter(|s| !s.is_empty()).ok_or("This file is locked or unavailable.")?;
    let version: String = meta["updated_at"].as_str().unwrap_or("0").chars().filter(char::is_ascii_alphanumeric).collect();
    let dir = dirs(app).cache.join("files");
    tokio::fs::create_dir_all(&dir).await.map_err(err)?;
    let path = dir.join(format!("{file_id}-{version}"));
    let size = meta["size"].as_u64();
    if let Ok(m) = tokio::fs::metadata(&path).await {
        if size.map_or(true, |s| s == m.len()) {
            return Ok((path, meta));
        }
    }
    let res = api.raw(url).await.map_err(err)?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let part = dir.join(format!("{file_id}.{nonce}.part"));
    let mut f = tokio::fs::File::create(&part).await.map_err(err)?;
    let mut body = res.bytes_stream();
    while let Some(chunk) = body.next().await {
        if let Err(e) = async { f.write_all(&chunk.map_err(err)?).await.map_err(err) }.await {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(e);
        }
    }
    f.flush().await.map_err(err)?;
    drop(f);
    tokio::fs::rename(&part, &path).await.map_err(err)?;
    evict(&dir, &path);
    Ok((path, meta))
}

/// Delete least recently written files until the cache is under FILE_CACHE_MAX.
fn evict(dir: &Path, keep: &Path) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<_> = rd
        .flatten()
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            Some((m.modified().ok()?, m.len(), e.path()))
        })
        .collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort();
    for (_, len, p) in files {
        if total <= FILE_CACHE_MAX {
            break;
        }
        if p != keep && std::fs::remove_file(&p).is_ok() {
            total -= len;
        }
    }
}

const PREFETCH_MAX: u64 = 25 << 20;
static PREFETCH_SLOTS: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(2);
static PREFETCHING: std::sync::Mutex<Option<HashSet<u64>>> = std::sync::Mutex::new(None);

/// Types the in-app viewer can show. Only these are worth downloading ahead of a click.
fn viewable(meta: &Value) -> bool {
    let ct = meta["content-type"].as_str().unwrap_or("");
    let name = meta["display_name"].as_str().unwrap_or("").to_ascii_lowercase();
    let ext = name.rsplit('.').next().unwrap_or("");
    ct == "application/pdf"
        || ct.starts_with("image/")
        || ct.starts_with("text/")
        || matches!(
            ext,
            "pdf" | "txt" | "md" | "csv" | "tsv" | "py" | "java" | "c" | "cpp" | "h" | "js" | "ts" | "r" | "sql" | "json"
                | "docx" | "odt" | "pptx" | "ppsx" | "odp" | "xlsx" | "xls" | "ods" | "ipynb" | "html" | "htm"
        )
}

/// Download a module's viewable files into the local cache in the background, so opening one is
/// instant. Two at a time, nothing over 25 MB, each file at most once in flight.
#[tauri::command]
fn prefetch_files(app: AppHandle, api: Api, course_id: Option<u64>, file_ids: Vec<u64>) {
    let api = api.inner().clone();
    for id in file_ids.into_iter().take(60) {
        {
            let mut set = PREFETCHING.lock().unwrap();
            if !set.get_or_insert_with(HashSet::new).insert(id) {
                continue;
            }
        }
        let (app, api) = (app.clone(), api.clone());
        tauri::async_runtime::spawn(async move {
            if let Ok(_slot) = PREFETCH_SLOTS.acquire().await {
                if let Ok(meta) = api.get(&app, &file_meta_path(id, course_id), Duration::from_secs(300)).await {
                    let small = meta["size"].as_u64().is_some_and(|s| s <= PREFETCH_MAX);
                    if small && viewable(&meta) && !meta["locked_for_user"].as_bool().unwrap_or(false) {
                        let _ = cache_file(&app, &api, id, course_id).await;
                    }
                }
            }
            if let Some(set) = PREFETCHING.lock().unwrap().as_mut() {
                set.remove(&id);
            }
        });
    }
}

/// File contents for the in-app viewer, as raw bytes (arrives in JS as an ArrayBuffer).
#[tauri::command]
async fn file_bytes(app: AppHandle, api: Api<'_>, file_id: u64, course_id: Option<u64>) -> Result<Response, String> {
    let (path, meta) = cache_file(&app, api.inner(), file_id, course_id).await?;
    if meta["size"].as_u64().unwrap_or(0) > PREVIEW_MAX {
        return Err("too-large".into());
    }
    Ok(Response::new(tokio::fs::read(path).await.map_err(err)?))
}

/// Copy a Quercus file into ~/Downloads/Quercus/<folder>/ and return its path.
#[tauri::command]
async fn download_file(app: AppHandle, api: Api<'_>, file_id: u64, course_id: Option<u64>, folder: String) -> Result<String, String> {
    let (src, meta) = cache_file(&app, api.inner(), file_id, course_id).await?;
    let name = clean_name(meta["display_name"].as_str().unwrap_or("file"));
    // `folder` may be nested ("CSC263H1/Lectures/Week 1"). Clean each segment so it can't escape the root.
    let mut dir = downloads_root(&app)?;
    for seg in folder.split('/').filter(|s| !s.trim().is_empty()) {
        dir.push(clean_name(seg));
    }
    tokio::fs::create_dir_all(&dir).await.map_err(err)?;
    let dest = dir.join(&name);
    let same = match (tokio::fs::metadata(&dest).await, tokio::fs::metadata(&src).await) {
        (Ok(a), Ok(b)) => a.len() == b.len(),
        _ => false,
    };
    if !same {
        tokio::fs::copy(&src, &dest).await.map_err(err)?;
    }
    Ok(dest.to_string_lossy().into())
}

fn inside_downloads(app: &AppHandle, p: &str) -> Result<PathBuf, String> {
    let root = downloads_root(app)?;
    let p = Path::new(p).canonicalize().map_err(err)?;
    if p.starts_with(root.canonicalize().map_err(err)?) { Ok(p) } else { Err("outside downloads".into()) }
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = inside_downloads(&app, &path)?;
    app.opener().open_path(p.to_string_lossy(), None::<&str>).map_err(err)
}

#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = inside_downloads(&app, &path)?;
    app.opener().reveal_item_in_dir(p).map_err(err)
}

// ---------- Notifications ----------

/// What the user wants to be told about. Saved as notify.json in the config folder.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct NotifyPrefs {
    enabled: bool,
    announcements: bool,
    grades: bool,
    messages: bool,
    /// Remind about unfinished work this many hours before it's due.
    due: bool,
    due_hours: u32,
}

impl Default for NotifyPrefs {
    fn default() -> Self {
        NotifyPrefs { enabled: true, announcements: true, grades: true, messages: true, due: true, due_hours: 24 }
    }
}

fn load_notify(app: &AppHandle) -> NotifyPrefs {
    std::fs::read(dirs(app).config.join("notify.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

#[tauri::command]
fn notify_prefs(app: AppHandle) -> NotifyPrefs {
    load_notify(&app)
}

#[tauri::command]
fn set_notify_prefs(app: AppHandle, prefs: NotifyPrefs) -> Result<(), String> {
    let prefs = NotifyPrefs { due_hours: prefs.due_hours.clamp(1, 72), ..prefs };
    canvas::write_private(&dirs(&app).config.join("notify.json"), &serde_json::to_vec(&prefs).map_err(err)?);
    Ok(())
}

/// Show one notification now, so the user can see they work (and so macOS asks for permission).
#[tauri::command]
fn notify_test(app: AppHandle) -> Result<(), String> {
    app.notification().builder().title("Quirkus").body("Notifications are on. You'll hear about new announcements, grades, messages, and deadlines.").show().map_err(err)
}

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Announcement,
    Message,
    Grade,
    Due,
}

impl NotifyPrefs {
    fn wants(&self, k: Kind) -> bool {
        self.enabled
            && match k {
                Kind::Announcement => self.announcements,
                Kind::Message => self.messages,
                Kind::Grade => self.grades,
                Kind::Due => self.due,
            }
    }
}

fn stream_key(item: &Value) -> Option<(Kind, String, String, String)> {
    let id = item["id"].as_u64()?;
    let title = item["title"].as_str().unwrap_or("").to_string();
    let course = item["context_name"].as_str().or(item["course"]["name"].as_str()).unwrap_or("Quercus").to_string();
    match item["type"].as_str()? {
        "Announcement" => Some((Kind::Announcement, format!("a{id}"), format!("📢 {course}"), title)),
        "Conversation" => Some((Kind::Message, format!("c{id}:{}", item["updated_at"].as_str().unwrap_or("")), "✉️ New message".into(), title)),
        "Submission" => {
            let grade = item["grade"].as_str().map(String::from).or(item["score"].as_f64().map(|s| s.to_string()))?;
            let name = item["assignment"]["name"].as_str().map(String::from).unwrap_or(title);
            Some((Kind::Grade, format!("s{id}:{grade}"), format!("✅ Graded: {name}"), format!("{course}: {grade}")))
        }
        _ => None,
    }
}

/// A reminder for a planner item that's due within `hours` and still has something to do.
/// The key includes the due date, so moving a deadline reminds again.
fn due_key(item: &Value, now: chrono::DateTime<chrono::Utc>, hours: u32) -> Option<(Kind, String, String, String)> {
    let kind = item["plannable_type"].as_str()?;
    if kind == "announcement" || kind == "calendar_event" {
        return None;
    }
    let date = item["plannable_date"].as_str()?;
    let due = date.parse::<chrono::DateTime<chrono::Utc>>().ok()?;
    let left = due - now;
    if left < chrono::Duration::zero() || left > chrono::Duration::hours(hours as i64) {
        return None;
    }
    let s = &item["submissions"];
    let done = ["submitted", "graded", "excused"].iter().any(|k| s[*k].as_bool() == Some(true))
        || item["planner_override"]["marked_complete"].as_bool() == Some(true);
    if done {
        return None;
    }
    let mins = left.num_minutes();
    let when = if mins < 90 { format!("in {mins} min") } else { format!("in {} h", (mins + 30) / 60) };
    let title = item["plannable"]["title"].as_str().unwrap_or("Untitled");
    let course = item["context_name"].as_str().unwrap_or("Quercus");
    Some((Kind::Due, format!("d{kind}{}:{date}", item["plannable_id"]), format!("⏰ Due {when}"), format!("{title} · {course}")))
}

/// Poll Quercus and raise a desktop notification for anything new, and for deadlines coming up.
async fn watch(app: AppHandle) {
    let file = dirs(&app).config.join("seen.json");
    let mut seen: Option<HashSet<String>> =
        std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok());
    loop {
        tokio::time::sleep(Duration::from_secs(if seen.is_none() { 20 } else { 600 })).await;
        let api = app.state::<Arc<Canvas>>().inner().clone();
        if !api.has_auth() {
            continue;
        }
        let prefs = load_notify(&app);
        let Ok(stream) = api.refresh(&app, STREAM).await else { continue };
        let mut items: Vec<_> = stream.as_array().into_iter().flatten().filter_map(stream_key).collect();
        // Everything already in the stream on the first run is old news. Deadlines are not.
        let first_run = seen.is_none();
        if prefs.wants(Kind::Due) {
            let today = chrono::Local::now().date_naive();
            let path = format!("/api/v1/planner/items?start_date={}&end_date={}", today, today + chrono::Duration::days(4));
            if let Ok(planner) = api.fetch(&path).await {
                let now = chrono::Utc::now();
                items.extend(planner.as_array().into_iter().flatten().filter_map(|i| due_key(i, now, prefs.due_hours)));
            }
        }
        let set = seen.get_or_insert_with(HashSet::new);
        for (kind, key, title, body) in items {
            // Things you've muted are still marked seen, so turning a type back on doesn't replay old items.
            if set.insert(key) && prefs.wants(kind) && (!first_run || kind == Kind::Due) {
                let _ = app.notification().builder().title(title).body(body).show();
            }
        }
        if set.len() > 3000 {
            set.clear();
        }
        if let Ok(b) = serde_json::to_vec(set) {
            canvas::write_private(&file, &b);
        }
    }
}

// ---------- Calendar ----------

/// Write the timetable as an .ics file in ~/Downloads/Quercus and return its path.
#[tauri::command]
async fn save_calendar(app: AppHandle, ics: String) -> Result<String, String> {
    if !ics.starts_with("BEGIN:VCALENDAR") || ics.len() > 2 << 20 {
        return Err("not a calendar".into());
    }
    let dir = downloads_root(&app)?;
    tokio::fs::create_dir_all(&dir).await.map_err(err)?;
    let dest = dir.join("Quirkus timetable.ics");
    tokio::fs::write(&dest, ics).await.map_err(err)?;
    Ok(dest.to_string_lossy().into())
}

// ---------- App ----------

/// QUERCUS_E2E_ROUTES="/,/c/101/a/3001,…": visit these screens one after another (every
/// QUERCUS_E2E_INTERVAL_MS, default 3000, after a 5 s start). Used by tests/e2e.mjs, because synthetic
/// input into WSLg windows is unreliable. Unset in normal use.
fn e2e_tour(w: &WebviewWindow) {
    let Ok(routes) = std::env::var("QUERCUS_E2E_ROUTES") else { return };
    let every = std::env::var("QUERCUS_E2E_INTERVAL_MS").ok().and_then(|v| v.parse().ok()).unwrap_or(3000);
    let w = w.clone();
    std::thread::spawn(move || {
        // A fresh test profile would open on the welcome tour. Mark it done so the routes show.
        std::thread::sleep(Duration::from_secs(2));
        let _ = w.eval(r#"localStorage.setItem("prefs", JSON.stringify({ onboarded: true })); location.reload()"#);
        std::thread::sleep(Duration::from_secs(3));
        for route in routes.split(',').filter(|r| r.starts_with('/')) {
            // JSON-encode so the route can only ever be a string literal.
            if let Ok(lit) = serde_json::to_string(route) {
                let _ = w.eval(format!("location.hash = {lit}"));
            }
            std::thread::sleep(Duration::from_millis(every));
        }
    });
}

/// Open at 1280×820, or 90% of the screen's usable area if that's smaller, centred. Setting this
/// explicitly fixes Windows builds that otherwise opened at a fraction of the configured size.
fn fit_to_screen(w: &WebviewWindow) {
    use tauri::{LogicalSize, Size};
    let Ok(Some(monitor)) = w.current_monitor().or_else(|_| w.primary_monitor()) else { return };
    let scale = monitor.scale_factor();
    let area = monitor.work_area().size.to_logical::<f64>(scale);
    let width = 1280f64.min(area.width * 0.9).max(420.0);
    let height = 820f64.min(area.height * 0.9).max(420.0);
    let _ = w.set_size(Size::Logical(LogicalSize::new(width, height)));
    let _ = w.center();

    // QUERCUS_DEBUG_LOG=<file>: record what the window actually got, for diagnosing platform issues.
    if let Ok(path) = std::env::var("QUERCUS_DEBUG_LOG") {
        let w = w.clone();
        std::thread::spawn(move || {
            let mut log = String::new();
            for i in 0..5 {
                std::thread::sleep(Duration::from_millis(800));
                log += &format!(
                    "t={i} inner={:?} outer={:?} scale={:?} pos={:?} work_area={area:?}\n",
                    w.inner_size().ok(), w.outer_size().ok(), w.scale_factor().ok(), w.outer_position().ok()
                );
                let _ = std::fs::write(&path, &log);
            }
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // qc://localhost/<path> serves any Quercus URL with the user's session, so images
        // embedded in pages and announcements load even though the UI runs on another origin.
        .register_asynchronous_uri_scheme_protocol("qc", |ctx, req, responder| {
            let app = ctx.app_handle().clone();
            let path = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_default();
            tauri::async_runtime::spawn(async move {
                let api = app.state::<Arc<Canvas>>().inner().clone();
                let out = async {
                    let res = api.raw(&format!("{}{path}", api.base())).await.ok()?;
                    let ct = res.headers().get(CONTENT_TYPE).cloned();
                    let body = res.bytes().await.ok()?;
                    let mut b = HttpResponse::builder().header("Cache-Control", "private, max-age=86400");
                    if let Some(ct) = ct {
                        b = b.header(CONTENT_TYPE, ct);
                    }
                    b.body(body.to_vec()).ok()
                }
                .await;
                responder.respond(out.unwrap_or_else(|| HttpResponse::builder().status(404).body(Vec::new()).unwrap()));
            });
        })
        .setup(|app| {
            let d = match std::env::var("QUERCUS_PROFILE_DIR") {
                Ok(p) if !p.is_empty() => {
                    let p = PathBuf::from(p);
                    Dirs { cache: p.join("cache"), config: p.join("config"), data: p.join("data") }
                }
                _ => Dirs { cache: app.path().app_cache_dir()?, config: app.path().app_config_dir()?, data: app.path().app_data_dir()? },
            };
            let (cache, config, data) = (d.cache.join("api"), d.config.clone(), d.data.clone());
            app.manage(d);
            // QUERCUS_BASE_URL points the API client at another Canvas server. Used by tests/e2e.mjs
            // to run the release build against a local fake; unset in normal use.
            let canvas = match std::env::var("QUERCUS_BASE_URL") {
                Ok(base) if !base.is_empty() => Canvas::with_base(&base, cache, config),
                _ => Canvas::new(cache, config),
            };
            app.manage(Arc::new(canvas));
            app.manage(acorn::Acorn::new(data));
            tauri::async_runtime::spawn(watch(app.handle().clone()));
            if let Some(w) = app.get_webview_window("main") {
                fit_to_screen(&w);
                e2e_tour(&w);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            session, api_get, prefetch, mcp_info, clear_cache, set_token, logout, login_sso,
            open_url, download_file, file_bytes, prefetch_files, open_path, reveal_path,
            notify_prefs, set_notify_prefs, notify_test, save_calendar,
            acorn::acorn_open, acorn::acorn_sync, acorn::acorn_data, acorn::acorn_capture, acorn::acorn_sync_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefetches_only_viewable_files() {
        let f = |ct: &str, name: &str| viewable(&serde_json::json!({ "content-type": ct, "display_name": name }));
        assert!(f("application/pdf", "Lecture 1.pdf"));
        assert!(f("image/png", "diagram.png"));
        assert!(f("application/octet-stream", "starter.py"));
        assert!(f("application/vnd.openxmlformats-officedocument.presentationml.presentation", "slides.pptx"));
        assert!(f("application/octet-stream", "Lab 2.ipynb"));
        assert!(!f("application/x-iwork-keynote-sffkey", "slides.key"));
        assert!(!f("video/mp4", "lecture.mp4"));
        assert!(!f("application/zip", "a1.zip"));
    }

    #[test]
    fn reminds_only_about_unfinished_work_due_soon() {
        let now = "2026-10-02T12:00:00Z".parse::<chrono::DateTime<chrono::Utc>>().unwrap();
        let item = |date: &str, subs: Value| serde_json::json!({
            "plannable_type": "assignment", "plannable_id": 7, "plannable_date": date, "context_name": "CSC263",
            "plannable": { "title": "PS3" }, "submissions": subs
        });
        let todo = serde_json::json!({ "submitted": false, "graded": false });
        let (kind, key, title, body) = due_key(&item("2026-10-03T03:59:00Z", todo.clone()), now, 24).unwrap();
        assert_eq!((kind, key.as_str(), title.as_str(), body.as_str()), (Kind::Due, "dassignment7:2026-10-03T03:59:00Z", "⏰ Due in 16 h", "PS3 · CSC263"));
        assert_eq!(due_key(&item("2026-10-02T12:45:00Z", todo.clone()), now, 24).unwrap().2, "⏰ Due in 45 min");
        assert!(due_key(&item("2026-10-04T12:00:00Z", todo.clone()), now, 24).is_none(), "too far off");
        assert!(due_key(&item("2026-10-02T11:00:00Z", todo.clone()), now, 24).is_none(), "already past");
        assert!(due_key(&item("2026-10-03T03:59:00Z", serde_json::json!({ "submitted": true })), now, 24).is_none());
        assert!(due_key(&item("2026-10-03T03:59:00Z", serde_json::json!({ "graded": true })), now, 24).is_none());
        // Discussions and pages report `submissions: false`.
        assert!(due_key(&item("2026-10-03T03:59:00Z", Value::Bool(false)), now, 24).is_some());
    }

    #[test]
    fn muted_types_stay_quiet() {
        let p = NotifyPrefs { grades: false, ..NotifyPrefs::default() };
        assert!(p.wants(Kind::Announcement) && p.wants(Kind::Due) && !p.wants(Kind::Grade));
        assert!(!NotifyPrefs { enabled: false, ..NotifyPrefs::default() }.wants(Kind::Announcement));
        // An older or partial notify.json still loads, with the rest defaulted.
        let partial: NotifyPrefs = serde_json::from_str(r#"{"messages":false}"#).unwrap();
        assert!(partial.enabled && !partial.messages && partial.due_hours == 24);
    }

    #[test]
    fn cleans_file_names() {
        assert_eq!(clean_name("a/b:c*?.pdf"), "a_b_c__.pdf");
        assert_eq!(clean_name(".."), "untitled");
        assert_eq!(clean_name("  Week 1  "), "Week 1");
    }
}

#[cfg(test)]
mod command_rules {
    /// Synchronous commands run on the main thread. Creating a webview window there deadlocks on
    /// Windows and freezes all IPC (this shipped once: the ACORN sync froze the Windows app).
    #[test]
    fn window_creating_commands_are_async() {
        for (file, src) in [("lib.rs", include_str!("lib.rs")), ("acorn.rs", include_str!("acorn.rs"))] {
            // Git on Windows checks files out with CRLF, which would hide the end of each function.
            let src = src.replace("\r\n", "\n");
            // Built in two pieces so this test doesn't match its own source.
            for chunk in src.split(concat!("#[tauri::", "command]")).skip(1) {
                let sig = chunk.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with("//")).unwrap_or("");
                let body = chunk.split("\n}\n").next().unwrap_or("");
                let makes_window = body.contains("WebviewWindowBuilder") || body.contains("open_sync_window(");
                assert!(!makes_window || sig.contains("async fn"), "{file}: `{}` creates a window but isn't async", sig.trim());
            }
        }
    }
}
