// Loads every screen of the real UI in headless Chromium against a fake Tauri backend.
// Fails on JS errors, stuck loading states, unexpected error notes, or API paths the fixtures don't know.
//   node tests/ui.mjs            run checks
//   node tests/ui.mjs --shots    also save screenshots to tests/shots/
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";
import * as XLSX from "xlsx";
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

// Minimal but valid Office files, built here so the tests need no binary fixtures.
const zip = (files) => Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v]))));
const DOCX = zip({
  "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Extra reading on binomial heaps</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Read chapter 19 before lecture.</w:t></w:r></w:p></w:body></w:document>`,
});
const slideXml = (title, lines, pic = "") =>
  `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree>` +
  `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp>` +
  `<p:sp><p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${lines.map((l) => `<a:p><a:r><a:t>${l}</a:t></a:r></a:p>`).join("")}</p:txBody></p:sp>${pic}</p:spTree></p:cSld></p:sld>`;
const PPTX = zip({
  // Listed second-slide-first: the viewer has to follow presentation.xml, not the file names.
  "ppt/presentation.xml": `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
  "ppt/_rels/presentation.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`,
  "ppt/slides/slide1.xml": slideXml("Heapify", ["Sift down from the last parent", "Runs in linear time"], `<p:pic><p:blipFill><a:blip r:embed="rId9"/></p:blipFill></p:pic>`),
  "ppt/slides/slide2.xml": slideXml("Week 5: Heaps", ["Priority queues", "Binary heaps"]),
  "ppt/slides/_rels/slide1.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Target="../media/image1.png"/></Relationships>`,
  "ppt/media/image1.png": PNG,
});
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Item", "Weight", "Mark"], ["Problem sets", 40, 36.5], ["Term tests", 30, 24.6]]), "Marks");
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Letter", "From"], ["A+", 90], ["A", 85]]), "Scale");
const XLSXB = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
const IPYNB = Buffer.from(JSON.stringify({ metadata: { kernelspec: { language: "python" } }, nbformat: 4, cells: [
  { cell_type: "markdown", source: ["# Lab 2\n", "Build a **min-heap**."] },
  { cell_type: "code", source: ["import heapq\n", "print(heapq.nsmallest(2, [5, 1, 4]))"], outputs: [{ output_type: "stream", name: "stdout", text: ["[1, 4]\n"] }] },
  { cell_type: "code", source: "plot()", outputs: [{ output_type: "display_data", data: { "image/png": PNG.toString("base64") } }] },
] }));
const BYTES = {
  pdf: pdf(["Lecture 1: Introduction", "Asymptotic notation", "Heaps"]), png: PNG, text: TEXT, docx: DOCX, pptx: PPTX, xlsx: XLSXB,
  csv: Buffer.from('Section,Room\nTUT0101,"BA 1200, north"\nTUT0201,SS 2105\n'),
  ipynb: IPYNB,
  md: Buffer.from("# Starter code\n\nRun `python ps3_starter.py`.\n\n- [x] heaps\n- [ ] merge\n\n<script>window.pwned = 1</script>\n"),
  zip: zip({ "ps3/starter.py": "print('hi')\n", "ps3/tests/test_heap.py": "assert True\n", "ps3/README.md": "# PS3\n" }),
  binary: Buffer.from([0x50, 0x4b, 0, 0, 1, 2, 0, 255]),
};

// ---------- fake backend ----------

const unmocked = new Set();
const apiLog = [];
const prefetched = new Set();
/** Every backend command the UI ran that changes something or leaves the app: [command, args]. */
const calls = [];
const called = (cmd) => calls.filter((c) => c[0] === cmd).map((c) => c[1]);

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
    case "notify_prefs":
      return { ok: { enabled: true, announcements: true, grades: true, messages: true, due: true, due_hours: 24 } };
    case "save_calendar":
      calls.push([cmd, args]);
      return { ok: "/home/you/Downloads/Quercus/Quirkus timetable.ics" };
    case "open_url":
    case "set_notify_prefs":
    case "notify_test":
    case "login_sso":
    case "acorn_sync":
    case "plugin:webview|set_webview_zoom":
      calls.push([cmd, args]);
      return { ok: null };
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
  ["file-docx", "/c/101/f/5004", { waitFor: ".doc .prose" }],
  ["file-pptx", "/c/101/f/5005", { waitFor: ".slide" }],
  ["file-xlsx", "/c/101/f/5006", { waitFor: ".sheet td" }],
  ["file-csv", "/c/101/f/5007", { waitFor: ".sheet td" }],
  ["file-notebook", "/c/101/f/5008", { waitFor: ".nb-cell" }],
  ["file-markdown", "/c/101/f/5009", { waitFor: ".doc .prose h1" }],
  ["file-zip", "/c/101/f/5010", { waitFor: ".viewer table.grid td" }],
  ["file-unknown-text", "/c/101/f/5011", { waitFor: "pre.text" }],
  ["file-unsupported", "/c/101/f/5012", { expectNote: true }],
  ["file-no-course", "/f/5001", { waitFor: ".pdf-page canvas" }],
];

