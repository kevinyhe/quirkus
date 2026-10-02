<script lang="ts">
  import { onDestroy } from "svelte";
  import { bytes } from "../lib/format";
  import Html from "./Html.svelte";
  import type { Rich } from "../lib/convert";

  let { rich }: { rich: Rich } = $props();
  let tab = $state(0);

  onDestroy(() => {
    if (rich.kind === "slides") rich.urls.forEach((u) => URL.revokeObjectURL(u));
  });
</script>

{#if rich.kind === "html"}
  {#if rich.html.trim()}<div class="doc"><Html html={rich.html} /></div>{:else}<p class="empty">This document has no text.</p>{/if}
{:else if rich.kind === "sheets"}
  {#if rich.sheets.length > 1}
    <div class="seg" role="tablist" style="margin-bottom:10px;max-width:100%;overflow-x:auto">
      {#each rich.sheets as s, i}<button class:on={tab === i} onclick={() => (tab = i)}>{s.name}</button>{/each}
    </div>
  {/if}
  {@const s = rich.sheets[tab]}
  {#if s}
    <div class="table sheet">
      <table class="grid">
        <tbody>
          {#each s.rows as row, r}
            <tr>
              <td class="rn">{r + 1}</td>
              {#each row as cell}<td>{cell}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if s.more}<p class="small faint" style="margin-top:8px">{s.more} more rows not shown. Use Open in app to see the whole sheet.</p>{/if}
  {:else}
    <p class="empty">This spreadsheet is empty.</p>
  {/if}
{:else if rich.kind === "slides"}
  <p class="small faint" style="margin:0 0 10px">Text and pictures from each slide. Use Open in app for the original layout.</p>
  {#each rich.slides as s (s.n)}
    <section class="slide">
      <div class="slide-n">{s.n}</div>
      <div class="slide-body">
        {#if s.title}<h3>{s.title}</h3>{/if}
        {#if s.lines.length}<ul>{#each s.lines as l}<li>{l}</li>{/each}</ul>{/if}
        {#each s.images as src}<img {src} alt="Slide {s.n} picture" loading="lazy" />{/each}
        {#if !s.title && !s.lines.length && !s.images.length}<span class="faint">No text on this slide.</span>{/if}
      </div>
    </section>
  {:else}
    <p class="empty">This presentation has no slides.</p>
  {/each}
{:else if rich.kind === "archive"}
  <div class="table">
    <table class="grid">
      <thead><tr><th>{rich.entries.length} files</th><th class="r">Size</th></tr></thead>
      <tbody>
        {#each rich.entries as e (e.name)}<tr><td style="overflow-wrap:anywhere">{e.name}</td><td class="r">{bytes(e.size)}</td></tr>{/each}
      </tbody>
    </table>
  </div>
  <p class="small faint" style="margin-top:8px">Use Open in app to unpack it.</p>
{:else if rich.kind === "notebook"}
  {#each rich.cells as c, i (i)}
    {#if c.type === "markdown"}
      <div class="doc nb-md"><Html html={c.html} /></div>
    {:else}
      <div class="nb-cell">
        {#if c.source}<pre class="text">{c.source}</pre>{/if}
        {#each c.outputs as o}
          {#if o.image}<img class="nb-out" src={o.image} alt="Cell output" />
          {:else if o.html}<div class="nb-out doc"><Html html={o.html} /></div>
          {:else if o.text}<pre class="nb-out">{o.text}</pre>{/if}
        {/each}
      </div>
    {/if}
  {:else}
    <p class="empty">This notebook is empty.</p>
  {/each}
{/if}
