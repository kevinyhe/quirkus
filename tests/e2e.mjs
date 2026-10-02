// End-to-end test of the RELEASE binary: real Rust client, cache, IPC, CSP and WebKitGTK rendering,
// against a local fake Quercus built from tests/fixtures.mjs. Uses an isolated profile, so it never
// touches your real sign-in or data. Linux/WSLg only (drives the window through X11).
// Needs a Python with python-xlib and pillow for tests/drive.py:
//   python3 -m venv .venv-e2e && .venv-e2e/bin/pip install python-xlib pillow
//   node tests/e2e.mjs [python] [drive.py] [out dir]     (defaults: .venv-e2e/bin/python tests/drive.py tests/shots/e2e)
import { spawn, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { ACORN } from "./fixtures.mjs";
import { startFakeQuercus } from "./fake-quercus.mjs";

const root = new URL("..", import.meta.url).pathname;
const [python = `${root}.venv-e2e/bin/python`, driver = `${root}tests/drive.py`, out = `${root}tests/shots/e2e`] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const BIN = new URL("../src-tauri/target/release/quirkus", import.meta.url).pathname;
const ID = "io.github.kevinyhe.quirkus";

// ---------- fake Quercus ----------
const fake = await startFakeQuercus();
const { base, hits, unknown } = fake;

// ---------- isolated profile ----------
const home = join(out, "profile");
rmSync(home, { recursive: true, force: true });
const cfg = join(home, "config", ID), data = join(home, "data", ID), acornDir = join(data, "acorn");
mkdirSync(cfg, { recursive: true });
mkdirSync(acornDir, { recursive: true });
writeFileSync(join(cfg, "auth.json"), JSON.stringify({ kind: "token", value: "e2e-token" }));
for (const [session, v] of Object.entries(ACORN.enrolled)) writeFileSync(join(acornDir, `enrolled_${session}.json`), JSON.stringify(v));
writeFileSync(join(acornDir, "history.json"), JSON.stringify(ACORN.history));
writeFileSync(join(acornDir, "notifications.json"), JSON.stringify(ACORN.notifications));
writeFileSync(join(acornDir, "synced_at"), String(Math.floor(Date.now() / 1000)));

// ---------- run the release app ----------
const STEP = 3000;
const TOUR = [["home", "/"], ["assignment", "/c/101/a/3001"], ["modules", "/c/101/modules"], ["pdf", "/c/101/f/5001"], ["timetable", "/acorn/timetable"], ["hidden-files", "/c/303/files"], ["settings", "/settings"]];
const app = spawn(BIN, [], {
  env: {
    ...process.env,
    QUERCUS_E2E_ROUTES: TOUR.map(([, r]) => r).join(","),
    QUERCUS_E2E_INTERVAL_MS: String(STEP),
    QUERCUS_BASE_URL: base,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    GDK_BACKEND: "x11",
    WEBKIT_DISABLE_DMABUF_RENDERER: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let appLog = "";
app.stdout.on("data", (d) => (appLog += d));
app.stderr.on("data", (d) => (appLog += d));
const t0 = Date.now();

// Async on purpose: a sync child process would block this event loop, and the fake server with it.
const run = promisify(execFile);
const drive = (...actions) => run(python, [driver, "Quirkus", "--no-focus", ...actions], { encoding: "utf8", timeout: 60000 });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failures.push(msg); };

try {
  // The app walks these screens itself (QUERCUS_E2E_ROUTES); we screenshot each one mid-way.
  const shot = (name) => drive(`shot:${out}/e2e-${name}.png`);
  const at = async (ms) => { const wait = t0 + ms - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); };
  for (const [i, [name]] of TOUR.entries()) {
    await at(5000 + i * STEP + STEP - 700);
    await shot(name);
  }
  check(hits.some((h) => h.startsWith("/api/v1/courses?")), `home loaded courses through the Rust client (${hits.length} requests)`);
  check(fake.authOk(), "every request carried the stored token");
  check(hits.some((h) => h.startsWith("/api/v1/courses/101/assignments/3001")), "assignment page fetched its data");
  check(hits.some((h) => h.startsWith("/courses/101/files/5002/preview")), "embedded image fetched through the qc:// proxy");
  check(hits.some((h) => h.startsWith("/files/5001/download")), "PDF bytes downloaded through file_bytes");
  check(["5002", "5003"].every((id) => hits.some((h) => h.startsWith(`/files/${id}/download`))), "opening Modules downloaded its files in the background");
  check(app.exitCode === null, "app still running (no crash)");

  // PSS splits shared libraries fairly between processes; RSS would count WebKit's libraries once per process.
  const pss = (pid) => {
    try {
      return Number(execFileSync("sh", ["-c", `grep '^Pss:' /proc/${pid}/smaps_rollup | awk '{print $2}'`], { encoding: "utf8" }).trim()) || 0;
    } catch {
      return 0;
    }
  };
  const kids = execFileSync("sh", ["-c", `pgrep -P ${app.pid} || true`], { encoding: "utf8" }).split("\n").filter(Boolean).map(Number);
  const total = pss(app.pid) + kids.reduce((n, k) => n + pss(k), 0);
  console.log(`info memory (PSS): ${Math.round(total / 1024)} MB across ${1 + kids.length} processes`);
  console.log(`info binary: ${(statSync(BIN).size / 1048576).toFixed(1)} MB; ran ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (unknown.length) console.log(`info unmocked paths: ${[...new Set(unknown)].join(", ")}`);
  const panics = appLog.match(/panicked.*|thread '.*' panicked.*/g);
  check(!panics, `no Rust panics${panics ? ": " + panics.join(" | ") : ""}`);
} catch (e) {
  failures.push(String(e.message ?? e));
  console.log("FAIL", e.message ?? e, "\n", appLog.slice(-2000));
} finally {
  app.kill();
  fake.close();
}
console.log(failures.length ? `\n${failures.length} failing` : "\nrelease build passed end-to-end");
process.exit(failures.length ? 1 : 0);
