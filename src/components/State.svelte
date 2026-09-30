<script lang="ts">
  import type { Snippet } from "svelte";
  import { explain, type Query } from "../lib/api.svelte";
  import Icon from "./Icon.svelte";

  let { q, rows = 4, children }: { q: Query<any>; rows?: number; children: Snippet } = $props();
</script>

{#if q.data !== undefined}
  {#if q.error === "offline"}
    <div class="note"><Icon name="offline" /><span>You're offline. This is what was saved last time.</span></div>
  {/if}
  {@render children()}
{:else if q.error}
  <div class="note {q.error.startsWith('http-4') ? '' : 'bad'}"><Icon name={q.error.startsWith("http-4") ? "lock" : q.error === "offline" ? "offline" : "warn"} /><span>{explain(q.error)}</span></div>
{:else if q.loading}
  <!-- Only shows if loading takes more than 150ms, so fast loads never flash. -->
  <div class="loading" aria-busy="true">
    {#each { length: rows } as _}<div></div>{/each}
  </div>
{/if}
