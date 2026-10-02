<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onDestroy } from "svelte";
  import { query, BASE } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago, bytes } from "../../lib/format";
  import { fileIcon } from "../../lib/icons";
  import { fileKind, looksLikeText } from "../../lib/filekind";
  import type { Rich } from "../../lib/convert";
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

  const what = $derived(meta.data ? fileKind(meta.data.display_name, meta.data["content-type"] ?? "") : null);
  /** Unknown types that turn out to be plain text are shown as text. */
  let sniffed = $state(false);
  const kind = $derived(what ? (sniffed ? "text" : what.kind) : null);

  // Everything except PDFs loads as bytes through Rust (with your session), then is shown from memory.
  const SNIFF_MAX = 2 << 20;
  const TEXT_MAX = 1_000_000;
  let blobUrl = $state("");
  let text = $state("");
  let rich = $state<Rich | null>(null);
  let loadError = $state("");
  let busy = $state(false);
  let started = false;
  const clip = (s: string) => (s.length > TEXT_MAX ? s.slice(0, TEXT_MAX) + "\n\n… (truncated; use Open in app to see the rest)" : s);
  $effect(() => {
    const w = what;
    const f = meta.data;
    if (!f || !w || w.kind === "pdf" || f.locked_for_user || started) return;
    if (w.kind === "other" && f.size > SNIFF_MAX) return;
    started = true;
    busy = true;
    invoke<ArrayBuffer>("file_bytes", { fileId: Number(id), courseId: courseId ?? null })
      .then(async (buf) => {
        if (w.kind === "text") text = clip(new TextDecoder().decode(buf));
        else if (w.kind === "other") {
          const s = looksLikeText(buf);
          if (s != null) {
            text = clip(s);
            sniffed = true;
          }
        } else if (w.kind === "rich") {
          try {
            rich = await (await import("../../lib/convert")).convert(w.format!, buf, f.display_name);
          } catch {
            loadError = "This file couldn't be read. It may be damaged or password-protected. Open in app to try your default program.";
          }
        } else blobUrl = URL.createObjectURL(new Blob([buf], { type: w.mime || f["content-type"] }));
      })
      .catch((e) => (loadError = String(e) === "too-large" ? "This file is over 200 MB. Use Open in app instead." : `Couldn't load this file: ${e}`))
      .finally(() => (busy = false));
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

<div class={kind === "pdf" || rich?.kind === "sheets" ? "page wide" : "page"}>
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
        <div style="display:flex;gap:8px">
          <button class="solid" onclick={() => saveAndOpen(Number(id), folder, courseId)}><Icon name="download" size={15} />Open in app</button>
          <button class="ghost" onclick={() => openExternal(quercusUrl)}>Preview in Quercus<Icon name="external" size={13} /></button>
        </div>
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
        {#if text}<pre class="text">{text}</pre>{:else if busy}<div class="loading"><div></div><div></div><div></div></div>{:else}<p class="empty">This file is empty.</p>{/if}
      {:else if kind === "rich"}
        {#if rich}
          {#await import("../../components/RichView.svelte") then m}<m.default {rich} />{/await}
        {:else}<div class="loading"><div></div><div></div><div></div></div>{/if}
      {:else if busy}
        <div class="loading"><div></div><div></div><div></div></div>
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
