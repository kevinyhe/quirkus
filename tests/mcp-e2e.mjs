// End-to-end test of `quirkus mcp`: starts the MCP server over stdio against a fake Quercus,
// with an isolated profile, and calls every tool the way an MCP client (Claude) would.
//   node tests/mcp-e2e.mjs [path to quirkus binary]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import readline from "node:readline";
import { ACORN } from "./fixtures.mjs";
import { startFakeQuercus } from "./fake-quercus.mjs";

const bin = process.argv[2] ?? new URL("../src-tauri/target/debug/quirkus", import.meta.url).pathname;
const fake = await startFakeQuercus({ pdfText: "Heaps and priority queues" });

const profile = join(os.tmpdir(), `quercus-mcp-e2e-${process.pid}`);
rmSync(profile, { recursive: true, force: true });
mkdirSync(join(profile, "config"), { recursive: true });
mkdirSync(join(profile, "data", "acorn"), { recursive: true });
writeFileSync(join(profile, "config", "auth.json"), JSON.stringify({ kind: "token", value: "e2e-token" }));
for (const [session, v] of Object.entries(ACORN.enrolled)) writeFileSync(join(profile, "data", "acorn", `enrolled_${session}.json`), JSON.stringify(v));
writeFileSync(join(profile, "data", "acorn", "history.json"), JSON.stringify(ACORN.history));
writeFileSync(join(profile, "data", "acorn", "synced_at"), String(Math.floor(Date.now() / 1000)));

const srv = spawn(bin, ["mcp"], { env: { ...process.env, QUERCUS_BASE_URL: fake.base, QUERCUS_PROFILE_DIR: profile }, stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map();
readline.createInterface({ input: srv.stdout }).on("line", (line) => {
  const msg = JSON.parse(line);
  pending.get(msg.id)?.(msg);
  pending.delete(msg.id);
});
let nextId = 1;
const rpc = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`${method} timed out`)), 20000);
  });
const tool = async (name, args = {}) => {
  const r = await rpc("tools/call", { name, arguments: args });
  return { text: r.result.content[0].text, error: r.result.isError };
};

const failures = [];
const check = (ok, msg, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}${ok || !detail ? "" : "\n       " + detail.slice(0, 400).replaceAll("\n", "\n       ")}`);
  if (!ok) failures.push(msg);
};

try {
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
  check(init.result.protocolVersion === "2025-06-18" && init.result.serverInfo.name === "quirkus", "initialize handshake");
  srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const list = await rpc("tools/list", {});
  check(list.result.tools.length === 13, `tools/list returns ${list.result.tools.length} tools`);

  let r = await tool("list_courses");
  check(!r.error && r.text.includes("CSC263H1") && r.text.includes("84.6%"), "list_courses", r.text);
  r = await tool("upcoming_deadlines", { days: 30 });
  check(!r.error && r.text.includes("Problem Set 3") && r.text.includes("to do"), "upcoming_deadlines", r.text);
  r = await tool("course_assignments", { course: "csc263" });
  check(!r.error && r.text.includes("[3002] Problem Set 2") && r.text.includes("17.5 / 20"), "course_assignments (by lowercase code)", r.text);
  r = await tool("get_assignment", { course: "CSC263", assignment_id: 3001 });
  check(!r.error && r.text.includes("BUILD-HEAP") && r.text.includes("Rubric") && !r.text.includes("alert("), "get_assignment (instructions as text, script stripped)", r.text);
  r = await tool("get_assignment", { course: "CSC263", assignment_id: 3002 });
  check(!r.error && r.text.includes("Your score: 17.5 / 20") && r.text.includes("Tighten the bound"), "get_assignment shows score and grader comments", r.text);
  r = await tool("grades", { course: "Data Structures" });
  check(!r.error && r.text.includes("Quercus current score: 84.6%") && r.text.includes("40% of grade"), "grades (course by name)", r.text);
  r = await tool("announcements", { days: 30 });
  check(!r.error && r.text.includes("EX 100") && r.text.includes("MAT237"), "announcements across courses", r.text);
  r = await tool("course_modules", { course: "CSC263" });
  check(!r.error && r.text.includes("file_id 5001") && r.text.includes("Past exam 2019.pdf"), "course_modules (incl. large module fetched separately)", r.text);
  r = await tool("read_page", { course: "CSC263", page: "Course policies" });
  check(!r.error && r.text.includes("Late policy"), "read_page by title", r.text);
  r = await tool("read_file", { course: "CSC263", file_id: 5001 });
  check(!r.error && r.text.includes("Heaps and priority queues"), "read_file extracts PDF text", r.text);
  r = await tool("read_file", { course: "CSC263", file_id: 5003 });
  check(!r.error && r.text.includes("hello from the fake server"), "read_file returns code file text", r.text);
  r = await tool("read_file", { course: "CSC263", file_id: 5004 });
  check(!r.error && r.text.includes("can't be read as text"), "read_file explains unreadable types", r.text);
  r = await tool("search", { query: "heap" });
  check(!r.error && r.text.includes("Problem Set 3") && r.text.includes("Heap diagram.png"), "search", r.text);
  r = await tool("inbox");
  check(!r.error && r.text.includes("[unread] Re: remark request"), "inbox", r.text);
  check(!fake.hits.some((h) => /\/conversations\/\d+/.test(h)), "inbox never opens a conversation (would mark it read)");
  r = await tool("timetable", { term: "fall" });
  check(!r.error && r.text.includes("## Monday") && r.text.includes("CSC258H1 F LEC0101 (waitlisted)") && !r.text.includes("STA247"), "timetable (fall)", r.text);
  r = await tool("academic_history");
  check(!r.error && r.text.includes("CSC148H1") && r.text.indexOf("2025 Winter") < r.text.indexOf("2024 Fall"), "academic_history", r.text);
  r = await tool("grades", { course: "s" }); // in every course name
  check(r.error && r.text.includes("several courses"), "ambiguous course is a clear tool error", r.text);
  r = await tool("course_assignments", { course: "PHL245" });
  check(!r.error, "course with hidden Files tab still lists assignments", r.text);
  check(fake.authOk(), "every request carried the stored token");
  check(!fake.hits.some((h) => !/^\/(api\/v1|files|courses)\//.test(h)), "only read requests to known paths");
  if (fake.unknown.length) console.log(`info unmocked: ${[...new Set(fake.unknown)].join(", ")}`);
} catch (e) {
  failures.push(String(e));
  console.log("FAIL", e);
} finally {
  srv.kill();
  fake.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} failing` : "\nMCP server passed end-to-end");
process.exit(failures.length ? 1 : 0);
