<script lang="ts">
  import type { Snippet } from "svelte";
  import { route } from "../../lib/router.svelte";
  import Icon from "../Icon.svelte";

  let {
    depth = 0,
    icon,
    lead,
    label,
    href,
    onclick,
    open,
    ontoggle,
    title,
    end,
  }: {
    depth?: number;
    icon?: string;
    lead?: Snippet;
    label: string;
    href?: string | null;
    onclick?: () => void;
    open?: boolean;
    ontoggle?: () => void;
    title?: string;
    end?: Snippet;
  } = $props();

  const active = $derived(!!href && route.path === href);
</script>

{#snippet inner()}
  {#if lead}{@render lead()}{:else if icon}<Icon name={icon} />{/if}
  <span class="ellipsis">{label}</span>
  {#if end}<span class="end">{@render end()}</span>{/if}
{/snippet}

<div class="row" class:active style:padding-left="{depth * 14}px" title={title ?? label}>
  {#if ontoggle}
    <button class="caret" class:open onclick={ontoggle} aria-label={open ? "Collapse" : "Expand"} aria-expanded={open}>
      <Icon name="chevron" size={13} />
    </button>
  {:else}
    <span class="pad"></span>
  {/if}
  {#if href}
    <a href="#{href}">{@render inner()}</a>
  {:else}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <span class="label" onclick={onclick ?? ontoggle}>{@render inner()}</span>
  {/if}
</div>
