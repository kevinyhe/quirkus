import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { prefs } from "./prefs.svelte";

// Shapes follow the community-documented ACORN / Degree Explorer responses. Every field is optional:
// the formats aren't published, so parsing never assumes a field exists.

export interface TimeSlot {
  day?: { dayCode?: string; dayName?: string };
  startTime?: string | number;
  endTime?: string | number;
  buildingCode?: string;
  room?: string;
  instructors?: string[];
}
export interface Meeting {
  sectionNo?: string;
  displayName?: string;
  teachMethod?: string;
  displayTime?: string;
  deliveryMode?: string;
  commaSeparatedInstructorNames?: string;
  waitlistRank?: number | null;
  times?: TimeSlot[];
}
export interface AcornCourse {
  code?: string;
  courseCode?: string;
  sectionCode?: string;
  title?: string;
  name?: string;
  status?: string;
  sessionCode?: string;
  meetings?: Meeting[];
}
export interface Registration {
  sessionDescription?: string;
  registrationParams?: { sessionCode?: string; sessionDescription?: string; postDescription?: string };
  post?: { description?: string };
}
export interface HistoryCourse {
  courseCode?: string;
  courseTitle?: string;
  title?: string;
  enteredMark?: string;
  markPercentValue?: number | string | null;
  [k: string]: unknown;
}
export interface HistorySession {
  sessionCode?: string;
  sessionName?: string;
  sessionDescription?: string;
  studentCourses?: HistoryCourse[];
  [k: string]: unknown;
}
export interface AcornData {
  syncedAt: number | null;
  state: "idle" | "syncing" | "needs-signin" | "error";
  note: string;
  registrations: Registration[] | null;
  enrolled: Record<string, { APP?: AcornCourse[]; WAIT?: AcornCourse[]; DROP?: AcornCourse[] } | null>;
  notifications: { notifications?: Record<string, unknown>[]; actionNotices?: Record<string, unknown>[] } | null;
  profile: Record<string, unknown> | null;
  history: { facultyCourses?: { studentSessions?: HistorySession[]; [k: string]: unknown }[] } | null;
}

export const acorn = $state<{ data: AcornData | null }>({ data: null });

export async function loadAcorn() {
  try {
    acorn.data = await invoke<AcornData>("acorn_data");
  } catch {}
}

export function syncAcorn(interactive = false) {
  if (acorn.data) acorn.data.state = "syncing";
  return invoke("acorn_sync", { interactive }).catch(() => {});
}

listen("acorn-updated", loadAcorn);
listen<{ state: AcornData["state"]; note: string }>("acorn-state", ({ payload }) => {
  if (acorn.data) {
    acorn.data.state = payload.state;
    acorn.data.note = payload.note;
  }
});

/** Sync in the background when the data is missing or older than six hours. */
export async function syncIfStale() {
  await loadAcorn();
  const at = acorn.data?.syncedAt;
  if (!at || Date.now() / 1000 - at > 6 * 3600) syncAcorn(false);
}

// ---------- timetable ----------

export interface ClassBlock {
  code: string; // "CSC263H1"
  term: string; // "F" | "S" | "Y"
  title: string;
  activity: string; // "LEC0101"
  day: number; // 1 = Monday … 7 = Sunday
  start: number; // minutes after midnight
  end: number;
  where: string;
  who: string;
  waitlisted: boolean;
}

const DAYS: Record<string, number> = {
  mo: 1, mon: 1, monday: 1, tu: 2, tue: 2, tuesday: 2, we: 3, wed: 3, wednesday: 3,
  th: 4, thu: 4, thursday: 4, fr: 5, fri: 5, friday: 5, sa: 6, sat: 6, saturday: 6, su: 7, sun: 7, sunday: 7,
};

export function parseDay(d: TimeSlot["day"]): number | null {
  for (const v of [d?.dayName, d?.dayCode]) {
    if (v == null) continue;
    const s = String(v).trim().toLowerCase();
    if (DAYS[s]) return DAYS[s];
    const n = Number(s);
    if (Number.isInteger(n) && n >= 1 && n <= 7) return n;
  }
  return null;
}

