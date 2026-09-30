// End-to-end test of the WINDOWS build, run with Windows' own Node:
//   node.exe tests\e2e-windows.mjs <path\to\quirkus.exe> [out dir]
// Starts a fake Quercus on Windows localhost, launches the app with an isolated profile
// (QUERCUS_PROFILE_DIR), and drives the real WebView2 over its remote-debugging port.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";
import { ACORN } from "./fixtures.mjs";
import { startFakeQuercus } from "./fake-quercus.mjs";

const exe = process.argv[2];
const out = process.argv[3] ?? join(os.tmpdir(), "quercus-e2e");
mkdirSync(out, { recursive: true });
const PORT_CDP = 9333;

// ---------- fake Quercus ----------
const fake = await startFakeQuercus({ pdfText: "Rendered by the Windows build" });
const { base, hits, unknown } = fake;

// ---------- isolated profile ----------
const profile = join(out, "profile");
rmSync(profile, { recursive: true, force: true });
const acornDir = join(profile, "data", "acorn");
mkdirSync(join(profile, "config"), { recursive: true });
mkdirSync(acornDir, { recursive: true });
writeFileSync(join(profile, "config", "auth.json"), JSON.stringify({ kind: "token", value: "e2e-token" }));
for (const [session, v] of Object.entries(ACORN.enrolled)) writeFileSync(join(acornDir, `enrolled_${session}.json`), JSON.stringify(v));
writeFileSync(join(acornDir, "history.json"), JSON.stringify(ACORN.history));
// Marked as synced 7 hours ago, so launching starts a real ACORN sync (hidden windows). That once
// deadlocked the Windows app's main thread; every check below now also proves the UI stays responsive during it.
writeFileSync(join(acornDir, "synced_at"), String(Math.floor(Date.now() / 1000) - 7 * 3600));

// ---------- launch ----------
const app = spawn(exe, [], {
  env: {
    ...process.env,
    QUERCUS_BASE_URL: base,
    QUERCUS_PROFILE_DIR: profile,
    // Separate WebView2 data too, so a test run never collides with a real running copy of the app.
    WEBVIEW2_USER_DATA_FOLDER: join(profile, "webview2"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT_CDP}`,
  },
  stdio: "ignore",
});

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  for (let i = 0; i < 40 && !browser; i++) {
    await sleep(500);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT_CDP}`).catch(() => undefined);
  }
  check(!!browser, "connected to the app's WebView2");
  if (!browser) throw new Error("no WebView2 debugging port; is WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS honoured?");

  let page;
  for (let i = 0; i < 20 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("tauri.localhost"));
    if (!page) await sleep(300);
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.waitForSelector(".shell", { timeout: 15000 });
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, sw: screen.availWidth, sh: screen.availHeight }));
  console.log(`info window ${vp.w}×${vp.h} CSS px at ${vp.dpr}× scaling; screen ${vp.sw}×${vp.sh}`);
  check(await page.locator(".sidebar").isVisible(), "sidebar visible at the default window size");

  const visit = async (name, hash, waitFor) => {
    errors.length = 0;
    await page.evaluate((h) => (location.hash = h), hash);
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => errors.push(`never showed ${waitFor}`));
    await sleep(600);
    const stuck = await page.locator("main .loading").count();
    const bad = await page.locator("main .note.bad").allTextContents();
    await page.screenshot({ path: join(out, `win-${name}.png`) });
    const problems = [...errors, ...(stuck ? [`${stuck} stuck loaders`] : []), ...bad];
    check(!problems.length, `${name}${problems.length ? ": " + problems.join(" | ") : ""}`);
  };

  const started = Date.now();
  await visit("home", "/", ".course-row");
  check(Date.now() - started < 8000, `home loaded while an ACORN sync was running (${Date.now() - started} ms)`);
  check(fake.authOk() && hits.some((h) => h.startsWith("/api/v1/courses?")), "requests reached Quercus with the stored token");
  await visit("assignment", "/c/101/a/3001", ".prose");
  const img = await page.locator(".prose img").first().evaluate((el) => ({ src: el.getAttribute("src"), w: el.naturalWidth })).catch(() => null);
  check(img?.src?.startsWith("http://qc.localhost/") && img.w > 0, `embedded image loaded through the qc proxy (${img?.src}, ${img?.w}px)`);
  await visit("modules", "/c/101/modules", ".module");
  await sleep(1500);
  check(["5001", "5002", "5003"].every((id) => hits.some((h) => h.startsWith(`/files/${id}/download`))), "opening Modules downloaded its files in the background");
  await visit("pdf", "/c/101/f/5001", ".pdf-page canvas");
  await visit("image", "/c/101/f/5002", "img.full");
  await visit("text", "/c/101/f/5003", "pre.text");
  // Either layout: a tiling window manager may make the window narrow, which switches to the per-day list.
  await visit("timetable", "/acorn/timetable", ".tt-block:visible, .narrow-only .item:visible");
  await visit("history", "/acorn/history", "table.grid");
  await visit("grades", "/c/101/grades", "table.grid");
  errors.length = 0;
  await page.evaluate(() => (location.hash = "/c/303/files"));
  await sleep(800);
  const note = await page.locator("main .note").allTextContents();
  check(note.some((t) => t.includes("hides its Files tab")), "hidden Files tab shows a notice, no re-login");
  await page.screenshot({ path: join(out, "win-hidden-files.png") });
  check(app.exitCode === null, "app still running");
  if (unknown.length) console.log(`info unmocked: ${[...new Set(unknown)].join(", ")}`);
} catch (e) {
  failures.push(String(e.message ?? e));
  console.log("FAIL", e.message ?? e);
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  fake.close();
}
console.log(failures.length ? `\n${failures.length} failing` : "\nWindows build passed end-to-end");
process.exit(failures.length ? 1 : 0);
