//! Canvas (Quercus) API client with a two-level cache.
//!
//! Every GET goes through `get`. If we have the response in memory or on disk we
//! return it at once and refresh it in the background; when the refreshed copy
//! differs we emit `api-updated` so the UI can swap it in. The UI never waits on
//! the network for a page it has seen before.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, LINK};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use url::Url;

pub const BASE: &str = "https://q.utoronto.ca";
const MAX_PAGES: usize = 30;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Auth {
    Token(String),
    Cookie(String),
}

struct Session {
    http: Client,
    jar: Option<Arc<Jar>>,
}

pub struct Canvas {
    base: String,
    session: RwLock<Option<Session>>,
    saved_cookies: Mutex<String>,
    mem: Mutex<HashMap<String, (Arc<Value>, Instant)>>,
    inflight: Mutex<HashSet<String>>,
    limit: Semaphore,
    cache_dir: PathBuf,
    auth_file: PathBuf,
    // Prefer the OS keychain for the session; fall back to the 0600 file when there's no backend
    // (headless Linux, WSL) or in tests. Off for test instances so they never touch the real keychain.
    keychain: bool,
}

#[derive(Debug)]
pub enum Error {
    SignedOut,
    Status(u16),
    Other(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            Error::SignedOut => write!(f, "signed-out"),
            Error::Status(s) => write!(f, "http-{s}"),
            Error::Other(m) => write!(f, "{m}"),
        }
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Other(if e.is_connect() || e.is_timeout() {
            "offline".into()
        } else {
            e.to_string()
        })
    }
}

fn base_url() -> Url {
    Url::parse(BASE).unwrap()
}

