<script lang="ts">
  import { clean } from "../lib/html";
  import { openLink } from "../lib/links";

  let { html }: { html: string | null | undefined } = $props();
  const safe = $derived(clean(html));

  function onclick(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    const href = a?.getAttribute("href");
    if (!a || !href) return;
    e.preventDefault();
    if (href.startsWith("#")) {
      a.closest(".prose")?.querySelector(`[id="${CSS.escape(href.slice(1))}"], [name="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView();
      return;
    }
    openLink(href);
  }
</script>

{#if safe}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="prose" {onclick}>{@html safe}</div>
{/if}
