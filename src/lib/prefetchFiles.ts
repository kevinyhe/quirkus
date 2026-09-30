import { invoke } from "@tauri-apps/api/core";
import type { ModuleItem } from "./types";

const asked = new Set<number>();

/** Start downloading a module's files in the background so they open instantly. Rust picks which are worth it. */
export function prefetchModuleFiles(cid: string | number, items: ModuleItem[]) {
  const ids = items.filter((i) => i.type === "File" && i.content_id && !asked.has(i.content_id)).map((i) => i.content_id!);
  if (!ids.length) return;
  ids.forEach((id) => asked.add(id));
  invoke("prefetch_files", { courseId: Number(cid), fileIds: ids }).catch(() => {});
}
