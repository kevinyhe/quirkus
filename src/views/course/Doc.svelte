<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy } from "svelte";
  import { query, BASE } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago, bytes } from "../../lib/format";
  import { fileIcon } from "../../lib/icons";
  import { saveAndOpen, openExternal } from "../../lib/links";
  import Top from "../../components/Top.svelte";
  import Eyebrow from "../../components/Eyebrow.svelte";
  import State from "../../components/State.svelte";
  import Html from "../../components/Html.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { Crumb, FileItem } from "../../lib/types";

  let { id, cid, base = [], code = "" }: { id: string; cid?: string; base?: Crumb[]; code?: string } = $props();

  const courseId = $derived(cid ? Number(cid) : undefined);
  const meta = query<FileItem>(() => P.fileMeta(id, cid), 300);

  const TEXT = /\.(txt|md|csv|tsv|json|xml|ya?ml|py|java|c|h|cpp|hpp|cc|js|ts|jsx|tsx|r|rmd|sql|sh|m|hs|rkt|scm|ml|go|rs|tex|bib|log|ini|cfg|toml|html|css)$/i;
  const kind = $derived.by(() => {
    const f = meta.data;
    if (!f) return null;
    const t = f["content-type"] ?? "";
    const n = f.display_name;
    if (t === "application/pdf" || /\.pdf$/i.test(n)) return "pdf";
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("text/") || t === "application/json" || TEXT.test(n)) return "text";
    return "other";
  });

  // Images, audio, video and text load as bytes through Rust (with your session), then display from a blob URL.
  let blobUrl = $state("");
  let text = $state("");
  let loadError = $state("");
  let started = false;
  $effect(() => {
    const k = kind;
    const f = meta.data;
    if (!f || !k || k === "pdf" || k === "other" || f.locked_for_user || started) return;
    started = true;
    invoke<ArrayBuffer>("file_bytes", { fileId: Number(id), courseId: courseId ?? null })
      .then((buf) => {
        if (k === "text") {
          const s = new TextDecoder().decode(buf);
          text = s.length > 1_000_000 ? s.slice(0, 1_000_000) + "\n\n… (truncated; use Open in app to see the rest)" : s;
        } else {
          blobUrl = URL.createObjectURL(new Blob([buf], { type: f["content-type"] }));
        }
      })
      .catch((e) => (loadError = String(e) === "too-large" ? "This file is over 200 MB. Use Open in app instead." : `Couldn't load this file: ${e}`));
  });
  onDestroy(() => blobUrl && URL.revokeObjectURL(blobUrl));

  const folder = $derived(code || "Files");
  const quercusUrl = $derived(cid ? `${BASE}/courses/${cid}/files/${id}` : `${BASE}/files/${id}`);
  const section = $derived<Crumb>({ icon: "folder", label: "Files", href: cid ? `/c/${cid}/files` : undefined });
  const crumbs = $derived<Crumb[]>(
    cid ? [...base, section, { label: meta.data?.display_name ?? "…" }] : [{ icon: "file", label: meta.data?.display_name ?? "File" }],
  );
</script>

<Top {crumbs}>
  {#if meta.data && !meta.data.locked_for_user}
    <button onclick={() => saveAndOpen(Number(id), folder, courseId)} title="Save to Downloads/Quercus and open with its default app">
      <Icon name="download" size={15} />Open in app
    </button>
  {/if}
  <button onclick={() => openExternal(quercusUrl)}>Quercus<Icon name="external" size={13} /></button>
</Top>

<div class={kind === "pdf" ? "page wide" : "page"}>
  <State q={meta} rows={6}>
    {@const f = meta.data!}
    {#if cid}<Eyebrow {base} {section} />{/if}
    <div class="head-row">
      <span style="color:var(--text-3);margin-top:5px"><Icon name={fileIcon(f.display_name, f["content-type"])} size={24} /></span>
      <div class="grow">
        <h1 class="title">{f.display_name}</h1>
        <p class="subtitle">{bytes(f.size)} · updated {ago(f.updated_at)}</p>
      </div>
    </div>

    <div class="viewer">
      {#if f.locked_for_user}
        <div class="note"><Icon name="lock" />{#if f.lock_explanation}<Html html={f.lock_explanation} />{:else}<span>This file is locked.</span>{/if}</div>
      {:else if loadError}
        <div class="note bad"><Icon name="warn" /><span>{loadError}</span></div>
      {:else if kind === "pdf"}
        {#await import("../../components/PdfView.svelte")}
          <div class="loading"><div style="height:60vh"></div></div>
        {:then m}
          <m.default {id} {courseId} />
        {:catch e}
          <div class="note bad"><Icon name="warn" /><span>Couldn't start the PDF viewer: {e}</span></div>
        {/await}
      {:else if kind === "image"}
        {#if blobUrl}<img class="full" src={blobUrl} alt={f.display_name} />{:else}<div class="loading"><div style="height:40vh"></div></div>{/if}
      {:else if kind === "video"}
        <!-- svelte-ignore a11y_media_has_caption -->
        {#if blobUrl}<video src={blobUrl} controls></video>{:else}<div class="loading"><div style="height:40vh"></div></div>{/if}
      {:else if kind === "audio"}
        {#if blobUrl}<audio src={blobUrl} controls></audio>{:else}<div class="loading"><div></div></div>{/if}
      {:else if kind === "text"}
        {#if text}<pre class="text">{text}</pre>{:else}<div class="loading"><div></div><div></div><div></div></div>{/if}
      {:else}
        <div class="note">
          <Icon name={fileIcon(f.display_name, f["content-type"])} />
          <span>This file type can't be shown here. <b>Open in app</b> saves it to Downloads and opens it with your default program. <b>Preview in Quercus</b> uses Quercus's own viewer.</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="solid" onclick={() => saveAndOpen(Number(id), folder, courseId)}><Icon name="download" size={15} />Open in app</button>
          <button class="ghost" onclick={() => openExternal(quercusUrl)}>Preview in Quercus<Icon name="external" size={13} /></button>
        </div>
      {/if}
    </div>
  </State>
</div>
