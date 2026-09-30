<script lang="ts">
  import { acorn, syncAcorn } from "../lib/acorn.svelte";
  import { ago } from "../lib/format";
  import Icon from "./Icon.svelte";

  const d = $derived(acorn.data);
  const when = $derived(d?.syncedAt ? ago(new Date(d.syncedAt * 1000).toISOString()) : null);
</script>

{#if d?.state === "needs-signin"}
  <div class="note warn">
    <Icon name="lock" />
    <span style="flex:1">UofT needs you to sign in again (password or Duo) before ACORN can update.</span>
    <button class="solid" onclick={() => syncAcorn(true)}>Sign in</button>
  </div>
{:else if d?.state === "error"}
  <div class="note bad">
    <Icon name="warn" />
    <span style="flex:1">Couldn't update from ACORN{d.note ? ` (${d.note})` : ""}.</span>
    <button class="ghost" onclick={() => syncAcorn(true)}>Try again</button>
  </div>
{/if}

<div class="sync-line">
  {#if d?.state === "syncing"}
    <span class="spin"><Icon name="refresh" size={14} /></span><span>Updating from ACORN…</span>
  {:else if when}
    <span>Updated from ACORN {when}</span>
    {#if d?.note === "history-failed"}<span class="faint">· academic history didn't load</span>{/if}
    <button class="text small" onclick={() => syncAcorn(true)}>Update now</button>
  {:else}
    <span>Not synced yet.</span>
    <button class="text small" onclick={() => syncAcorn(true)}>Connect ACORN</button>
  {/if}
</div>
