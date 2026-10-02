// How the app looks and what it shows. Saved on this computer only.

import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export type Theme = "system" | "light" | "dark";
export type Accent = "navy" | "forest" | "teal" | "plum" | "rose" | "amber" | "graphite";

export interface Prefs {
  /** The welcome tour has been finished or skipped. */
  onboarded: boolean;
  theme: Theme;
  accent: Accent;
  /** Whole-window zoom, in percent. */
  zoom: number;
  hour24: boolean;
  startPage: string;
  /** How far ahead Home looks for due work, in days. */
  homeDays: number;
  homeClasses: boolean;
  homeCourses: boolean;
  homeAnnouncements: boolean;
  /** ACORN section in the sidebar. */
  showAcorn: boolean;
  /** Courses left out of the sidebar, Home, and search. */
  hiddenCourses: number[];
}

const DEFAULTS: Prefs = {
  onboarded: false,
  theme: "system",
  accent: "navy",
  zoom: 100,
  hour24: false,
  startPage: "/",
  homeDays: 14,
  homeClasses: true,
  homeCourses: true,
  homeAnnouncements: true,
  showAcorn: true,
  hiddenCourses: [],
};

export const ZOOMS = [90, 100, 110, 125];
export const START_PAGES: [string, string][] = [["/", "Home"], ["/due", "Due"], ["/acorn/timetable", "Timetable"]];
export const HOME_DAYS: [number, string][] = [[7, "1 week"], [14, "2 weeks"], [28, "4 weeks"]];

/** [accent, hover/links, soft background] for light, then dark. Navy is the stylesheet's own default. */
export const ACCENTS: Record<Accent, { label: string; light: [string, string, string]; dark: [string, string, string] }> = {
  navy: { label: "Navy", light: ["#1f3a68", "#2d5395", "#e9eef7"], dark: ["#8eb0f0", "#a9c3f5", "#1d2638"] },
  forest: { label: "Forest", light: ["#1f5a3a", "#2c7a50", "#e6f2ea"], dark: ["#7fcf9f", "#9cdcb5", "#18301f"] },
  teal: { label: "Teal", light: ["#0f5e66", "#177a85", "#e2f2f3"], dark: ["#74cdd6", "#93d9e0", "#15302f"] },
  plum: { label: "Plum", light: ["#5b2f86", "#7645a8", "#f0e9f7"], dark: ["#c3a1ee", "#d3b9f3", "#2a1f3a"] },
  rose: { label: "Rose", light: ["#9c2848", "#bd3a5e", "#fae9ee"], dark: ["#f29bb2", "#f6b5c6", "#3a1c25"] },
  amber: { label: "Amber", light: ["#8a4b00", "#a85d00", "#faf0db"], dark: ["#e8b565", "#efc785", "#33280f"] },
  graphite: { label: "Graphite", light: ["#33332f", "#4a4a45", "#ececea"], dark: ["#d2d2cd", "#e3e3df", "#2a2a28"] },
};

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem("prefs") ?? "{}");
    const p = { ...DEFAULTS, ...(saved && typeof saved === "object" ? saved : {}) };
    // Anything hand-edited or from an older version falls back to the default.
    if (!(p.accent in ACCENTS)) p.accent = DEFAULTS.accent;
    if (!["system", "light", "dark"].includes(p.theme)) p.theme = DEFAULTS.theme;
    if (!ZOOMS.includes(p.zoom)) p.zoom = DEFAULTS.zoom;
    if (!START_PAGES.some(([path]) => path === p.startPage)) p.startPage = DEFAULTS.startPage;
    if (!HOME_DAYS.some(([d]) => d === p.homeDays)) p.homeDays = DEFAULTS.homeDays;
    if (!Array.isArray(p.hiddenCourses)) p.hiddenCourses = [];
    return p;
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = $state<Prefs>(load());

const dark = matchMedia("(prefers-color-scheme: dark)");

export function isDark(): boolean {
  return prefs.theme === "dark" || (prefs.theme === "system" && dark.matches);
}

const alpha = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

let lastZoom = 100;

/** Push the current choices onto the page. */
export function applyPrefs() {
  const root = document.documentElement;
  if (prefs.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = prefs.theme;

  const names = ["--accent", "--accent-2", "--accent-soft", "--focus", "--info", "--info-bg"];
  if (prefs.accent === "navy") names.forEach((n) => root.style.removeProperty(n));
  else {
    const [a, a2, soft] = ACCENTS[prefs.accent][isDark() ? "dark" : "light"];
    const values = [a, a2, soft, alpha(a2, isDark() ? 0.4 : 0.35), a2, soft];
    names.forEach((n, i) => root.style.setProperty(n, values[i]));
  }

  if (prefs.zoom !== lastZoom) {
    lastZoom = prefs.zoom;
    getCurrentWebview().setZoom(prefs.zoom / 100).catch(() => {});
  }
}

export function savePrefs() {
  try {
    localStorage.setItem("prefs", JSON.stringify(prefs));
  } catch {}
  applyPrefs();
}

export function toggleCourse(id: number, show: boolean) {
  prefs.hiddenCourses = show ? prefs.hiddenCourses.filter((c) => c !== id) : [...new Set([...prefs.hiddenCourses, id])];
  savePrefs();
}

dark.addEventListener("change", applyPrefs);
applyPrefs();

// ---------- notifications (kept by the Rust side, which sends them) ----------

export interface NotifyPrefs {
  enabled: boolean;
  announcements: boolean;
  grades: boolean;
  messages: boolean;
  due: boolean;
  due_hours: number;
}

export const DUE_HOURS: [number, string][] = [[3, "3 hours"], [12, "12 hours"], [24, "1 day"], [48, "2 days"]];

export const notify = $state<{ prefs: NotifyPrefs | null }>({ prefs: null });

export async function loadNotify() {
  try {
    notify.prefs = await invoke<NotifyPrefs>("notify_prefs");
  } catch {}
  // Older builds (and the UI tests) have no such command: show the defaults.
  notify.prefs ??= { enabled: true, announcements: true, grades: true, messages: true, due: true, due_hours: 24 };
}

export function saveNotify() {
  if (notify.prefs) invoke("set_notify_prefs", { prefs: $state.snapshot(notify.prefs) }).catch(() => {});
}
