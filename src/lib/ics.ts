// Builds a calendar file (.ics) from the ACORN timetable: one weekly repeating event per class meeting.
//
// ACORN's data has no term dates, so they're worked out from the session code ("20259" = starts September 2025)
// using U of T's usual pattern. They're close, not exact: reading weeks and holidays aren't removed.

import { parseDay, parseTime, type AcornData } from "./acorn.svelte";

type Ymd = [number, number, number]; // year, month (1-12), day

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const date = ([y, m, d]: Ymd) => `${y}${pad(m)}${pad(d)}`;

/** The first `weekday` (1 = Monday … 7 = Sunday) on or after a date. */
function onOrAfter([y, m, d]: Ymd, weekday: number): Ymd {
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() + ((weekday - (((t.getDay() + 6) % 7) + 1) + 7) % 7));
  return [t.getFullYear(), t.getMonth() + 1, t.getDate()];
}

/** First and last day of classes for a section ("F", "S" or "Y") of a session. */
export function termDates(session: string, section: string): { start: Ymd; end: Ymd } | null {
  const m = session.match(/^(\d{4})(\d)/);
  if (!m) return null;
  const year = Number(m[1]);
  if (m[2] === "9") {
    // Fall–Winter. Fall starts the day after Labour Day (first Monday of September).
    const labour = onOrAfter([year, 9, 1], 1);
    const fall = { start: [labour[0], labour[1], labour[2] + 1] as Ymd, end: [year, 12, 3] as Ymd };
    const winter = { start: onOrAfter([year + 1, 1, 5], 1), end: [year + 1, 4, 3] as Ymd };
    if (section === "F") return fall;
    if (section === "S") return winter;
    return { start: fall.start, end: winter.end };
  }
  if (m[2] === "5") {
    const first = { start: onOrAfter([year, 5, 1], 1), end: [year, 6, 13] as Ymd };
    const second = { start: onOrAfter([year, 7, 1], 2), end: [year, 8, 12] as Ymd };
    if (section === "F") return first;
    if (section === "S") return second;
    return { start: first.start, end: second.end };
  }
  return null;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes must be folded. Keeping it to 70 characters is safe for the text we write. */
function fold(line: string): string {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 70) out.push((i ? " " : "") + line.slice(i, i + 70));
  return out.join("\r\n");
}

const TORONTO = [
  "BEGIN:VTIMEZONE", "TZID:America/Toronto",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
  "END:VTIMEZONE",
];
const BYDAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function timetableIcs(data: AcornData | null, now = new Date()): { ics: string; events: number } {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quirkus//Timetable//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:U of T classes", "X-WR-TIMEZONE:America/Toronto", ...TORONTO];
  let events = 0;
  for (const [session, buckets] of Object.entries(data?.enrolled ?? {})) {
    for (const c of buckets?.APP ?? []) {
      const code = String(c.code ?? c.courseCode ?? "").trim();
      const section = String(c.sectionCode ?? "").trim().toUpperCase();
      const term = termDates(session, section || "Y");
      if (!code || !term) continue;
      for (const m of c.meetings ?? []) {
        const activity = String(m.displayName ?? `${m.teachMethod ?? ""}${m.sectionNo ?? ""}`).trim();
        for (const t of m.times ?? []) {
          const [day, start, end] = [parseDay(t.day), parseTime(t.startTime), parseTime(t.endTime)];
          if (!day || start == null || end == null || end <= start) continue;
          const first = onOrAfter(term.start, day);
          const at = (min: number) => `${date(first)}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
          const where = [t.buildingCode, t.room].filter(Boolean).join(" ");
          const who = (t.instructors?.length ? t.instructors.join(", ") : m.commaSeparatedInstructorNames) ?? "";
          lines.push(
            "BEGIN:VEVENT",
            `UID:${session}-${code}-${section}-${activity}-${day}-${start}@quirkus`.replace(/\s/g, ""),
            `DTSTAMP:${stamp}`,
            `DTSTART;TZID=America/Toronto:${at(start)}`,
            `DTEND;TZID=America/Toronto:${at(end)}`,
            // UNTIL is in UTC: the end of the last day of classes in Toronto.
            `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[day]};UNTIL=${date(term.end)}T235959Z`,
            `SUMMARY:${esc(`${code} ${activity}`.trim())}`,
            ...(where ? [`LOCATION:${esc(where)}`] : []),
            ...(c.title || who ? [`DESCRIPTION:${esc([c.title, who].filter(Boolean).join("\n"))}`] : []),
            "END:VEVENT",
          );
          events++;
        }
      }
    }
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.map(fold).join("\r\n") + "\r\n", events };
}
