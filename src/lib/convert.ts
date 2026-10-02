// Turns document formats into something the viewer can draw. Imported on demand: the libraries are large.
// Everything runs locally on bytes the app already downloaded. Output HTML is sanitized by <Html> before display.

import { unzipSync, strFromU8 } from "fflate";
import type { RichFormat } from "./filekind";

export interface Sheet {
  name: string;
  rows: string[][];
  /** Rows left out because the sheet is longer than MAX_ROWS. */
  more: number;
}
export interface Slide {
  n: number;
  title: string;
  lines: string[];
  images: string[];
}
export interface Cell {
  type: "markdown" | "code" | "raw";
  html?: string;
  source: string;
  outputs: { text?: string; image?: string; html?: string }[];
}
export type Rich =
  | { kind: "html"; html: string }
  | { kind: "sheets"; sheets: Sheet[] }
  | { kind: "slides"; slides: Slide[]; urls: string[] }
  | { kind: "archive"; entries: { name: string; size: number }[] }
  | { kind: "notebook"; cells: Cell[]; language: string };

const MAX_ROWS = 2000;
const MAX_COLS = 60;

const text = (buf: ArrayBuffer) => new TextDecoder().decode(buf);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
/** Elements by local name, whatever the namespace prefix. */
const tags = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS("*", name));

export async function convert(format: RichFormat, buf: ArrayBuffer, name: string): Promise<Rich> {
  switch (format) {
    case "docx": {
      const mammoth = (await import("mammoth/mammoth.browser")).default;
      return { kind: "html", html: (await mammoth.convertToHtml({ arrayBuffer: buf })).value };
    }
    case "odt":
      return { kind: "html", html: odt(buf) };
    case "sheet":
    case "csv":
      return { kind: "sheets", sheets: await sheets(buf, format === "csv", name) };
    case "pptx":
      return pptx(buf);
    case "odp":
      return { kind: "slides", slides: odp(buf), urls: [] };
    case "notebook":
      return notebook(text(buf));
    case "markdown":
      return { kind: "html", html: await markdown(text(buf)) };
    case "html":
      return { kind: "html", html: text(buf) };
    case "zip":
      return { kind: "archive", entries: zipEntries(buf) };
  }
}

async function markdown(src: string): Promise<string> {
  const { marked } = await import("marked");
  return marked.parse(src, { async: false, gfm: true }) as string;
}

async function sheets(buf: ArrayBuffer, isText: boolean, name: string): Promise<Sheet[]> {
  const XLSX = await import("xlsx");
  const wb = isText
    ? XLSX.read(text(buf), { type: "string", raw: true, FS: /\.tsv$/i.test(name) ? "\t" : undefined })
    : XLSX.read(buf, { type: "array" });
  return wb.SheetNames.map((n) => {
    const all = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, defval: "", blankrows: false });
    const rows = all.slice(0, MAX_ROWS).map((r) => r.slice(0, MAX_COLS).map((c) => String(c ?? "")));
    return { name: n, rows, more: Math.max(0, all.length - MAX_ROWS) };
  }).filter((s) => s.rows.length);
}

// ---------- PowerPoint ----------

/** Resolve "../media/image1.png" against "ppt/slides/slide1.xml". */
function resolve(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function rels(files: Record<string, Uint8Array>, part: string): Map<string, string> {
  const i = part.lastIndexOf("/");
  const file = files[`${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`];
  const out = new Map<string, string>();
  if (!file) return out;
  for (const r of tags(xml(strFromU8(file)), "Relationship")) {
    const [id, target] = [r.getAttribute("Id"), r.getAttribute("Target")];
    if (id && target && r.getAttribute("TargetMode") !== "External") out.set(id, target.startsWith("/") ? target.slice(1) : resolve(part, target));
  }
  return out;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", bmp: "image/bmp", webp: "image/webp" };

/** Slide text and pictures, in presentation order. Layout, charts, and animations aren't reproduced. */
function pptx(buf: ArrayBuffer): Rich {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^ppt\/(presentation\.xml|_rels\/|slides\/|media\/)/.test(f.name) });
  const pres = files["ppt/presentation.xml"];
  const presRels = rels(files, "ppt/presentation.xml");
  let order = pres ? tags(xml(strFromU8(pres)), "sldId").map((s) => presRels.get(s.getAttribute("r:id") ?? "")).filter((p): p is string => !!p && p in files) : [];
  if (!order.length) {
    const num = (p: string) => Number(p.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
    order = Object.keys(files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b));
  }
  const urls: string[] = [];
  const slides = order.map((path, i) => {
    const doc = xml(strFromU8(files[path]));
    const slideRels = rels(files, path);
    let title = "";
    const lines: string[] = [];
    for (const shape of tags(doc, "sp")) {
      const ph = tags(shape, "ph")[0]?.getAttribute("type") ?? "";
      const paras = tags(shape, "p").map((p) => tags(p, "t").map((t) => t.textContent ?? "").join("").trim()).filter(Boolean);
      if (!title && (ph === "title" || ph === "ctrTitle") && paras.length) title = paras.join(" ");
      else if (ph !== "sldNum" && ph !== "dt" && ph !== "ftr") lines.push(...paras);
    }
    // Tables and grouped shapes keep their text outside <p:sp>.
    for (const cell of tags(doc, "tc")) {
      const t = tags(cell, "t").map((x) => x.textContent ?? "").join("").trim();
      if (t) lines.push(t);
    }
    const images: string[] = [];
    for (const blip of tags(doc, "blip")) {
      const target = slideRels.get(blip.getAttribute("r:embed") ?? "");
      const type = MIME[target?.split(".").pop()?.toLowerCase() ?? ""];
      if (!target || !type || !files[target]) continue;
      const url = URL.createObjectURL(new Blob([files[target] as BlobPart], { type }));
      urls.push(url);
      images.push(url);
    }
    return { n: i + 1, title, lines, images };
  });
  return { kind: "slides", slides, urls };
}

