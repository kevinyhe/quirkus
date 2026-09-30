<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { tree, toggle } from "../../lib/tree.svelte";
  import { SECTION_ICON } from "../../lib/icons";
  import { openExternal } from "../../lib/links";
  import { NATIVE } from "../../lib/sections";
  import TreeRow from "./TreeRow.svelte";
  import TreeModules from "./TreeModules.svelte";
  import Mark from "../Mark.svelte";
  import Icon from "../Icon.svelte";
  import type { Course, Tab } from "../../lib/types";

  let { c }: { c: Course } = $props();

  const key = $derived(`c${c.id}`);
  const open = $derived(!!tree[key]);
  const tabs = query<Tab[]>(() => (open ? P.tabs(c.id) : null), 3600);
  const sections = $derived((tabs.data ?? []).filter((t) => !t.hidden && t.id !== "home").sort((a, b) => a.position - b.position));
</script>

<TreeRow label={P.shortCode(c)} title={c.name} href="/c/{c.id}" {open} ontoggle={() => toggle(key)}>
  {#snippet lead()}<Mark id={c.id} code={c.course_code} size={18} />{/snippet}
</TreeRow>

{#if open}
  {#each sections as t (t.id)}
    {#if t.id === "modules"}
      <TreeModules cid={c.id} />
    {:else if t.id in NATIVE}
      <TreeRow depth={1} icon={SECTION_ICON[t.id]} label={t.label} href="/c/{c.id}/{NATIVE[t.id]}" />
    {:else}
      <TreeRow depth={1} icon={SECTION_ICON[t.id] ?? "tool"} label={t.label} onclick={() => openExternal(t.full_url ?? t.html_url)}>
        {#snippet end()}<span class="faint"><Icon name="external" size={12} /></span>{/snippet}
      </TreeRow>
    {/if}
  {:else}
    {#if tabs.loading}<div class="tree-note" style:padding-left="44px">Loading…</div>{/if}
    {#if tabs.error}<div class="tree-note" style:padding-left="44px">Couldn't load</div>{/if}
  {/each}
{/if}
