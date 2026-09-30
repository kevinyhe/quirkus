<script lang="ts">
  import type { Snippet } from "svelte";
  import { refreshAll } from "../lib/api.svelte";
  import { toggleSidebar } from "../lib/ui.svelte";
  import type { Crumb } from "../lib/types";
  import Icon from "./Icon.svelte";
  import Mark from "./Mark.svelte";

  let { crumbs, children }: { crumbs: Crumb[]; children?: Snippet } = $props();
</script>

{#snippet crumb(c: Crumb)}
  {#if c.course}<Mark id={c.course.id} code={c.course.code} size={18} />{:else if c.icon}<Icon name={c.icon} size={15} />{/if}
  <span class="ellipsis">{c.label}</span>
{/snippet}

<header class="topbar">
  <button class="icon" onclick={toggleSidebar} title="Show or hide the sidebar (Ctrl \)"><Icon name="sidebar" /></button>
  <button class="icon hide-xs" onclick={() => history.back()} title="Back (Alt ←)"><Icon name="back" /></button>
  <button class="icon hide-xs" onclick={() => history.forward()} title="Forward (Alt →)"><Icon name="forward" /></button>
  <nav class="crumbs" aria-label="Breadcrumb">
    {#each crumbs as c, i}
      {#if i > 0}<Icon name="chevron" size={13} class="sep" />{/if}
      {#if c.href && i < crumbs.length - 1}
        <a href="#{c.href}">{@render crumb(c)}</a>
      {:else}
        <span class="here">{@render crumb(c)}</span>
      {/if}
    {/each}
  </nav>
  <div class="actions">
    {@render children?.()}
    <button class="icon" onclick={refreshAll} title="Refresh from Quercus (Ctrl R)"><Icon name="refresh" /></button>
  </div>
</header>
