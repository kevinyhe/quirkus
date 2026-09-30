import { get, peek } from "./api.svelte";
import * as P from "./paths";
import { isoDate } from "./format";

/** API paths a screen reads first. Must match the paths the screens use, so the cache is shared. */
export function dataFor(path: string): string[] {
  const p = path.split("/").filter(Boolean);
  if (!p.length) return [P.COURSES, P.planner(isoDate(-1), isoDate(14))];
  if (p[0] === "due") return [P.planner(isoDate(-21), isoDate(70))];
  // Not individual conversations: opening one marks it read in Quercus.
  if (p[0] === "inbox" && !p[1]) return [P.INBOX];
  if (p[0] === "f" && p[1]) return [P.fileMeta(p[1])];
  if (p[0] !== "c" || !p[1]) return [];
  const [c, s, id] = [p[1], p[2], p[3]];
  const head = [P.course(c), P.tabs(c)];
  switch (s) {
    case undefined: return [...head, P.modules(c)];
    case "assignments":
    case "grades": return [...head, P.groups(c)];
    case "modules": return [...head, P.modules(c)];
    case "announcements": return [...head, P.announcements(c)];
    case "discussions": return [...head, P.discussions(c)];
    case "pages": return [...head, P.pages(c)];
    case "syllabus": return [...head, P.syllabus(c)];
    case "files": return id ? [...head, `/api/v1/folders/${id}`] : [...head, P.rootFolder(c)];
    case "a": return [P.assignment(c, id), P.mySubmission(c, id)];
    case "d": return [P.topic(c, id), P.topicView(c, id)];
    case "p": return [P.page(c, p.slice(3).join("/"))];
    case "f": return [P.fileMeta(id, c)];
    default: return [];
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let last = "";

/** Hovering a link for 60ms loads that screen's data, so the click renders from memory. */
export function onHover(e: MouseEvent) {
  const el = e.target as Element | null;
  const a = el?.closest?.('a[href^="#/"]') ?? el?.closest?.("tr.click")?.querySelector('a[href^="#/"]');
  const href = a?.getAttribute("href")?.slice(1);
  if (!href || href === last) return;
  last = href;
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const k of dataFor(href)) if (peek(k) === undefined) get(k).catch(() => {});
  }, 60);
}
