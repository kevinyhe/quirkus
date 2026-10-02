import { prefs } from "./prefs.svelte";

const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const clocks = {
  12: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }),
  24: new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
};
/** Times follow the 24-hour setting. */
const clock = { format: (d: Date) => clocks[prefs.hour24 ? 24 : 12].format(d) };
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const full = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** "Today", "Tomorrow", "Fri", "Fri, Oct 3", or "Oct 3, 2025". */
export function day(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return weekday.format(d);
  if (d.getFullYear() === new Date().getFullYear()) return monthDay.format(d);
  return full.format(d);
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  return `${day(iso)} ${clock.format(new Date(iso))}`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return day(iso);
}

/** "overdue" | "soon" (within 48h) | "" */
export function urgency(iso: string | null | undefined, done = false): string {
  if (!iso || done) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return "overdue";
  if (ms < 2 * DAY) return "soon";
  return "";
}

/** Local date as YYYY-MM-DD, offset by `days`. Used in cache keys so they change once a day, not every call. */
export function isoDate(days = 0): string {
  const d = new Date(Date.now() + days * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function pct(n: number | null | undefined): string {
  return n == null ? "–" : `${Math.round(n * 10) / 10}%`;
}

export function num(n: number | null | undefined): string {
  return n == null ? "–" : String(Math.round(n * 100) / 100);
}

export function plain(html: string | null | undefined, max = 180): string {
  if (!html) return "";
  const t = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** "11:59 PM", or "Fri 11:59 PM" / "Oct 3, 11:59 PM" with `withDay`. */
export function time(iso: string | null | undefined, withDay = false): string {
  if (!iso) return "";
  return withDay ? when(iso) : clock.format(new Date(iso));
}

const long = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

/** "Tuesday, September 30" */
export function today(): string {
  return long.format(new Date());
}
