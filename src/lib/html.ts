import DOMPurify from "dompurify";
import { BASE } from "./api.svelte";

/** Our proxy scheme for authenticated Quercus resources. Windows' webview needs the http form. */
const PROXY = navigator.userAgent.includes("Windows") ? "http://qc.localhost" : "qc://localhost";

function proxied(src: string): string {
  try {
    const u = new URL(src, BASE);
    return u.origin === BASE ? PROXY + u.pathname + u.search : src;
  } catch {
    return src;
  }
}

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element;
  if (el.tagName === "IMG" || el.tagName === "SOURCE" || el.tagName === "VIDEO" || el.tagName === "AUDIO") {
    const src = el.getAttribute("src");
    if (src) el.setAttribute("src", proxied(src));
    el.removeAttribute("srcset");
    if (el.tagName === "IMG") el.setAttribute("loading", "lazy");
  }
  if (el.tagName === "IFRAME") {
    const src = el.getAttribute("src") ?? "";
    if (!src.startsWith("https://")) el.removeAttribute("src");
    else el.setAttribute("loading", "lazy");
  }
  if (el.tagName === "A") el.removeAttribute("target");
});

const cache = new Map<string, string>();

/** Sanitize Canvas rich content and point its images at the authenticated proxy. */
export function clean(html: string | null | undefined): string {
  if (!html) return "";
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  const out = DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "loading"],
    FORBID_TAGS: ["style", "form", "input", "button"],
    FORBID_ATTR: ["style"],
  });
  if (cache.size > 300) cache.clear();
  cache.set(html, out);
  return out;
}
