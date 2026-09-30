<script lang="ts">
  // Loaded on demand (dynamic import), so pdf.js costs nothing until you open a PDF.
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy, onMount } from "svelte";
  import * as pdfjs from "pdfjs-dist";
  import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
  import "../lib/pdf-text.css";

  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  import Icon from "./Icon.svelte";

  let { id, courseId }: { id: string; courseId?: number } = $props();

  let host: HTMLDivElement | undefined = $state();
  let doc: pdfjs.PDFDocumentProxy | null = null;
  let loading: pdfjs.PDFDocumentLoadingTask | null = null;
  let count = $state(0);
  let ratio = $state(1.294); // height / width of page 1; used to size placeholders
  let zoom = $state(1);
  let current = $state(1);
  let error = $state("");
  let width = $state(800);

  const pageEls: HTMLDivElement[] = [];
  const rendered = new Map<number, number>(); // page -> width it was rendered at
  const tasks = new Map<number, pdfjs.RenderTask>();
  let observer: IntersectionObserver | null = null;

  const pageWidth = $derived(Math.round(Math.min(width, 1400) * zoom));

  onMount(async () => {
    try {
      const bytes = await invoke<ArrayBuffer>("file_bytes", { fileId: Number(id), courseId: courseId ?? null });
      loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
      doc = await loading.promise;
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      ratio = vp.height / vp.width;
      count = doc.numPages;
    } catch (e) {
      error = String(e) === "too-large" ? "This PDF is over 200 MB. Open it in your PDF app instead." : `Couldn't open this PDF: ${e}`;
    }
  });

  onDestroy(() => {
    observer?.disconnect();
    tasks.forEach((t) => t.cancel());
    loading?.destroy();
  });

  // Track available width so "fit width" follows the window.
  $effect(() => {
    if (!host) return;
    const ro = new ResizeObserver(([e]) => (width = e.contentRect.width));
    ro.observe(host);
    return () => ro.disconnect();
  });

  // Render pages as they come near the viewport. Re-render when the size changes.
  $effect(() => {
    if (!count || !host) return;
    void pageWidth;
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) render(Number((e.target as HTMLElement).dataset.page));
      },
      { root: document.getElementById("main"), rootMargin: "1200px 0px" },
    );
    pageEls.slice(0, count).forEach((el) => el && observer!.observe(el));
    return () => observer?.disconnect();
  });

  async function render(n: number) {
    if (!doc || rendered.get(n) === pageWidth) return;
    rendered.set(n, pageWidth);
    tasks.get(n)?.cancel();
    const el = pageEls[n - 1];
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: pageWidth / base.width });
    const dpr = window.devicePixelRatio || 1;

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    const task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
    tasks.set(n, task);
    try {
      await task.promise;
    } catch {
      return; // cancelled by a newer render
    }
    tasks.delete(n);

    const text = document.createElement("div");
    text.className = "textLayer";
    el.style.setProperty("--scale-factor", String(viewport.scale));
    el.style.setProperty("--user-unit", "1");
    el.style.setProperty("--total-scale-factor", String(viewport.scale));
    el.style.height = `${viewport.height}px`;
    el.replaceChildren(canvas, text);
    new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: text, viewport }).render().catch(() => {});
  }

  function onscroll() {
    const top = document.getElementById("main")!.getBoundingClientRect().top + 120;
    const i = pageEls.findIndex((el) => el && el.getBoundingClientRect().bottom > top);
    if (i >= 0) current = i + 1;
  }

  function jump(n: number) {
    pageEls[Math.max(0, Math.min(count - 1, n - 1))]?.scrollIntoView({ block: "start" });
  }

  $effect(() => {
    const main = document.getElementById("main");
    main?.addEventListener("scroll", onscroll, { passive: true });
    return () => main?.removeEventListener("scroll", onscroll);
  });

  function onkeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "=" || e.key === "+") zoom = Math.min(3, +(zoom + 0.25).toFixed(2));
    else if (e.key === "-") zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2));
    else if (e.key === "0") zoom = 1;
    else return;
    e.preventDefault();
  }
</script>

<svelte:window {onkeydown} />

{#if error}
  <div class="note bad"><Icon name="warn" /><span>{error}</span></div>
{:else}
  {#if count}
    <div class="pdf-bar">
      <button class="icon" onclick={() => jump(current - 1)} disabled={current <= 1} title="Previous page"><Icon name="up" /></button>
      <span class="n">{current} / {count}</span>
      <button class="icon" onclick={() => jump(current + 1)} disabled={current >= count} title="Next page"><Icon name="down" /></button>
      <span class="sep"></span>
      <button class="icon" onclick={() => (zoom = Math.max(0.5, +(zoom - 0.25).toFixed(2)))} title="Zoom out (Ctrl −)"><Icon name="minus" /></button>
      <button onclick={() => (zoom = 1)} title="Fit width (Ctrl 0)" class="num">{Math.round(zoom * 100)}%</button>
      <button class="icon" onclick={() => (zoom = Math.min(3, +(zoom + 0.25).toFixed(2)))} title="Zoom in (Ctrl +)"><Icon name="plus" /></button>
    </div>
  {:else}
    <div class="loading"><div style="height:60vh"></div></div>
  {/if}
  <div class="pdf" bind:this={host}>
    {#each { length: count } as _, i}
      <div class="pdf-page" data-page={i + 1} bind:this={pageEls[i]} style:width="{pageWidth}px" style:height="{pageWidth * ratio}px"></div>
    {/each}
  </div>
{/if}