fn build_session(auth: &Auth) -> Session {
    let mut headers = HeaderMap::new();
    let mut jar = None;
    let mut b = Client::builder()
        .user_agent(concat!("QuercusDesktop/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .pool_idle_timeout(Duration::from_secs(90));
    match auth {
        Auth::Token(t) => {
            if let Ok(v) = HeaderValue::from_str(&format!("Bearer {t}")) {
                headers.insert(AUTHORIZATION, v);
            }
        }
        Auth::Cookie(c) => {
            let j = Arc::new(Jar::default());
            let url = base_url();
            for pair in c.split("; ").filter(|p| p.contains('=')) {
                j.add_cookie_str(&format!("{pair}; Domain=q.utoronto.ca; Path=/; Secure"), &url);
            }
            b = b.cookie_provider(j.clone());
            jar = Some(j);
        }
    }
    Session { http: b.default_headers(headers).build().expect("http client"), jar }
}

/// Canvas prefixes session-authenticated JSON with `while(1);` to stop JSON hijacking.
fn parse_body(text: &str) -> Result<Value, Error> {
    let t = text.strip_prefix("while(1);").unwrap_or(text);
    serde_json::from_str(t).map_err(|e| Error::Other(format!("bad json: {e}")))
}

fn next_link(h: &HeaderMap) -> Option<String> {
    let link = h.get(LINK)?.to_str().ok()?;
    link.split(',').find_map(|part| {
        let (url, rel) = part.split_once(';')?;
        rel.contains("rel=\"next\"")
            .then(|| url.trim().trim_start_matches('<').trim_end_matches('>').to_string())
    })
}

/// FNV-1a. Stable across builds, unlike `DefaultHasher`, so disk cache keys survive upgrades.
fn key_hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

pub fn valid_api_path(p: &str) -> bool {
    p.starts_with("/api/v1/") && !p.contains("..") && !p.contains('#')
}

/// Canvas answers 401 both when you're signed out and when you lack permission (e.g. a hidden
/// Files tab). Only the first should trigger a new sign-in.
fn is_signed_out(body: &str) -> bool {
    let b = body.to_ascii_lowercase();
    b.contains("unauthenticated") || b.contains("authorization required") || b.contains("invalid access token") || b.contains("expired")
}

impl Canvas {
    /// The real app: the session lives in the OS keychain when one is available.
    pub fn new(cache_dir: PathBuf, config_dir: PathBuf) -> Self {
        Self::build(BASE, cache_dir, config_dir, true)
    }

    /// Tests and the QUERCUS_BASE_URL override: file only, never the keychain.
    pub fn with_base(base: &str, cache_dir: PathBuf, config_dir: PathBuf) -> Self {
        Self::build(base, cache_dir, config_dir, false)
    }

    fn build(base: &str, cache_dir: PathBuf, config_dir: PathBuf, keychain: bool) -> Self {
        let _ = std::fs::create_dir_all(&cache_dir);
        let _ = std::fs::create_dir_all(&config_dir);
        let auth_file = config_dir.join("auth.json");
        let raw = read_secret(keychain, &auth_file);
        let session = raw.as_deref().and_then(|b| serde_json::from_slice::<Auth>(b).ok()).map(|a| build_session(&a));
        let c = Canvas {
            base: base.trim_end_matches('/').to_string(),
            session: RwLock::new(session),
            saved_cookies: Mutex::new(String::new()),
            mem: Mutex::new(HashMap::new()),
            inflight: Mutex::new(HashSet::new()),
            limit: Semaphore::new(6),
            cache_dir,
            auth_file,
            keychain,
        };
        // Migrate an existing plaintext file into the keychain on first run with a backend.
        if keychain && raw.is_some() && std::fs::metadata(&c.auth_file).is_ok() {
            if let Some(b) = raw {
                c.write_secret(&b);
            }
        }
        c
    }

    /// The Canvas server this client talks to (q.utoronto.ca unless overridden for tests).
    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn has_auth(&self) -> bool {
        self.session.read().unwrap().is_some()
    }

    fn client(&self) -> Result<Client, Error> {
        self.session.read().unwrap().as_ref().map(|s| s.http.clone()).ok_or(Error::SignedOut)
    }

    pub fn set_auth(&self, auth: Option<Auth>) {
        match &auth {
            Some(a) => {
                if let Ok(b) = serde_json::to_vec(a) {
                    self.write_secret(&b);
                }
            }
            None => self.clear_secret(),
        }
        *self.session.write().unwrap() = auth.as_ref().map(build_session);
    }

    /// Save the session: keychain when enabled and reachable, otherwise the 0600 file. A successful
    /// keychain write removes the plaintext file so the secret isn't left in two places.
    fn write_secret(&self, bytes: &[u8]) {
        if self.keychain {
            if let Ok(s) = std::str::from_utf8(bytes) {
                if keyring_set(s).is_ok() {
                    let _ = std::fs::remove_file(&self.auth_file);
                    return;
                }
            }
        }
        write_private(&self.auth_file, bytes);
    }

    fn clear_secret(&self) {
        if self.keychain {
            keyring_delete();
        }
        let _ = std::fs::remove_file(&self.auth_file);
    }

    /// Canvas rotates its session cookie on responses. Save the jar's current
    /// cookies so a restart picks up the newest ones.
    fn persist_cookies(&self) {
        let header = {
            let s = self.session.read().unwrap();
            s.as_ref()
                .and_then(|s| s.jar.as_ref())
                .and_then(|j| j.cookies(&base_url()))
                .and_then(|h| h.to_str().ok().map(String::from))
        };
        let Some(h) = header else { return };
        let mut saved = self.saved_cookies.lock().unwrap();
        if *saved != h {
            if let Ok(b) = serde_json::to_vec(&Auth::Cookie(h.clone())) {
                self.write_secret(&b);
            }
            *saved = h;
        }
    }

    pub fn clear_cache(&self) {
        self.mem.lock().unwrap().clear();
        let _ = std::fs::remove_dir_all(&self.cache_dir);
        let _ = std::fs::create_dir_all(&self.cache_dir);
    }

    /// One GET with Canvas's error conventions applied. Retries when Canvas rate-limits us.
    async fn send(&self, http: &Client, url: &str, accept: &str) -> Result<reqwest::Response, Error> {
        let mut wait = Duration::from_millis(500);
        for attempt in 0..4 {
            let res = http.get(url).header("Accept", accept).send().await?;
            let status = res.status();
            if status.is_success() {
                return Ok(res);
            }
            let body = res.text().await.unwrap_or_default();
            match status {
                StatusCode::UNAUTHORIZED if is_signed_out(&body) => return Err(Error::SignedOut),
                StatusCode::UNAUTHORIZED => return Err(Error::Status(403)),
                StatusCode::FORBIDDEN if body.contains("Rate Limit Exceeded") && attempt < 3 => {
                    tokio::time::sleep(wait).await;
                    wait *= 2;
                }
                s => return Err(Error::Status(s.as_u16())),
            }
        }
        Err(Error::Status(403))
    }

    /// Raw GET against Quercus, following pagination for list endpoints.
    pub async fn fetch(&self, path: &str) -> Result<Value, Error> {
        let http = self.client()?;
        let _permit = self.limit.acquire().await.map_err(|e| Error::Other(e.to_string()))?;
        let base = &self.base;
        let sep = if path.contains('?') { '&' } else { '?' };
        let mut url = if path.contains("per_page=") {
            format!("{base}{path}")
        } else {
            format!("{base}{path}{sep}per_page=100")
        };
        let mut out: Option<Value> = None;
        for _ in 0..MAX_PAGES {
            let res = self.send(&http, &url, "application/json").await?;
            let next = next_link(res.headers());
            let page = parse_body(&res.text().await?)?;
            out = Some(match (out, page) {
                (Some(Value::Array(mut acc)), Value::Array(more)) => {
                    acc.extend(more);
                    Value::Array(acc)
                }
                (_, page) => page,
            });
            match next {
                Some(n) if n.starts_with(base.as_str()) && matches!(out, Some(Value::Array(_))) => url = n,
                _ => break,
            }
        }
        self.persist_cookies();
        Ok(out.unwrap_or(Value::Null))
    }

    fn disk_path(&self, key: &str) -> PathBuf {
        self.cache_dir.join(format!("{}.json", key_hash(key)))
    }

    fn cached(&self, key: &str) -> Option<(Arc<Value>, Instant)> {
        if let Some(hit) = self.mem.lock().unwrap().get(key) {
            return Some(hit.clone());
        }
        let bytes = std::fs::read(self.disk_path(key)).ok()?;
        let v: Value = serde_json::from_slice(&bytes).ok()?;
        // Disk copies are of unknown age: mark them as old so they get refreshed.
        let stamp = Instant::now().checked_sub(Duration::from_secs(3600)).unwrap_or_else(Instant::now);
        let hit = (Arc::new(v), stamp);
        self.mem.lock().unwrap().insert(key.to_string(), hit.clone());
        Some(hit)
    }

    fn store(&self, key: &str, v: Value) -> bool {
        let changed = self.mem.lock().unwrap().get(key).map_or(true, |(old, _)| **old != v);
        if changed {
            if let Ok(b) = serde_json::to_vec(&v) {
                // Cached API responses hold grades, messages, etc. Keep them readable by this user only.
                write_private(&self.disk_path(key), &b);
            }
        }
        self.mem.lock().unwrap().insert(key.to_string(), (Arc::new(v), Instant::now()));
        changed
    }

    /// Fetch `key` from the network and publish it if it changed.
    pub async fn refresh(self: &Arc<Self>, app: &AppHandle, key: &str) -> Result<Arc<Value>, Error> {
        match self.fetch(key).await {
            Ok(v) => {
                let changed = self.store(key, v);
                let v = self.mem.lock().unwrap().get(key).unwrap().0.clone();
                if changed {
                    let _ = app.emit("api-updated", serde_json::json!({ "key": key, "data": &*v }));
                }
                Ok(v)
            }
            Err(Error::SignedOut) => {
                let _ = app.emit("signed-out", ());
                Err(Error::SignedOut)
            }
            Err(e) => Err(e),
        }
    }

    /// Background refresh, at most one in flight per key.
    pub fn revalidate(self: &Arc<Self>, app: &AppHandle, key: &str) {
        if !self.inflight.lock().unwrap().insert(key.to_string()) {
            return;
        }
        let (me, app, key) = (self.clone(), app.clone(), key.to_string());
        tauri::async_runtime::spawn(async move {
            let _ = me.refresh(&app, &key).await;
            me.inflight.lock().unwrap().remove(&key);
        });
    }

    /// Cached read. Returns immediately when anything is cached; refreshes if older than `max_age`.
    pub async fn get(self: &Arc<Self>, app: &AppHandle, key: &str, max_age: Duration) -> Result<Arc<Value>, Error> {
        if let Some((v, at)) = self.cached(key) {
            if at.elapsed() > max_age {
                self.revalidate(app, key);
            }
            return Ok(v);
        }
        self.refresh(app, key).await
    }

    /// Cached read without the app window (MCP server). Fresh copies within `max_age` come from the
    /// cache; otherwise refetch, and fall back to the saved copy if Quercus can't be reached.
    pub async fn read(&self, key: &str, max_age: Duration) -> Result<Arc<Value>, Error> {
        let cached = self.cached(key);
        if let Some((v, at)) = &cached {
            if at.elapsed() <= max_age {
                return Ok(v.clone());
            }
        }
        match self.fetch(key).await {
            Ok(v) => {
                self.store(key, v);
                Ok(self.mem.lock().unwrap().get(key).unwrap().0.clone())
            }
            Err(Error::SignedOut) => Err(Error::SignedOut),
            Err(e) => cached.map(|(v, _)| v).ok_or(e),
        }
    }

    /// Warm the cache for paths the user is likely to open next.
    pub fn prefetch(self: &Arc<Self>, app: &AppHandle, keys: Vec<String>, max_age: Duration) {
        for k in keys.into_iter().filter(|k| valid_api_path(k)) {
            match self.cached(&k) {
                Some((_, at)) if at.elapsed() <= max_age => {}
                _ => self.revalidate(app, &k),
            }
        }
    }

    /// Fetch an arbitrary Quercus URL (images, files) with the user's credentials.
    /// Files and images: accept anything, or Canvas may answer an image URL with JSON.
    pub async fn raw(&self, url: &str) -> Result<reqwest::Response, Error> {
        let http = self.client()?;
        self.send(&http, url, "*/*").await
    }
}

// One entry per machine user. The app and `quirkus mcp` share it, so the server reads what the app saved.
const KEYRING_SERVICE: &str = "io.github.kevinyhe.quirkus";
const KEYRING_USER: &str = "quercus-session";

fn keyring_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
}

fn keyring_set(value: &str) -> Result<(), ()> {
    keyring_entry().ok_or(())?.set_password(value).map_err(|_| ())
}

fn keyring_get() -> Option<Vec<u8>> {
    keyring_entry()?.get_password().ok().map(String::into_bytes)
}

fn keyring_delete() {
    if let Some(e) = keyring_entry() {
        let _ = e.delete_credential();
    }
}

/// Read the saved session: keychain first when enabled, then the file. Returns the raw JSON bytes.
fn read_secret(keychain: bool, file: &std::path::Path) -> Option<Vec<u8>> {
    if keychain {
        if let Some(b) = keyring_get() {
            return Some(b);
        }
    }
    std::fs::read(file).ok()
}

pub fn write_private(path: &std::path::Path, bytes: &[u8]) {
    let tmp = path.with_extension("tmp");
    if std::fs::write(&tmp, bytes).is_err() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    let _ = std::fs::rename(&tmp, path);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    /// A fake Quercus: serves canned (status, headers, body) per path, in order, and counts hits.
    fn serve(routes: Vec<(&'static str, u16, &'static str, String)>) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = format!("http://{}", listener.local_addr().unwrap());
        let hits = Arc::new(Mutex::new(Vec::new()));
        let (h, a) = (hits.clone(), addr.clone());
        std::thread::spawn(move || {
            let mut routes = routes;
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut line = String::new();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                reader.read_line(&mut line).unwrap();
                loop {
                    let mut l = String::new();
                    reader.read_line(&mut l).unwrap();
                    if l == "\r\n" || l.is_empty() {
                        break;
                    }
                }
                let path = line.split_whitespace().nth(1).unwrap_or("/").to_string();
                h.lock().unwrap().push(path.clone());
                let i = routes.iter().position(|r| path.starts_with(r.0)).expect("unexpected path");
                let (_, status, link, body) = routes.remove(i);
                let link = if link.is_empty() { String::new() } else { format!("Link: <{a}{link}>; rel=\"next\"\r\n") };
                let _ = write!(
                    stream,
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\n{link}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
            }
        });
        (addr, hits)
    }

    fn client(base: &str) -> Canvas {
        let dir = std::env::temp_dir().join(format!("qd-test-{}", key_hash(base)));
        let c = Canvas::with_base(base, dir.join("cache"), dir.join("config"));
        c.set_auth(Some(Auth::Token("t".into())));
        c
    }

    #[tokio::test]
    async fn follows_pagination_and_strips_json_guard() {
        let (base, hits) = serve(vec![
            ("/api/v1/courses?per_page=100", 200, "/api/v1/courses?page=2", "while(1);[{\"id\":1}]".into()),
            ("/api/v1/courses?page=2", 200, "/api/v1/courses?page=3", "[{\"id\":2}]".into()),
            ("/api/v1/courses?page=3", 200, "", "[{\"id\":3}]".into()),
        ]);
        let v = client(&base).fetch("/api/v1/courses").await.unwrap();
        assert_eq!(v, serde_json::json!([{"id":1},{"id":2},{"id":3}]));
        assert_eq!(hits.lock().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn permission_401_is_not_a_sign_out() {
        let (base, _) = serve(vec![
            ("/api/v1/a", 401, "", r#"{"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}"#.into()),
            ("/api/v1/b", 401, "", r#"{"status":"unauthenticated","errors":[{"message":"user authorization required"}]}"#.into()),
        ]);
        let c = client(&base);
        assert!(matches!(c.fetch("/api/v1/a").await, Err(Error::Status(403))));
        assert!(matches!(c.fetch("/api/v1/b").await, Err(Error::SignedOut)));
    }

    #[tokio::test]
    async fn retries_when_rate_limited() {
        let (base, hits) = serve(vec![
            ("/api/v1/x", 403, "", "403 Forbidden (Rate Limit Exceeded)".into()),
            ("/api/v1/x", 200, "", r#"{"ok":true}"#.into()),
        ]);
        let v = client(&base).fetch("/api/v1/x").await.unwrap();
        assert_eq!(v["ok"], true);
        assert_eq!(hits.lock().unwrap().len(), 2);
    }

    #[test]
    fn parses_link_header() {
        let mut h = HeaderMap::new();
        h.insert(LINK, HeaderValue::from_static(
            "<https://q.utoronto.ca/api/v1/x?page=1>; rel=\"current\",<https://q.utoronto.ca/api/v1/x?page=2>; rel=\"next\",<https://q.utoronto.ca/api/v1/x?page=9>; rel=\"last\"",
        ));
        assert_eq!(next_link(&h).as_deref(), Some("https://q.utoronto.ca/api/v1/x?page=2"));
    }

    #[test]
    fn session_round_trips_through_the_file_when_the_keychain_is_off() {
        let dir = std::env::temp_dir().join(format!("qd-secret-{}", key_hash("sr")));
        let _ = std::fs::remove_dir_all(&dir);
        let c = Canvas::with_base("http://x", dir.join("cache"), dir.join("cfg"));
        assert!(!c.has_auth());
        c.set_auth(Some(Auth::Token("tok".into())));
        assert!(c.has_auth());
        // A fresh instance over the same dir re-reads it from disk.
        assert!(Canvas::with_base("http://x", dir.join("cache"), dir.join("cfg")).has_auth());
        c.set_auth(None);
        assert!(!c.has_auth() && std::fs::metadata(dir.join("cfg").join("auth.json")).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_bad_paths() {
        assert!(valid_api_path("/api/v1/courses"));
        assert!(!valid_api_path("/login"));
        assert!(!valid_api_path("/api/v1/../x"));
    }
}