// ---------- run ----------

const server = await createServer({ configFile: new URL("../vite.config.ts", import.meta.url).pathname, server: { port: 1431, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch();
let failures = 0;

async function session(scheme, viewport = { width: 1320, height: 860 }, { fresh = false } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.exposeFunction("__backend", backend);
  await ctx.addInitScript(SHIM);
  // Start with Week 5 and the CSC263 tree open so the sidebar shows its depth.
  await ctx.addInitScript(() => localStorage.setItem("tree", JSON.stringify({ c101: true, m101: true, mod402: true })));
  // Everyone but the welcome-tour test has already been through the tour. Don't overwrite settings a test changed.
  if (!fresh) await ctx.addInitScript(() => localStorage.getItem("prefs") ?? localStorage.setItem("prefs", JSON.stringify({ onboarded: true })));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  // qc:// is the app's authenticated image proxy; only the real Tauri webview knows it. Checked separately below.
  page.on("console", (m) => m.type() === "error" && !m.text().includes("ERR_UNKNOWN_URL_SCHEME") && errors.push(`console: ${m.text()}`));
  await page.goto("http://127.0.0.1:1431/#/");
  await page.waitForSelector(fresh ? ".welcome" : ".shell");
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

// Everything that expands and collapses does both, including the course you're currently looking at.
{
  const { ctx, page } = await session("light");
  const results = [];
  const note = (ok, what) => results.push(`${ok ? "" : "BROKEN "}${what}`);
  const side = (text) => page.locator(".sidebar .row", { hasText: text });
  const count = (text) => side(text).count();
  const click = async (text) => { await side(text).first().locator(".caret").click(); await page.waitForTimeout(250); };

  await page.evaluate(() => (location.hash = "/due"));
  await page.waitForTimeout(300);
  note((await count("Assignments")) > 0, "course starts open");
  await click("CSC263H1");
  note((await count("Assignments")) === 0, "course collapses from another screen");
  await click("CSC263H1");
  note((await count("Assignments")) > 0, "course expands again");

  await page.evaluate(() => (location.hash = "/c/101/modules"));
  await page.waitForSelector(".module");
  await page.waitForTimeout(300);
  await click("CSC263H1");
  note((await count("Assignments")) === 0, "course collapses while it's the open course");
  await click("CSC263H1");
  await side("Modules").first().locator(".caret").click();
  await page.waitForTimeout(250);
  note((await count("Week 5")) === 0, "sidebar Modules collapses while on the Modules screen");
  await side("Modules").first().locator(".caret").click();
  await page.waitForTimeout(250);
  note((await count("Week 5")) > 0, "sidebar Modules expands again");
  const folder = page.locator(".sidebar .row", { hasText: "Week 5" }).first();
  const before = await page.locator(".sidebar .row").count();
  await folder.locator(".caret").click();
  await page.waitForTimeout(250);
  const mid = await page.locator(".sidebar .row").count();
  await folder.locator(".label").click();
  await page.waitForTimeout(250);
  const after = await page.locator(".sidebar .row").count();
  note(mid !== before && after === before, `sidebar module folder toggles by caret and by name (${before} → ${mid} → ${after})`);

  const head = page.locator("main .module-head").first();
  const bodies = () => page.locator("main .module-body").count();
  const open0 = await bodies();
  await head.click();
  await page.waitForTimeout(200);
  const open1 = await bodies();
  await head.click();
  await page.waitForTimeout(200);
  note(open1 === open0 - 1 && (await bodies()) === open0, "module section toggles");
  await page.getByRole("button", { name: "Collapse all" }).click();
  await page.waitForTimeout(200);
  note((await bodies()) === 0, "Collapse all");
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.waitForTimeout(200);
  note((await bodies()) === (await page.locator("main .module").count()), "Expand all");
  await head.click();
  await page.evaluate(() => (location.hash = "/due"));
  await page.waitForTimeout(200);
  await page.evaluate(() => (location.hash = "/c/101/modules"));
  await page.waitForSelector(".module");
  await page.waitForTimeout(300);
  note((await bodies()) === (await page.locator("main .module").count()) - 1, "collapsed module stays collapsed when you come back");

  const broken = results.filter((r) => r.startsWith("BROKEN"));
  console.log(`${broken.length ? "FAIL" : "ok  "} light dropdowns (${results.length} checks)${broken.length ? "\n       " + broken.join("\n       ") : ""}`);
  failures += broken.length ? 1 : 0;
  await ctx.close();
}

// Common document types open in the app and show their real contents.
// The page gets the app's own script policy here, because the dev server has none: a library that
// builds code from strings would pass every other test and then fail inside the real app.
{
  const policy = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")).app.security.csp["script-src"];
  const { ctx, page } = await session("light");
  await ctx.route((u) => u.pathname === "/", async (r) => {
    const res = await r.fetch();
    await r.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": `script-src ${policy}` } });
  });
  // Record everything the policy blocks, from inside the page.
  await ctx.addInitScript(() => {
    window.__blocked = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__blocked.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`));
  });
  await page.reload();
  await page.waitForSelector(".shell");
  // Proof the policy is on: a timer given a string of code is refused. (page.evaluate itself is exempt.)
  await page.evaluate(() => setTimeout("window.__ran = 1", 0));
  await page.waitForTimeout(100);
  const enforced = await page.evaluate(() => !window.__ran && window.__blocked.length === 1);
  await page.evaluate(() => (window.__blocked.length = 0));
  const results = [];
  const see = async (path, selector, wants) => {
    await page.evaluate((p) => (location.hash = p), path);
    await page.waitForSelector(selector, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(200);
    const text = await page.locator("main .viewer").innerText().catch(() => "");
    const missing = wants.filter((w) => !text.includes(w));
    if (missing.length) results.push(`${path}: missing ${missing.map((m) => JSON.stringify(m)).join(", ")} in ${JSON.stringify(text.slice(0, 160))}`);
    return text;
  };
  await see("/c/101/f/5004", ".doc .prose", ["Extra reading on binomial heaps", "Read chapter 19 before lecture."]);
  const slides = await see("/c/101/f/5005", ".slide", ["Week 5: Heaps", "Binary heaps", "Heapify", "Runs in linear time"]);
  if (slides.indexOf("Week 5: Heaps") > slides.indexOf("Heapify")) results.push("pptx: slides aren't in presentation order");
  if ((await page.locator(".slide img").count()) !== 1) results.push("pptx: the slide picture isn't shown");
  await see("/c/101/f/5006", ".sheet td", ["Problem sets", "36.5", "Term tests"]);
  await page.locator(".viewer .seg button", { hasText: "Scale" }).click();
  await page.waitForTimeout(150);
  if (!(await page.locator("main .viewer").innerText()).includes("A+")) results.push("xlsx: second sheet doesn't open");
  await see("/c/101/f/5007", ".sheet td", ["TUT0101", "BA 1200, north", "SS 2105"]);
  await see("/c/101/f/5008", ".nb-cell", ["Lab 2", "min-heap", "import heapq", "[1, 4]"]);
  if ((await page.locator("img.nb-out").count()) !== 1) results.push("ipynb: image output isn't shown");
  await see("/c/101/f/5009", ".doc .prose h1", ["Starter code", "python ps3_starter.py", "heaps"]);
  if (await page.evaluate(() => "pwned" in window)) results.push("markdown: a script in the file ran");
  await see("/c/101/f/5010", ".viewer table.grid td", ["3 files", "ps3/starter.py", "ps3/tests/test_heap.py"]);
  await see("/c/101/f/5011", "pre.text", ["Problem Set 3 starter"]);
  if (!enforced) results.push("the script policy wasn't applied, so this test proves nothing about it");
  const blocked = await page.evaluate(() => window.__blocked);
  if (blocked.length) results.push(`blocked by the app's script policy: ${blocked.join(" | ")}`);
  console.log(`${results.length ? "FAIL" : "ok  "} light document viewers (docx, pptx, xlsx, csv, ipynb, md, zip, unknown text)${results.length ? "\n       " + results.join("\n       ") : ""}`);
  failures += results.length ? 1 : 0;
  await ctx.close();
}

// Finished work never shows a red due date: a past due date is only red while there's still something to do.
{
  const { ctx, page } = await session("light");
  await page.evaluate(() => (location.hash = "/c/101/modules"));
  await page.waitForSelector(".module");
  await page.waitForTimeout(400);
  const red = (text) => page.locator("main .item", { hasText: text }).locator(".end.overdue").count();
  const mod = await red("Problem Set 1: Induction Review"); // submitted and graded, due weeks ago
  await page.evaluate(() => (location.hash = "/due"));
  await page.getByRole("button", { name: "Show finished" }).click();
  await page.waitForTimeout(300);
  const paper = await red("Term Test 1"); // graded on paper, so never "submitted"
  const shown = await page.locator("main .item", { hasText: "Term Test 1" }).count();
  const ok = mod === 0 && paper === 0 && shown > 0;
  console.log(`${ok ? "ok  " : "FAIL"} light finished work isn't red (modules ${mod}, due ${paper}, shown ${shown})`);
  failures += ok ? 0 : 1;
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

// Settings change the app straight away and are still there after a restart.
{
  const { ctx, page, errors } = await session("light");
  const bad = [];
  const want = (ok, what) => ok || bad.push(what);
  const row = (label) => page.locator("main .opt", { hasText: label });
  const css = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  await page.evaluate(() => (location.hash = "/settings"));
  await page.waitForSelector("main .swatches");

  await row("Theme").getByRole("radio", { name: "Dark" }).click();
  want((await css("--bg")) === "#151514" && (await css("color-scheme")) === "dark", "Dark theme applies while the system is light");
  await row("Accent colour").getByRole("radio", { name: "Forest" }).click();
  want((await css("--accent")) === "#7fcf9f", `Forest accent applies (got ${await css("--accent")})`);
  await row("Theme").getByRole("radio", { name: "Light" }).click();
  want((await css("--bg")) === "#fbfbfa" && (await css("--accent")) === "#1f5a3a", "Light theme switches the accent to its light shade");
  await row("Size").getByRole("radio", { name: "110%" }).click();
  want(called("plugin:webview|set_webview_zoom").at(-1)?.value === 1.1, "Size sets the window zoom");

  await row("24-hour clock").locator("input").check();
  await row("Home looks ahead").getByRole("radio", { name: "1 week" }).click();
  await row("Announcements on Home").locator("input").uncheck();
  await row("ACORN in the sidebar").locator("input").uncheck();
  await page.locator("main label.pick", { hasText: "MAT237" }).locator("input").uncheck();
  want((await page.locator(".sidebar .row", { hasText: "MAT237" }).count()) === 0, "a hidden course leaves the sidebar");
  want((await page.locator(".sidebar .side-label", { hasText: "ACORN" }).count()) === 0, "ACORN leaves the sidebar");

  await page.evaluate(() => (location.hash = "/"));
  await page.waitForTimeout(400);
  const home = await page.locator("main").innerText();
  want(home.includes("Due in the next 1 week"), "Home uses the chosen look-ahead");
  want(!home.includes("Announcements"), "Home drops the Announcements section");
  want(!home.includes("MAT237"), "a hidden course leaves Home");
  want(/\b23:59\b/.test(home) && !/11:59 PM/.test(home), "times use the 24-hour clock");
  want(apiLog.some((p) => p.includes("/planner/items") && p.includes(`end_date=${new Date(Date.now() + 7 * 864e5).toLocaleDateString("en-CA")}`)), "Home asks Quercus for one week");

  await page.evaluate(() => (location.hash = "/settings"));
  await page.waitForSelector("main .swatches");
  await row("Open on").getByRole("radio", { name: "Due" }).click();
  await page.evaluate(() => (location.hash = "/"));
  await page.reload();
  await page.waitForSelector(".shell");
  await page.waitForTimeout(400);
  want((await page.evaluate(() => location.hash)) === "#/due", "the app opens on the chosen start page");
  want((await css("--accent")) === "#1f5a3a" && (await page.evaluate(() => document.documentElement.dataset.theme)) === "light", "theme and accent survive a restart");

  // Notifications: each change is sent to the backend that does the notifying.
  await page.evaluate(() => (location.hash = "/settings"));
  await page.waitForSelector("main .swatches");
  await page.locator("main .pick", { hasText: "When a mark is released" }).locator("input").uncheck();
  want(called("set_notify_prefs").at(-1)?.prefs.grades === false, "turning off grade notifications is saved");
  await page.locator("main .pick", { hasText: "Deadlines" }).getByRole("radio", { name: "3 hours" }).click();
  await page.locator("main .pick", { hasText: "Deadlines" }).locator("label").click();
  want(called("set_notify_prefs").at(-1)?.prefs.due === false && called("set_notify_prefs").at(-1)?.prefs.due_hours === 3, "clicking a row's name flips its switch and nothing else");
  want(called("set_notify_prefs").at(-1)?.prefs.due_hours === 3, "the deadline reminder time is saved");
  await page.getByRole("button", { name: "Send a test notification" }).click();
  want(called("notify_test").length === 1, "the test button asks for a notification");

  // Calendar: the links carry the Quercus feed, and the timetable file is a real calendar.
  const feed = "https://q.utoronto.ca/feeds/calendars/user_AbC123.ics";
  await page.getByRole("button", { name: "Google Calendar" }).click();
  await page.getByRole("button", { name: "Outlook" }).click();
  await page.getByRole("button", { name: "Apple or default calendar" }).click();
  const opened = called("open_url").map((a) => a.url);
  want(opened.some((u) => u === `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace("https:", "webcal:"))}`), `Google Calendar link (${opened[0]})`);
  want(opened.some((u) => u.startsWith("https://outlook.office.com/calendar/0/addfromweb?url=" + encodeURIComponent(feed))), "Outlook link");
  want(opened.some((u) => u === feed.replace("https:", "webcal:")), "webcal link for the default calendar app");
  await page.getByRole("button", { name: "Export timetable" }).click();
  await page.waitForTimeout(200);
  const ics = called("save_calendar").at(-1)?.ics ?? "";
  want(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trimEnd().endsWith("END:VCALENDAR"), "timetable export is an .ics calendar");
  want((ics.match(/BEGIN:VEVENT/g) ?? []).length === (ics.match(/END:VEVENT/g) ?? []).length && ics.includes("BEGIN:VEVENT"), "it has events");
  want(/RRULE:FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR);UNTIL=\d{8}T235959Z/.test(ics) && /DTSTART;TZID=America\/Toronto:\d{8}T\d{6}/.test(ics), "events repeat weekly in Toronto time");
  want(ics.split("\r\n").every((l) => l.length <= 75), "no line is longer than calendars allow");
  want(!errors.length, `no page errors (${errors.join("; ")})`);
  if (SHOTS) await page.screenshot({ path: `${OUT}light-settings-custom.png`, fullPage: false });
  console.log(`${bad.length ? "FAIL" : "ok  "} light settings, notifications, calendar${bad.length ? "\n       " + bad.join("\n       ") : ""}`);
  failures += bad.length ? 1 : 0;
  if (process.env.ICS_OUT) (await import("node:fs")).writeFileSync(process.env.ICS_OUT, ics);
  await ctx.close();
}

// First run: the welcome tour signs in, sets things up, and ends in the app. It doesn't come back.
{
  globalThis.signedIn = false;
  const { ctx, page, errors } = await session("light", { width: 1320, height: 860 }, { fresh: true });
  const bad = [];
  const want = (ok, what) => ok || bad.push(what);
  const heading = () => page.locator(".w-step h1").innerText();
  const shot = async (name) => SHOTS && (await page.waitForTimeout(700), await page.screenshot({ path: `${OUT}light-welcome-${name}.png` }));
  want((await heading()) === "Meet Quirkus", "starts on the welcome screen");
  await shot("1-hello");
  await page.getByRole("button", { name: "Get started" }).click();
  want((await heading()) === "Connect your accounts", "asks to sign in");
  want((await page.getByRole("button", { name: "Skip setup" }).count()) === 0, "setup can't be skipped before signing in");
  want(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled(), "can't continue before signing in");
  const acct = (name) => page.locator(".w-card .acct", { hasText: name });
  want((await acct("ACORN").innerText()).includes("After Quercus"), "ACORN waits for the Quercus sign-in");
  await shot("2-accounts");
  await page.getByRole("button", { name: "Continue with UTORid" }).click();
  want(called("login_sso").at(-1)?.silent === false, "opens the U of T sign-in window");
  // U of T sign-in finished, but ACORN hasn't synced yet: the backend announces it, as the real app does.
  globalThis.signedIn = true;
  globalThis.acornEmpty = true;
  const emit = (event, payload = null) => page.evaluate(([event, payload]) => {
    for (const k of Object.keys(window)) if (/^_\d+$/.test(k)) try { window[k]({ event, id: 0, payload }); } catch {}
  }, [event, payload]);
  await emit("signed-in");
  await page.waitForSelector(".w-card .acct .tag.ok", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  want((await acct("Quercus").innerText()).includes("Signed in as Alex"), `Quercus shows as signed in (${(await acct("Quercus").innerText()).replace(/\n/g, " ")})`);
  want((await heading()) === "Connect your accounts", "stays on the accounts step so ACORN can be connected too");
  want((await acct("ACORN").innerText()).includes("Connecting"), "ACORN starts connecting by itself");
  // U of T wants the password again for ACORN.
  await emit("acorn-state", { state: "needs-signin", note: "timeout" });
  await page.getByRole("button", { name: "Sign in to ACORN" }).click();
  want(called("acorn_sync").at(-1)?.interactive === true, "ACORN sign-in opens the U of T window when it's needed");
  // ACORN finished syncing.
  globalThis.acornEmpty = false;
  await emit("acorn-updated");
  await page.waitForFunction(() => document.querySelectorAll(".w-card .acct .tag.ok").length === 2, null, { timeout: 5000 }).catch(() => {});
  want(/Connected · \d+ courses/.test(await acct("ACORN").innerText()), `ACORN shows as connected (${(await acct("ACORN").innerText()).replace(/\n/g, " ")})`);
  await shot("2-accounts-connected");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  want((await heading()).startsWith("Hi Alex"), `greets you by name (at "${await heading()}")`);
  await page.getByRole("radio", { name: "Plum" }).click();
  want((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim())) === "#5b2f86", "accent changes live");
  await shot("3-look");
  await page.getByRole("button", { name: "Continue" }).click();
  want((await heading()) === "Your courses", "courses step");
  await page.waitForSelector(".w-step label.pick");
  want((await page.locator(".w-step label.pick").count()) === 3, "lists your current courses");
  await page.locator(".w-step label.pick", { hasText: "PHL245" }).locator("input").uncheck();
  await shot("4-courses");
  await page.getByRole("button", { name: "Continue" }).click();
  want((await heading()) === "Stay in the loop", "notifications step");
  await page.waitForSelector(".w-step .pick");
  await shot("5-notify");
  await page.getByRole("button", { name: "Back" }).click();
  want((await heading()) === "Your courses", "Back goes back");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  want((await heading()) === "Put it on your calendar", "Enter moves forward");
  await page.waitForSelector(".w-step .connect-actions button");
  await shot("6-calendar");
  await page.getByRole("button", { name: "Continue" }).click();
  want((await heading()) === "You're set", "finishes");
  await shot("7-done");
  await page.getByRole("button", { name: "Open Quirkus" }).click();
  await page.waitForSelector(".shell", { timeout: 5000 }).catch(() => {});
  want((await page.locator(".shell").count()) === 1, "ends in the app");
  want((await page.locator(".sidebar .row", { hasText: "PHL245" }).count()) === 0 && (await page.locator(".sidebar .row", { hasText: "CSC263" }).count()) > 0, "the course you turned off is hidden");
  await page.reload();
  await page.waitForSelector(".shell", { timeout: 5000 }).catch(() => {});
  want((await page.locator(".welcome").count()) === 0, "the tour doesn't come back after a restart");
  await page.evaluate(() => (location.hash = "/settings"));
  await page.getByRole("button", { name: "Show the welcome tour again" }).click();
  want((await page.locator(".welcome").count()) === 1 && (await heading()) === "Meet Quirkus", "Settings can replay the tour");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.waitForTimeout(300);
  want((await page.locator(".w-card .acct .tag.ok").count()) === 2, "a signed-in replay shows both accounts already connected");
  await page.getByRole("button", { name: "Skip setup" }).click();
  want((await page.locator(".shell").count()) === 1, "Skip setup goes to the app");
  want(!errors.length, `no page errors (${errors.join("; ")})`);
  console.log(`${bad.length ? "FAIL" : "ok  "} light welcome tour${bad.length ? "\n       " + bad.join("\n       ") : ""}`);
  failures += bad.length ? 1 : 0;
  await ctx.close();
}

// Signed-out after the tour: the plain login screen.
{
  globalThis.signedIn = false;
  const ctx = await browser.newContext({ viewport: { width: 1320, height: 860 } });
  await ctx.exposeFunction("__backend", backend);
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(() => localStorage.setItem("prefs", JSON.stringify({ onboarded: true })));
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
