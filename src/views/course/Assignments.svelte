<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { when, urgency, num } from "../../lib/format";
  import { status, isDone } from "../../lib/status";
  import { go } from "../../lib/router.svelte";
  import State from "../../components/State.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { Assignment, AssignmentGroup } from "../../lib/types";

  let { cid }: { cid: string } = $props();
  const groups = query<AssignmentGroup[]>(() => P.groups(cid), 120);
  let filter = $state("");

  type Row = Assignment & { group: string };
  const sections = $derived.by(() => {
    const now = Date.now();
    const f = filter.toLowerCase();
    const all: Row[] = (groups.data ?? []).flatMap((g) => g.assignments.map((a) => ({ ...a, group: g.name })));
    const hit = all.filter((a) => a.name.toLowerCase().includes(f) || a.group.toLowerCase().includes(f));
    const t = (a: Assignment) => (a.due_at ? new Date(a.due_at).getTime() : 0);
    return [
      { name: "Upcoming", items: hit.filter((a) => a.due_at && t(a) >= now).sort((a, b) => t(a) - t(b)) },
      { name: "No due date", items: hit.filter((a) => !a.due_at) },
      { name: "Past", items: hit.filter((a) => a.due_at && t(a) < now).sort((a, b) => t(b) - t(a)) },
    ].filter((s) => s.items.length);
  });
</script>

<div class="toolbar"><span class="grow"></span><input bind:value={filter} placeholder="Filter assignments" /></div>
<State q={groups} rows={8}>
  {#each sections as s (s.name)}
    <h2 class="section">{s.name} <span class="n">{s.items.length}</span></h2>
    <div class="table">
      <table class="grid">
        <thead><tr><th>Name</th><th class="nowrap hide-sm">Due</th><th>Status</th><th class="r hide-sm">Points</th></tr></thead>
        <tbody>
          {#each s.items as a (a.id)}
            {@const st = status(a)}
            <tr class="click" onclick={() => go(`/c/${cid}/a/${a.id}`)}>
              <td class="name">
                <a href="#/c/{cid}/a/{a.id}" onclick={(e) => e.stopPropagation()}>
                  <Icon name="assignment" />
                  <span style="min-width:0"><span class="ellipsis" style="display:block">{a.name}</span><span class="faint small" style="font-weight:400">{a.group}</span>{#if a.due_at}<span class="show-sm small {urgency(a.due_at, isDone(a))}" style="font-weight:400">Due {when(a.due_at)}</span>{/if}</span>
                </a>
              </td>
              <td class="nowrap hide-sm {urgency(a.due_at, isDone(a))}">{a.due_at ? when(a.due_at) : "—"}</td>
              <td>{#if st}<span class="tag {st.cls}">{st.label}</span>{/if}</td>
              <td class="r muted hide-sm">{num(a.points_possible)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="empty">No assignments.</p>
  {/each}
</State>
