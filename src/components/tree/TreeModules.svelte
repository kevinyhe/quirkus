<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { tree, toggle } from "../../lib/tree.svelte";
  import TreeRow from "./TreeRow.svelte";
  import TreeModuleItems from "./TreeModuleItems.svelte";
  import type { Module } from "../../lib/types";

  let { cid }: { cid: number } = $props();

  const key = $derived(`m${cid}`);
  const open = $derived(!!tree[key]);
  // Same path as the Modules screen, so both read one cache entry.
  const mods = query<Module[]>(() => (open ? P.modules(cid) : null), 300);
  const indent = (d: number) => `${d * 14 + 30}px`;
</script>

<TreeRow depth={1} icon="modules" label="Modules" href="/c/{cid}/modules" {open} ontoggle={() => toggle(key)} />

{#if open}
  {#each mods.data ?? [] as m (m.id)}
    {@const mk = `mod${m.id}`}
    <TreeRow depth={2} icon="folder" label={m.name} open={!!tree[mk]} ontoggle={() => toggle(mk)} />
    {#if tree[mk]}<TreeModuleItems {cid} module={m} />{/if}
  {:else}
    {#if mods.loading}<div class="tree-note" style:padding-left={indent(2)}>Loading…</div>{/if}
    {#if mods.error}<div class="tree-note" style:padding-left={indent(2)}>Couldn't load modules</div>{/if}
  {/each}
{/if}
