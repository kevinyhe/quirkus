/** Icon name per course section (see components/Icon.svelte). */
export const SECTION_ICON: Record<string, string> = {
  home: "home",
  "": "home",
  announcements: "megaphone",
  assignments: "assignment",
  discussions: "discussion",
  grades: "grades",
  pages: "page",
  files: "folder",
  syllabus: "syllabus",
  modules: "modules",
  quizzes: "quiz",
  people: "people",
};

export const ITEM_ICON: Record<string, string> = {
  File: "file",
  Page: "page",
  Discussion: "discussion",
  Assignment: "assignment",
  Quiz: "quiz",
  ExternalUrl: "link",
  ExternalTool: "tool",
};

export function fileIcon(name: string, type = ""): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type === "application/pdf" || ext === "pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/") || type.startsWith("audio/")) return "video";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "slides";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (["doc", "docx", "rtf", "odt", "txt", "md"].includes(ext)) return "page";
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "archive";
  if (["py", "java", "c", "cpp", "h", "js", "ts", "r", "rmd", "sql", "ipynb", "m", "hs", "rkt", "sh", "json"].includes(ext)) return "code";
  return "file";
}

/** "CSC263H1 F LEC0101" → "CSC". Shown in the course's color square. */
export function subject(code: string | undefined): string {
  const m = (code ?? "").match(/^[A-Za-z]{2,4}/);
  return (m?.[0] ?? "•").toUpperCase().slice(0, 3);
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
