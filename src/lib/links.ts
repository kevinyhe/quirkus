import { invoke } from "@tauri-apps/api/core";
import { BASE, toast } from "./api.svelte";
import { isRiskyToOpen } from "./filekind";
import { go } from "./router.svelte";
import type { ModuleItem } from "./types";

/** Map a Quercus URL to a screen in this app, or null if we don't render it natively. */
export function routeFor(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href, BASE);
  } catch {
    return null;
  }
  if (u.origin !== BASE) return null;
  const p = u.pathname.replace(/\/+$/, "").split("/").slice(1).map(decodeURIComponent);

  if (p[0] === "conversations") return "/inbox";
  if (p[0] === "files" && /^\d+$/.test(p[1] ?? "")) return `/f/${p[1]}`;
  if (p[0] === "api" && p[2] === "files" && /^\d+$/.test(p[3] ?? "")) return `/f/${p[3]}`;
  if (p[0] !== "courses" || !p[1]) return null;

  const c = p[1];
  const [section, id, extra] = [p[2], p[3], p[4]];
  const base = `/c/${c}`;
  switch (section) {
    case undefined:
    case "wiki":
      return base;
    case "assignments":
      if (id === "syllabus") return `${base}/syllabus`;
      if (!id) return `${base}/assignments`;
      return extra ? null : `${base}/a/${id}`; // submission and peer-review pages stay in Quercus
    case "pages":
      return id ? `${base}/p/${id}` : `${base}/pages`;
    case "discussion_topics":
      return id ? `${base}/d/${id}` : `${base}/discussions`;
    case "announcements":
      return `${base}/announcements`;
    case "modules":
      return id ? null : `${base}/modules`;
    case "grades":
      return `${base}/grades`;
    case "files":
      if (id === "folder") return `${base}/files`;
      if (id && /^\d+$/.test(id)) return `${base}/f/${id}`;
      return `${base}/files`;
    default:
      return null;
  }
}

/** In-app route for a module item, or null when it has to open in Quercus or the browser. */
export function itemRoute(cid: string | number, it: ModuleItem): string | null {
  switch (it.type) {
    case "Page": return `/c/${cid}/p/${it.page_url}`;
    case "Assignment": return `/c/${cid}/a/${it.content_id}`;
    case "Discussion": return `/c/${cid}/d/${it.content_id}`;
    case "File": return `/c/${cid}/f/${it.content_id}`;
    default: return null;
  }
}

export function openItem(cid: string | number, it: ModuleItem) {
  const r = itemRoute(cid, it);
  if (r) return go(r);
  openExternal(it.type === "ExternalUrl" ? it.external_url! : it.html_url!);
}

export async function saveAndOpen(fileId: number, folder: string, courseId?: number, name?: string) {
  try {
    const path = await invoke<string>("download_file", { fileId, courseId: courseId ?? null, folder });
    // Risky types are saved but never auto-opened: opening would run them with their default program.
    // The user has to choose to open, and even then we reveal it in the folder rather than launch it.
    if (name && isRiskyToOpen(name)) {
      toast(`Saved ${name} to Downloads. This type can run programs, so Quirkus won't open it for you.`, {
        label: "Show in folder",
        run: () => invoke("reveal_path", { path }),
      });
      return;
    }
    await invoke("open_path", { path });
    toast(`Saved to ${path}`, { label: "Show in folder", run: () => invoke("reveal_path", { path }) });
  } catch (e) {
    toast(`Couldn't open the file: ${e}`);
  }
}

export function openExternal(href: string) {
  const url = new URL(href, BASE).toString();
  invoke("open_url", { url }).catch((e) => toast(String(e)));
}

/** Open any link found in Quercus content: in-app if we can, otherwise a Quercus window or the browser. */
export function openLink(href: string) {
  const r = routeFor(href);
  if (r) go(r);
  else openExternal(href);
}
