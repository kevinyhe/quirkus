<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { query, toast } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago, bytes } from "../../lib/format";
  import { fileIcon } from "../../lib/icons";
  import { go } from "../../lib/router.svelte";
  import State from "../../components/State.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { FileItem, Folder } from "../../lib/types";

  let { cid, code, folder }: { cid: string; code: string; folder?: string } = $props();

  const root = query<Folder>(() => (folder ? null : P.rootFolder(cid)), 3600);
  const info = query<Folder>(() => (folder ? `/api/v1/folders/${folder}` : null), 600);
  const current = $derived(folder ? info.data : root.data);
  const fid = $derived(folder ?? root.data?.id);
  const folders = query<Folder[]>(() => (fid ? `/api/v1/folders/${fid}/folders` : null), 300);
  const files = query<FileItem[]>(() => (fid ? `/api/v1/folders/${fid}/files` : null), 300);
  const head = $derived(folder ? info : root);

  /** "course files/Lectures/Week 1" → ["Lectures", "Week 1"] */
  const path = $derived(current?.full_name.split("/").slice(1) ?? []);
  const localDir = $derived([code || "Course", ...path].join("/"));

  let syncing = $state(false);
  async function saveAll() {
    const list = (files.data ?? []).filter((f) => !f.locked_for_user);
    syncing = true;
    let ok = 0;
    for (const f of list) {
      try {
        await invoke("download_file", { fileId: f.id, courseId: Number(cid), folder: localDir });
        ok++;
      } catch {}
    }
    syncing = false;
    toast(`Saved ${ok} of ${list.length} files to Downloads/Quercus/${localDir}`);
  }
</script>

<div class="toolbar">
  <span class="grow muted small">
    <a href="#/c/{cid}/files">All files</a>{#each path as seg}<span class="path-sep">{seg}</span>{/each}
  </span>
  {#if files.data?.length}
    <button onclick={saveAll} disabled={syncing}><Icon name="download" size={15} />{syncing ? "Saving…" : "Save folder to Downloads"}</button>
  {/if}
</div>

{#if head.error}
  <div class="note"><Icon name="lock" /><span>This course hides its Files tab. Its files are linked from Modules instead.</span></div>
{:else}
  <State q={files} rows={8}>
    <div class="table">
      <table class="grid">
        <thead><tr><th>Name</th><th class="r">Size</th><th class="nowrap hide-sm">Updated</th></tr></thead>
        <tbody>
          {#if current?.parent_folder_id && path.length}
            <tr class="click" onclick={() => go(path.length > 1 ? `/c/${cid}/files/${current!.parent_folder_id}` : `/c/${cid}/files`)}>
              <td class="name" colspan="3"><span class="in muted" style="font-weight:400"><Icon name="back" />Up one folder</span></td>
            </tr>
          {/if}
          {#each folders.data ?? [] as f (f.id)}
            <tr class="click" onclick={() => go(`/c/${cid}/files/${f.id}`)}>
              <td class="name"><a href="#/c/{cid}/files/{f.id}" onclick={(e) => e.stopPropagation()}><Icon name="folder" /><span class="ellipsis">{f.name}</span></a></td>
              <td class="r muted">{f.files_count + f.folders_count} items</td>
              <td class="hide-sm"></td>
            </tr>
          {/each}
          {#each files.data ?? [] as f (f.id)}
            <tr class="click" class:dim={f.locked_for_user} onclick={() => go(`/c/${cid}/f/${f.id}`)}>
              <td class="name"><a href="#/c/{cid}/f/{f.id}" onclick={(e) => e.stopPropagation()}><Icon name={fileIcon(f.display_name, f["content-type"])} /><span class="ellipsis">{f.display_name}</span></a></td>
              <td class="r muted">{bytes(f.size)}</td>
              <td class="nowrap muted hide-sm">{ago(f.updated_at)}</td>
            </tr>
          {/each}
          {#if !folders.data?.length && !files.data?.length}
            <tr><td colspan="3" class="empty">This folder is empty.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </State>
{/if}
