// Which viewer a file gets. Decided from the name first: Quercus often reports "application/octet-stream".

export type RichFormat = "docx" | "odt" | "sheet" | "csv" | "pptx" | "odp" | "notebook" | "markdown" | "html" | "zip";
export type FileKind = "pdf" | "image" | "video" | "audio" | "text" | "rich" | "other";

const IMAGE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  bmp: "image/bmp", avif: "image/avif", ico: "image/x-icon",
};
const VIDEO: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", ogv: "video/ogg" };
const AUDIO: Record<string, string> = {
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg",
};
const RICH: Record<string, RichFormat> = {
  docx: "docx", docm: "docx", odt: "odt",
  xlsx: "sheet", xlsm: "sheet", xls: "sheet", ods: "sheet", csv: "csv", tsv: "csv",
  pptx: "pptx", ppsx: "pptx", pptm: "pptx", odp: "odp",
  ipynb: "notebook", md: "markdown", markdown: "markdown", html: "html", htm: "html",
  zip: "zip", jar: "zip",
};
const TEXT = new Set(
  ("txt text log json jsonl xml yaml yml toml ini cfg conf env properties tex bib sty cls rst adoc org srt vtt diff patch " +
    "py pyi java kt kts scala groovy gradle c h cpp hpp cc cxx hh cs go rs swift m mm js mjs cjs ts jsx tsx vue svelte css scss less " +
    "r rmd qmd jl sql sh bash zsh fish bat cmd ps1 pl php rb lua dart hs lhs ml mli rkt scm lisp clj cljs ex exs erl " +
    "asm s v sv vhd vhdl tcl f f90 f95 pas proto graphql cmake mk make lock").split(" "),
);
/** Files with no extension that are still plain text. */
const TEXT_NAMES = new Set(["makefile", "dockerfile", "readme", "license", "gemfile", "rakefile", ".gitignore", ".gitattributes"]);

// Types that run code or that an app opens into something that can (macros, shortcuts, installers).
// We still save these; we just don't auto-open them without the user saying so.
const RISKY = new Set(
  ("exe msi msix bat cmd com scr pif ps1 psm1 vbs vbe wsf wsh js jse jar lnk reg msc hta cpl inf " +
    "sh bash command run bin app dmg pkg mpkg deb rpm appimage apk " +
    "docm dotm xlsm xltm xlsb pptm potm ppsm").split(" "),
);

export function isRiskyToOpen(name: string): boolean {
  const e = ext(name);
  // No extension is also risky: the OS falls back to whatever is registered, and it hides the real type.
  return e === "" || RISKY.has(e);
}

export function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function fileKind(name: string, type = ""): { kind: FileKind; format?: RichFormat; mime?: string } {
  const e = ext(name);
  if (type === "application/pdf" || e === "pdf") return { kind: "pdf" };
  if (RICH[e]) return { kind: "rich", format: RICH[e] };
  if (IMAGE[e] || type.startsWith("image/")) return { kind: "image", mime: IMAGE[e] ?? type };
  if (VIDEO[e] || type.startsWith("video/")) return { kind: "video", mime: VIDEO[e] ?? type };
  if (AUDIO[e] || type.startsWith("audio/")) return { kind: "audio", mime: AUDIO[e] ?? type };
  if (TEXT.has(e) || TEXT_NAMES.has(name.toLowerCase()) || type.startsWith("text/") || type === "application/json") return { kind: "text" };
  return { kind: "other" };
}

/** True when the bytes read as text: valid UTF-8 with no NUL bytes. Lets unknown extensions open if they're plain text. */
export function looksLikeText(buf: ArrayBuffer): string | null {
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 8192));
  if (!buf.byteLength || head.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}
