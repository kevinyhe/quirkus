<script lang="ts">
  import { toasts } from "../lib/api.svelte";
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast">
      <span>{t.text}</span>
      {#if t.action}<button onclick={t.action.run}>{t.action.label}</button>{/if}
    </div>
  {/each}
</div>