/** "10:00", "1000", "10:00 AM", "1:30 PM", "14:30:00" → minutes after midnight. */
export function parseTime(t: string | number | undefined): number | null {
  if (t == null) return null;
  const s = String(t).trim().toUpperCase();
  const m = s.match(/^(\d{1,2}):?(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function blocks(data: AcornData | null): ClassBlock[] {
  const out: ClassBlock[] = [];
  for (const session of Object.values(data?.enrolled ?? {})) {
    for (const [bucket, waitlisted] of [["APP", false], ["WAIT", true]] as const) {
      for (const c of session?.[bucket] ?? []) {
        const code = String(c.code ?? c.courseCode ?? "").trim();
        if (!code) continue;
        for (const m of c.meetings ?? []) {
          const activity = String(m.displayName ?? `${m.teachMethod ?? ""}${m.sectionNo ?? ""}`).trim();
          for (const t of m.times ?? []) {
            const day = parseDay(t.day);
            const start = parseTime(t.startTime);
            const end = parseTime(t.endTime);
            if (!day || start == null || end == null || end <= start) continue;
            out.push({
              code,
              term: String(c.sectionCode ?? "").trim().toUpperCase(),
              title: String(c.title ?? c.name ?? ""),
              activity,
              day,
              start,
              end,
              where: [t.buildingCode, t.room].filter(Boolean).join(" ") || (m.deliveryMode ?? ""),
              who: (t.instructors?.length ? t.instructors.join(", ") : m.commaSeparatedInstructorNames) ?? "",
              waitlisted,
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start);
}

export function courses(data: AcornData | null): (AcornCourse & { waitlisted: boolean })[] {
  const out: (AcornCourse & { waitlisted: boolean })[] = [];
  const seen = new Set<string>();
  for (const session of Object.values(data?.enrolled ?? {})) {
    for (const [bucket, waitlisted] of [["APP", false], ["WAIT", true]] as const) {
      for (const c of session?.[bucket] ?? []) {
        const key = `${c.code ?? c.courseCode}-${c.sectionCode}-${bucket}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...c, waitlisted });
      }
    }
  }
  return out.sort((a, b) => String(a.code ?? a.courseCode).localeCompare(String(b.code ?? b.courseCode)));
}

/** Fall term shows F and Y sections; winter shows S and Y. Summer sessions use F/S the same way. */
export function currentTerm(now = new Date()): "F" | "S" {
  const m = now.getMonth(); // 0 = Jan
  if (m >= 8) return "F"; // Sep–Dec
  if (m <= 3) return "S"; // Jan–Apr
  return m <= 5 ? "F" : "S"; // May–Jun first summer term, Jul–Aug second
}

export function inTerm(b: { term: string }, term: "F" | "S"): boolean {
  return b.term === "Y" || b.term === term || b.term === "";
}

export function clock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const d = new Date(2000, 0, 1, h, m);
  if (prefs.hour24) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: m ? "2-digit" : undefined });
}

// ---------- academic history ----------

export interface HistoryRow {
  session: string;
  courses: HistoryCourse[];
}

export function history(data: AcornData | null): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const f of data?.history?.facultyCourses ?? []) {
    for (const s of f.studentSessions ?? []) {
      const label = String(s.sessionName ?? s.sessionDescription ?? s.sessionCode ?? "Session");
      const existing = rows.find((r) => r.session === label);
      const list = (s.studentCourses ?? []).filter((c) => c.courseCode);
      if (existing) existing.courses.push(...list);
      else rows.push({ session: label, courses: list });
    }
  }
  // Newest first when session codes are sortable (e.g. "20259").
  return rows.reverse();
}

export function markNumber(c: HistoryCourse): number | null {
  const n = typeof c.markPercentValue === "string" ? Number(c.markPercentValue) : c.markPercentValue;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
