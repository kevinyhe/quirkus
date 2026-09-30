<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { tree, toggle, set } from "../../lib/tree.svelte";
  import State from "../../components/State.svelte";
  import Icon from "../../components/Icon.svelte";
  import ModuleItems from "./ModuleItems.svelte";
  import type { Module } from "../../lib/types";

  let { cid }: { cid: string } = $props();
  const mods = query<Module[]>(() => P.modules(cid), 300);

  // Modules start open. `modc<id>` marks one collapsed; it's saved so it stays collapsed next time.
  const isOpen = (id: number) => !tree[`modc${id}`];
  function all(open: boolean) {
    set(Object.fromEntries((mods.data ?? []).map((m) => [`modc${m.id}`, !open])));
  }
</script>

<div class="toolbar">
  <span class="grow"></span>
  <button onclick={() => all(false)}>Collapse all</button>
  <button onclick={() => all(true)}>Expand all</button>
</div>
<State q={mods} rows={10}>
  {#each mods.data ?? [] as m (m.id)}
    {@const open = isOpen(m.id)}
    <section class="module" class:open>
      <button class="module-head" onclick={() => toggle(`modc${m.id}`)} aria-expanded={open}>
        <Icon name="chevron" size={14} class="chev" />
        <span>{m.name}</span>
        {#if m.state === "locked"}<span class="tag"><Icon name="lock" size={12} />Locked</span>{/if}
        {#if m.items}<span class="n">{m.items.filter((i) => i.type !== "SubHeader").length} items</span>{/if}
      </button>
      {#if open}
        <div class="module-body"><ModuleItems {cid} module={m} /></div>
      {/if}
    </section>
  {:else}
    <p class="empty">No modules.</p>
  {/each}
</State>
