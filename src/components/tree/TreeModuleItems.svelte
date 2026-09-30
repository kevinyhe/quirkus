<script lang="ts">
  import { query, BASE } from "../../lib/api.svelte";
  import { ITEM_ICON } from "../../lib/icons";
  import { itemRoute, openItem } from "../../lib/links";
  import { prefetchModuleFiles } from "../../lib/prefetchFiles";
  import TreeRow from "./TreeRow.svelte";
  import type { Module, ModuleItem } from "../../lib/types";

  let { cid, module }: { cid: number; module: Module } = $props();

  // Canvas leaves `items` out of large modules. Fetch them (same path as the Modules page, so one cache entry).
  const extra = query<ModuleItem[]>(() => (module.items ? null : module.items_url.replace(BASE, "") + "?include[]=content_details"), 300);
  const items = $derived(module.items ?? extra.data ?? []);
  const pad = `${3 * 14 + 30}px`;

  $effect(() => {
    if (items.length) prefetchModuleFiles(cid, items);
  });
</script>

{#each items as it (it.id)}
  {#if it.type === "SubHeader"}
    <div class="tree-note" style:padding-left={pad}>{it.title}</div>
  {:else}
    <TreeRow depth={3} icon={ITEM_ICON[it.type]} label={it.title} href={itemRoute(cid, it)} onclick={() => openItem(cid, it)} />
  {/if}
{:else}
  <div class="tree-note" style:padding-left={pad}>{extra.loading ? "Loading…" : extra.error ? "Couldn't load" : "Empty"}</div>
{/each}