// ---------- OpenDocument ----------

function odfContent(buf: ArrayBuffer): Document {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === "content.xml" });
  if (!files["content.xml"]) throw new Error("no content.xml");
  return xml(strFromU8(files["content.xml"]));
}

function odt(buf: ArrayBuffer): string {
  const body = tags(odfContent(buf), "text")[0];
  if (!body) return "";
  let out = "";
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      const t = (c.textContent ?? "").trim();
      if (c.localName === "h") out += `<h${Math.min(6, Number(c.getAttribute("text:outline-level") ?? 2))}>${esc(t)}</h${Math.min(6, Number(c.getAttribute("text:outline-level") ?? 2))}>`;
      else if (c.localName === "p") out += t ? `<p>${esc(t)}</p>` : "";
      else if (c.localName === "list") out += `<ul>${tags(c, "list-item").map((li) => `<li>${esc((li.textContent ?? "").trim())}</li>`).join("")}</ul>`;
      else if (c.localName === "table") {
        out += `<table>${tags(c, "table-row").map((r) => `<tr>${tags(r, "table-cell").map((d) => `<td>${esc((d.textContent ?? "").trim())}</td>`).join("")}</tr>`).join("")}</table>`;
      } else walk(c);
    }
  };
  walk(body);
  return out;
}

function odp(buf: ArrayBuffer): Slide[] {
  return tags(odfContent(buf), "page").map((page, i) => {
    const lines = tags(page, "p").map((p) => (p.textContent ?? "").trim()).filter(Boolean);
    return { n: i + 1, title: lines.shift() ?? "", lines, images: [] };
  });
}

// ---------- Jupyter ----------

type Json = Record<string, unknown>;
const joined = (v: unknown) => (Array.isArray(v) ? v.join("") : typeof v === "string" ? v : "");
// Terminal colour codes in tracebacks.
const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

async function notebook(src: string): Promise<Rich> {
  const nb = JSON.parse(src) as Json;
  const meta = (nb.metadata ?? {}) as Json;
  const language = String(((meta.kernelspec as Json)?.language ?? (meta.language_info as Json)?.name ?? "") || "");
  const cells: Cell[] = [];
  for (const c of (Array.isArray(nb.cells) ? nb.cells : []) as Json[]) {
    const source = joined(c.source);
    if (c.cell_type === "markdown") {
      cells.push({ type: "markdown", source, html: await markdown(source), outputs: [] });
      continue;
    }
    const outputs: Cell["outputs"] = [];
    for (const o of (Array.isArray(c.outputs) ? c.outputs : []) as Json[]) {
      const data = (o.data ?? {}) as Json;
      if (o.output_type === "stream") outputs.push({ text: joined(o.text) });
      else if (o.output_type === "error") outputs.push({ text: (Array.isArray(o.traceback) ? o.traceback.join("\n") : `${o.ename}: ${o.evalue}`).replace(ANSI, "") });
      else if (typeof data["image/png"] === "string") outputs.push({ image: `data:image/png;base64,${(data["image/png"] as string).replace(/\s/g, "")}` });
      else if (typeof data["image/jpeg"] === "string") outputs.push({ image: `data:image/jpeg;base64,${(data["image/jpeg"] as string).replace(/\s/g, "")}` });
      else if (data["text/html"]) outputs.push({ html: joined(data["text/html"]) });
      else if (data["text/plain"]) outputs.push({ text: joined(data["text/plain"]) });
    }
    cells.push({ type: c.cell_type === "code" ? "code" : "raw", source, outputs });
  }
  return { kind: "notebook", cells, language };
}

// ---------- zip ----------

/** File names and sizes from the zip's directory. Nothing is unpacked. */
function zipEntries(buf: ArrayBuffer): { name: string; size: number }[] {
  const v = new DataView(buf);
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip file");
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out: { name: string; size: number }[] = [];
  for (let n = 0; n < count && at + 46 <= buf.byteLength && v.getUint32(at, true) === 0x02014b50; n++) {
    const [nameLen, extraLen, commentLen] = [v.getUint16(at + 28, true), v.getUint16(at + 30, true), v.getUint16(at + 32, true)];
    const name = new TextDecoder().decode(new Uint8Array(buf, at + 46, nameLen));
    if (!name.endsWith("/")) out.push({ name, size: v.getUint32(at + 24, true) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
