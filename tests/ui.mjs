// Loads every screen of the real UI in headless Chromium against a fake Tauri backend.
// Fails on JS errors, stuck loading states, unexpected error notes, or API paths the fixtures don't know.
//   node tests/ui.mjs            run checks
//   node tests/ui.mjs --shots    also save screenshots to tests/shots/
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { route, FILE_KIND, ACORN } from "./fixtures.mjs";

const SHOTS = process.argv.includes("--shots");
const OUT = new URL("./shots/", import.meta.url).pathname;
if (SHOTS) mkdirSync(OUT, { recursive: true });

// ---------- sample files ----------

function pdf(pages) {
  const objs = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, i) => {
    const stream = `BT /F1 28 Tf 72 700 Td (${text}) Tj ET BT /F1 14 Tf 72 660 Td (Page ${i + 1} of the test deck.) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAQklEQVR42u3PQQ0AAAgEoNe/tFr4CiaQnwSFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhcULBu1AAQfXHD0AAAAASUVORK5CYII=",
  "base64",
);
const TEXT = Buffer.from('"""Problem Set 3 starter."""\n\nimport heapq\n\n\ndef k_way_merge(lists: list[list[int]]) -> list[int]:\n    # TODO: use a min-heap of (value, list index, position)\n    raise NotImplementedError\n');
const BYTES = { pdf: pdf(["Lecture 1: Introduction", "Asymptotic notation", "Heaps"]), png: PNG, text: TEXT, docx: Buffer.from("PK") };

// ---------- fake backend ----------

const unmocked = new Set();
const apiLog = [];
const prefetched = new Set();

function backend(cmd, args) {
  switch (cmd) {
    case "session":
      return { ok: globalThis.signedIn ?? true };
    case "api_get": {
      apiLog.push(args.path);
      if (globalThis.offline) return { err: "offline" };
      try {
        const v = route(args.path);
        if (v === undefined) {
          unmocked.add(args.path);
          return { err: "http-404" };
        }
        return { ok: v };
      } catch (e) {
        return { err: String(e) };
      }
    }
    case "file_bytes":
      return { b64: BYTES[FILE_KIND[args.fileId]].toString("base64") };
    case "prefetch_files":
      for (const id of args.fileIds) prefetched.add(id);
      return { ok: null };
    case "mcp_info":
      return { ok: { exe: "C:\\Users\\you\\AppData\\Local\\Quirkus\\quirkus.exe", os: "windows" } };
    case "acorn_data":
      return { ok: globalThis.acornEmpty ? { syncedAt: null, state: "idle", note: "", registrations: null, enrolled: {}, notifications: null, profile: null, history: null } : ACORN };
    case "plugin:event|listen":
      return { ok: Math.floor(Math.random() * 1e9) };
    default:
      return { ok: null };
  }
}

const SHIM = () => {
  let cb = 0;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (fn) => {
      const id = ++cb;
      window[`_${id}`] = fn;
      return id;
    },
    unregisterCallback: (id) => delete window[`_${id}`],
    convertFileSrc: (p) => p,
    invoke: async (cmd, args) => {
      const r = await window.__backend(cmd, args ?? {});
      if (r.err !== undefined) throw r.err;
      if (r.b64 !== undefined) return Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0)).buffer;
      return r.ok;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
};

// ---------- screens ----------

const SCREENS = [
  ["home", "/"],
  ["due", "/due"],
  ["inbox", "/inbox"],
  ["conversation", "/inbox/9001"],
  ["settings", "/settings"],
  ["acorn", "/acorn"],
  ["timetable", "/acorn/timetable", { waitFor: ".tt-block:visible, .narrow-only .item:visible" }],
  ["history", "/acorn/history", { waitFor: "table.grid" }],
  ["course-modules-home", "/c/101"],
  ["course-page-home", "/c/202"],
  ["course-syllabus-home", "/c/303"],
  ["announcements", "/c/101/announcements"],
  ["announcement", "/c/101/d/7001"],
  ["discussions", "/c/101/discussions"],
  ["discussion", "/c/101/d/7101"],
  ["assignments", "/c/101/assignments"],
  ["assignment", "/c/101/a/3001"],
  ["assignment-graded", "/c/101/a/3002"],
  ["grades", "/c/101/grades"],
  ["grades-unweighted", "/c/303/grades"],
  ["modules", "/c/101/modules"],
  ["files", "/c/101/files"],
  ["files-subfolder", "/c/101/files/6002"],
  ["files-hidden", "/c/303/files", { expectNote: true }],
  ["pages", "/c/101/pages"],
  ["page", "/c/101/p/course-policies"],
  ["syllabus", "/c/303/syllabus"],
  ["file-pdf", "/c/101/f/5001", { waitFor: ".pdf-page canvas" }],
  ["file-image", "/c/101/f/5002", { waitFor: "img.full" }],
  ["file-text", "/c/101/f/5003", { waitFor: "pre.text" }],
  ["file-docx", "/c/101/f/5004", { expectNote: true }],
  ["file-no-course", "/f/5001", { waitFor: ".pdf-page canvas" }],
];

// ---------- run ----------

const server = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname, server: { port: 1431, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;

async function session(scheme, viewport = { width: 1320, height: 860 }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.exposeFunction("__backend", backend);
  await ctx.addInitScript(SHIM);
  // Start with Week 5 and the CSC263 tree open so the sidebar shows its depth.
  await ctx.addInitScript(() => localStorage.setItem("tree", JSON.stringify({ c101: true, m101: true, mod402: true })));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // qc:// is the app's authenticated image proxy; only the real Tauri webview knows it. Checked separately below.
  page.on("console", (m) => m.type() === "error" && !m.text().includes("ERR_UNKNOWN_URL_SCHEME") && errors.push(`console: ${m.text()}`));
  await page.goto("http://127.0.0.1:1431/#/");
  await page.waitForSelector(".shell");
  return { ctx, page, errors };
}

async function check(page, errors, [name, path, opts = {}], scheme) {
  errors.length = 0;
  await page.evaluate((p) => (location.hash = p), path);
  if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 8000 }).catch(() => errors.push(`never showed ${opts.waitFor}`));
  await page.waitForTimeout(450);
  const stuck = await page.locator("main .loading").count();
  const bad = await page.locator("main .note.bad").allTextContents();
  const notes = await page.locator("main .note").allTextContents();
  const problems = [...errors];
  if (stuck) problems.push(`${stuck} loading placeholder(s) never resolved`);
  if (bad.length) problems.push(`error shown: ${bad.join(" | ")}`);
  if (opts.expectNote && !notes.length) problems.push("expected a notice, got none");
  const overflow = await page.evaluate(() => {
    const m = document.getElementById("main");
    return m ? m.scrollWidth - m.clientWidth : 0;
  });
  if (overflow > 1) problems.push(`content is ${overflow}px wider than the window`);
  if (!opts.expectNote && notes.length) problems.push(`unexpected notice: ${notes.join(" | ")}`);
  if (SHOTS) await page.screenshot({ path: `${OUT}${scheme}-${name}.png` });
  console.log(`${problems.length ? "FAIL" : "ok  "} ${scheme.padEnd(5)} ${name}${problems.length ? "\n       " + problems.join("\n       ") : ""}`);
  failures += problems.length ? 1 : 0;
}

for (const scheme of ["light", "dark"]) {
  const { ctx, page, errors } = await session(scheme);
  for (const s of scheme === "light" ? SCREENS : SCREENS.filter(([n]) => ["home", "assignment", "modules", "file-pdf", "grades", "timetable"].includes(n))) {
    await check(page, errors, s, scheme);
  }
  if (scheme === "light") {
    // Search palette: open, type, check results, open one.
    await page.evaluate(() => (location.hash = "/"));
    await page.keyboard.press("Control+k");
    await page.keyboard.type("heap");
    await page.waitForTimeout(300);
    const hits = await page.locator(".palette li").allTextContents();
    const okPalette = hits.some((h) => h.includes("Problem Set 3")) && hits.some((h) => h.includes("Heap diagram"));
    if (SHOTS) await page.screenshot({ path: `${OUT}light-palette.png` });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const landed = await page.evaluate(() => location.hash);
    console.log(`${okPalette ? "ok  " : "FAIL"} light palette (${hits.length} results, Enter → ${landed})`);
    failures += okPalette ? 0 : 1;

    // In-content links route inside the app.
    await page.evaluate(() => (location.hash = "/c/101/a/3001"));
    await page.waitForSelector(".prose a");
    // Embedded Quercus images point at the qc:// proxy.
    const src = await page.locator(".prose img").first().getAttribute("src");
    const okImg = src === "qc://localhost/courses/101/files/5002/preview";
    console.log(`${okImg ? "ok  " : "FAIL"} light embedded image routed through proxy (${src})`);
    failures += okImg ? 0 : 1;

    // Sanitizer: no script tags, no inline handlers, no inline styles.
    const html = await page.locator(".prose").first().innerHTML();
    const okSafe = !/<script|onclick=|style=/.test(html);
    console.log(`${okSafe ? "ok  " : "FAIL"} light sanitizer strips script/handlers/styles`);
    failures += okSafe ? 0 : 1;
    await page.locator(".prose a", { hasText: "Course policies" }).click();
    await page.waitForTimeout(200);
    const linked = await page.evaluate(() => location.hash);
    const okLink = linked === "#/c/101/p/course-policies";
    console.log(`${okLink ? "ok  " : "FAIL"} light in-content link → ${linked}`);
    failures += okLink ? 0 : 1;

  }
  await ctx.close();
}

// Narrow window: drawer instead of sidebar, no horizontal overflow.
{
  const { ctx, page, errors } = await session("light", { width: 620, height: 820 });
  const hidden = await page.locator(".sidebar").evaluate((el) => getComputedStyle(el).visibility);
  for (const s of SCREENS.filter(([n]) => ["home", "due", "assignments", "assignment", "grades", "files", "modules", "file-pdf", "acorn", "discussion", "timetable", "history"].includes(n))) {
    await check(page, errors, s, "narrow");
  }
  await page.locator(".topbar button[title^='Show or hide']").click();
  await page.waitForTimeout(250);
  const shown = await page.locator(".sidebar").evaluate((el) => getComputedStyle(el).visibility);
  if (SHOTS) await page.screenshot({ path: `${OUT}narrow-drawer.png` });
  await page.locator(".sidebar a[href='#/due']").click();
  await page.waitForTimeout(250);
  const closed = await page.locator(".shell.drawer").count();
  const ok = hidden === "hidden" && shown === "visible" && closed === 0;
  console.log(`${ok ? "ok  " : "FAIL"} narrow drawer (starts ${hidden}, opens ${shown}, closes on navigate: ${closed === 0})`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

// Wide window: Ctrl+\ collapses the sidebar and pages use the space.
{
  const { ctx, page } = await session("light");
  await page.evaluate(() => (location.hash = "/c/101/assignments"));
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+\\");
  await page.waitForTimeout(150);
  const collapsed = await page.locator(".shell.collapsed").count();
  const sidebarShown = await page.locator(".sidebar").isVisible();
  if (SHOTS) await page.screenshot({ path: `${OUT}light-collapsed.png` });
  await page.keyboard.press("Control+\\");
  const ok = collapsed === 1 && !sidebarShown && (await page.locator(".shell.collapsed").count()) === 0;
  console.log(`${ok ? "ok  " : "FAIL"} light sidebar collapse toggle`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

// Back restores scroll position.
{
  const { ctx, page } = await session("light", { width: 1100, height: 460 });
  await page.evaluate(() => (location.hash = "/c/101/modules"));
  await page.waitForSelector(".module");
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById("main").scrollTo(0, 420));
  await page.waitForTimeout(50);
  const before = await page.evaluate(() => document.getElementById("main").scrollTop);
  await page.locator("main a.item", { hasText: "ps3_starter.py" }).click();
  await page.waitForSelector("pre.text");
  const top = await page.evaluate(() => document.getElementById("main").scrollTop);
  await page.goBack();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => document.getElementById("main").scrollTop);
  const ok = before > 100 && top === 0 && Math.abs(after - before) < 4;
  console.log(`${ok ? "ok  " : "FAIL"} light scroll restore (was ${before}, new page ${top}, back ${after})`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

// Hovering a link loads that screen's data before the click.
{
  const { ctx, page } = await session("light");
  await page.waitForTimeout(400);
  apiLog.length = 0;
  await page.locator(".sidebar a[href='#/c/303']").hover();
  await page.waitForTimeout(200);
  const fetched = apiLog.filter((p) => p.startsWith("/api/v1/courses/303"));
  const ok = fetched.some((p) => p.includes("/modules")) && fetched.some((p) => p.includes("/tabs"));
  console.log(`${ok ? "ok  " : "FAIL"} light hover prefetch (${fetched.length} requests before click)`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

// Timetable content: the right classes land on the right days, and terms switch.
{
  const { ctx, page } = await session("light");
  await page.evaluate(() => (location.hash = "/acorn/timetable"));
  await page.waitForSelector(".tt-block");
  const fall = await page.locator(".tt-day").evaluateAll((days) => days.map((d) => [...d.querySelectorAll(".tt-block strong")].map((s) => s.textContent)));
  await page.locator(".seg button", { hasText: "Winter" }).click();
  await page.waitForTimeout(100);
  const winter = await page.locator(".tt-block strong").allTextContents();
  const waitTag = await page.locator("text=Waitlist #4").count();
  const ok =
    fall[0].join() === "CSC263H1" && // Monday: CSC263 lecture; STA247 is winter-only
    fall[1].includes("MAT237Y1") && fall[1].includes("CSC258H1") && // Tuesday: MAT237 + waitlisted CSC258
    fall[2].filter((c) => c).length === 2 && // Wednesday: CSC263 + MAT237 overlap side by side
    winter.includes("STA247H1") && !winter.includes("CSC263H1") && winter.includes("MAT237Y1");
  console.log(`${ok ? "ok  " : "FAIL"} light timetable placement (Mon ${fall[0]} | Tue ${fall[1]} | Wed ${fall[2]} | winter ${[...new Set(winter)]})`);
  failures += ok ? 0 : 1;
  const okWait = waitTag === 0; // waitlisted course is fall; winter view shouldn't list it
  await page.locator(".seg button", { hasText: "Fall" }).click();
  const waitFall = await page.locator("text=Waitlist #4").count();
  console.log(`${okWait && waitFall === 1 ? "ok  " : "FAIL"} light waitlist shown in its term only`);
  failures += okWait && waitFall === 1 ? 0 : 1;

  await page.evaluate(() => (location.hash = "/acorn/history"));
  await page.waitForSelector("table.grid");
  const avg = await page.locator(".fact", { hasText: "Average" }).textContent();
  const okAvg = avg.includes("76.8"); // (86+78+64+82+74)/5
  console.log(`${okAvg ? "ok  " : "FAIL"} light history average (${avg.trim()})`);
  failures += okAvg ? 0 : 1;
  await ctx.close();
}

// Before the first ACORN sync: screens explain instead of breaking.
{
  globalThis.acornEmpty = true;
  const { ctx, page, errors } = await session("light");
  for (const s of [["acorn-empty", "/acorn"], ["timetable-empty", "/acorn/timetable"], ["history-empty", "/acorn/history"], ["home-no-acorn", "/"]]) {
    await check(page, errors, s, "light");
  }
  globalThis.acornEmpty = false;
  await ctx.close();
}

// Opening modules starts background downloads of their files, including the large module's items.
{
  prefetched.clear();
  const { ctx, page } = await session("light");
  await page.evaluate(() => (location.hash = "/c/101/modules"));
  await page.waitForSelector(".module");
  await page.waitForTimeout(500);
  const ok = [5001, 5002, 5003, 5004].every((id) => prefetched.has(id));
  console.log(`${ok ? "ok  " : "FAIL"} light module files prefetched (${[...prefetched].join(", ")})`);
  failures += ok ? 0 : 1;
  // Sidebar tree: the large module (no items in the list response) loads its own items when expanded.
  await page.locator(".sidebar .row", { hasText: "Past exams" }).locator(".caret").click();
  await page.waitForTimeout(300);
  const rows = await page.locator(".sidebar .row", { hasText: "Past exam 2019" }).count();
  console.log(`${rows ? "ok  " : "FAIL"} light tree loads large module items (${rows})`);
  failures += rows ? 0 : 1;
  await ctx.close();
}

// Offline with nothing cached: a clear message, no loading bars left spinning.
{
  globalThis.offline = true;
  const { ctx, page, errors } = await session("light");
  await page.waitForTimeout(500);
  const stuck = await page.locator("main .loading").count();
  const text = (await page.locator("main .note").allTextContents()).join(" | ");
  const ok = stuck === 0 && text.includes("Can't reach Quercus") && !text.includes("saved last time") && !errors.length;
  if (SHOTS) await page.screenshot({ path: `${OUT}light-offline.png` });
  console.log(`${ok ? "ok  " : "FAIL"} light offline home (${stuck} stuck loaders; "${text.slice(0, 60)}…")`);
  failures += ok ? 0 : 1;
  globalThis.offline = false;
  await ctx.close();
}

// Search ranks title matches above course-code matches ("3" is in CSC263).
{
  const { ctx, page } = await session("light");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Problem Set 3");
  await page.waitForTimeout(400);
  const first = await page.locator(".palette li").first().textContent();
  const ok = first.includes("Problem Set 3");
  console.log(`${ok ? "ok  " : "FAIL"} light search ranking (first: ${first.trim().slice(0, 50)})`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

// Signed-out: login screen.
{
  globalThis.signedIn = false;
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 860 } });
  await ctx.exposeFunction("__backend", backend);
  await ctx.addInitScript(SHIM);
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:1431/#/");
  const ok = await page.waitForSelector(".signin button.solid", { timeout: 5000 }).then(() => true, () => false);
  if (SHOTS) await page.screenshot({ path: `${OUT}light-signin.png` });
  console.log(`${ok ? "ok  " : "FAIL"} light signin`);
  failures += ok ? 0 : 1;
  await ctx.close();
}

if (unmocked.size) {
  console.log(`\nFAIL API paths the UI requested that fixtures don't cover:\n  ${[...unmocked].join("\n  ")}`);
  failures++;
}

await browser.close();
await server.close();
console.log(failures ? `\n${failures} failing check(s)` : "\nall screens loaded cleanly");
process.exit(failures ? 1 : 0);
