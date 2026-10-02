<script lang="ts">
  import { query, BASE } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { day, urgency } from "../../lib/format";
  import { isDone } from "../../lib/status";
  import { ITEM_ICON } from "../../lib/icons";
  import { itemRoute, openItem } from "../../lib/links";
  import { prefetchModuleFiles } from "../../lib/prefetchFiles";
  import Icon from "../../components/Icon.svelte";
  import type { AssignmentGroup, Module, ModuleItem } from "../../lib/types";

  let { cid, module }: { cid: string; module: Module } = $props();

  // Canvas leaves out `items` for large modules; fetch those separately.
  const extra = query<ModuleItem[]>(() => (module.items ? null : module.items_url.replace(BASE, "") + "?include[]=content_details"), 300);
  const items = $derived(module.items ?? extra.data ?? []);

  // Module items don't say whether the work was handed in. The assignments list does (same request as the
  // Assignments tab, so it's usually cached). Quizzes and discussions are matched through their assignment.
  const groups = query<AssignmentGroup[]>(() => P.groups(cid), 120);
  const finished = $derived.by(() => {
    const ids = new Set<string>();
    for (const a of (groups.data ?? []).flatMap((g) => g.assignments)) {
      if (!isDone(a)) continue;
      ids.add(`Assignment:${a.id}`);
      if (a.quiz_id) ids.add(`Quiz:${a.quiz_id}`);
      if (a.discussion_topic) ids.add(`Discussion:${a.discussion_topic.id}`);
    }
    return ids;
  });
  const done = (it: ModuleItem) => !!it.completion_requirement?.completed || finished.has(`${it.type}:${it.content_id}`);

  // An open module's files start downloading now, so clicking one shows it immediately.
  $effect(() => {
    if (items.length) prefetchModuleFiles(cid, items);
  });
</script>

{#snippet body(it: ModuleItem, route: string | null)}
  {@const due = it.content_details?.due_at}
  <Icon name={ITEM_ICON[it.type] ?? "file"} />
  <span class="main"><span class="t" style="font-weight:500">{it.title}</span></span>
  {#if it.completion_requirement?.completed}<span class="tag ok"><Icon name="check" size={12} />Done</span>{/if}
  {#if it.content_details?.locked_for_user}<Icon name="lock" size={14} class="faint" />{/if}
  {#if due}<span class="end {urgency(due, done(it))}">Due {day(due)}</span>{/if}
  {#if !route}<Icon name="external" size={13} class="faint" />{/if}
{/snippet}

<div class="list">
  {#each items as it (it.id)}
    {#if it.type === "SubHeader"}
      <div class="subhead" style:padding-left="{10 + it.indent * 24}px">{it.title}</div>
    {:else}
      {@const route = itemRoute(cid, it)}
      {#if route}
        <a class="item" href="#{route}" style:padding-left="{10 + it.indent * 24}px">{@render body(it, route)}</a>
      {:else}
        <button class="item" onclick={() => openItem(cid, it)} style:padding-left="{10 + it.indent * 24}px">{@render body(it, route)}</button>
      {/if}
    {/if}
  {:else}
    <p class="empty">{extra.loading && !module.items ? "Loading…" : extra.error ? "Couldn't load this module's items." : "This module is empty."}</p>
  {/each}
</div>
