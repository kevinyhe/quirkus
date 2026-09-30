<script lang="ts">
  import type { Crumb } from "../lib/types";
  import Icon from "./Icon.svelte";

  /** The small "where is this" line above a page title: course, then section. */
  let { base, section }: { base: Crumb[]; section: Crumb } = $props();
</script>

<div class="eyebrow">
  {#if base[0]}<a href="#{base[0].href}">{base[0].label}</a><span class="faint">/</span>{/if}
  <a href="#{section.href}" style="display:inline-flex;align-items:center;gap:6px">{#if section.icon}<Icon name={section.icon} size={14} />{/if}{section.label}</a>
</div>
