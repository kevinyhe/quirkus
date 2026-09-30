import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const BASE = "https://q.utoronto.ca";

/** Last known response per API path. Lets a revisited page render in the same frame. */
const memo = new Map<string, unknown>();
const subs = new Map<string, Set<(d: unknown) => void>>();

export const app = $state({
  /** Bumped to make every live query ask again (after sign-in, or on Ctrl+R). */
  epoch: 0,
  /** When set, the next round of queries ignores cache age and revalidates. */
  force: false,
  signedIn: null as boolean | null,
  reconnecting: false,
});

listen<{ key: string; data: unknown }>("api-updated", ({ payload }) => {
  memo.set(payload.key, payload.data);
  subs.get(payload.key)?.forEach((fn) => fn(payload.data));
});

export async function get<T>(path: string, maxAge?: number): Promise<T> {
  const data = await invoke<T>("api_get", { path, maxAge: app.force ? 0 : maxAge });
  memo.set(path, data);
  return data;
}

/** Keep `fn` informed of every background update to `path`, for app-wide data like course colors. */
export function watch<T>(path: string, fn: (d: T) => void) {
  if (!subs.has(path)) subs.set(path, new Set());
  subs.get(path)!.add(fn as (d: unknown) => void);
}

export function peek<T>(path: string): T | undefined {
  return memo.get(path) as T | undefined;
}

export function prefetch(paths: string[], maxAge?: number) {
  const fresh = paths.filter((p) => !memo.has(p) || app.force);
  if (fresh.length) invoke("prefetch", { paths: fresh, maxAge }).catch(() => {});
}

export function refreshAll() {
  app.force = true;
  app.epoch++;
  setTimeout(() => (app.force = false), 1000);
}

export interface Query<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Reactive API read. `path` is a function so the query follows route changes.
 * Must be called during component setup.
 */
export function query<T>(path: () => string | null | undefined, maxAge?: number): Query<T> {
  const q = $state<Query<T>>({ data: undefined, error: null, loading: true });
  $effect(() => {
    const p = path();
    void app.epoch;
    if (!p) {
      q.loading = false;
      return;
    }
    let alive = true;
    const cached = memo.get(p) as T | undefined;
    q.data = cached;
    q.error = null;
    q.loading = cached === undefined;

    const onUpdate = (d: unknown) => alive && (q.data = d as T);
    if (!subs.has(p)) subs.set(p, new Set());
    subs.get(p)!.add(onUpdate);

    get<T>(p, maxAge)
      .then((d) => {
        if (alive) q.data = d;
      })
      .catch((e) => {
        if (alive) q.error = String(e);
      })
      .finally(() => {
        if (alive) q.loading = false;
      });

    return () => {
      alive = false;
      subs.get(p)?.delete(onUpdate);
    };
  });
  return q;
}

/** Human text for errors coming back from Rust. */
export function explain(e: string | null): string {
  if (!e) return "";
  if (e === "offline") return "Can't reach Quercus. Check your connection.";
  if (e === "signed-out") return "Your Quercus session ended. Reconnecting…";
  if (e === "http-403" || e === "http-401") return "This isn't available to you in Quercus.";
  if (e === "http-404") return "Not found. It may have been deleted or hidden.";
  return e;
}

// ---- toasts ----

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
export const toasts = $state<Toast[]>([]);
let toastId = 0;
export function toast(text: string, action?: Toast["action"], ms = 5000) {
  const id = ++toastId;
  toasts.push({ id, text, action });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}
