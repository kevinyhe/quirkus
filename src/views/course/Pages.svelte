<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago } from "../../lib/format";
  import { go } from "../../lib/router.svelte";
  import State from "../../components/State.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { Page } from "../../lib/types";

  let { cid }: { cid: string } = $props();
  const pages = query<Page[]>(() => P.pages(cid), 300);
  let filter = $state("");
  const shown = $derived((pages.data ?? []).filter((p) => p.title.toLowerCase().includes(filter.toLowerCase())));
</script>

<div class="toolbar"><span class="grow"></span><input bind:value={filter} placeholder="Filter pages" /></div>
<State q={pages} rows={8}>
  <div class="table">
    <table class="grid">
      <thead><tr><th>Name</th><th class="nowrap hide-sm">Updated</th></tr></thead>
      <tbody>
        {#each shown as p (p.page_id)}
          <tr class="click" onclick={() => go(`/c/${cid}/p/${p.url}`)}>
            <td class="name"><a href="#/c/{cid}/p/{p.url}" onclick={(e) => e.stopPropagation()}><Icon name={p.front_page ? "home" : "page"} /><span class="ellipsis">{p.title}</span></a></td>
            <td class="nowrap muted hide-sm">{ago(p.updated_at)}</td>
          </tr>
        {:else}
          <tr><td colspan="2" class="empty">No pages.</td></tr>
        {/each}
      </tbody>
    </table>
  </div>
</State>
