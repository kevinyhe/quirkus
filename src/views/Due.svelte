<script lang="ts">
  import { query } from "../lib/api.svelte";
  import * as P from "../lib/paths";
  import { day, isoDate } from "../lib/format";
  import Top from "../components/Top.svelte";
  import State from "../components/State.svelte";
  import DueItem from "../components/DueItem.svelte";
  import type { Course, PlannerItem } from "../lib/types";

  let showDone = $state(false);
  const items = query<PlannerItem[]>(() => P.planner(isoDate(-21), isoDate(70)), 120);
  const courses = query<Course[]>(() => P.COURSES, 600);
  const byId = $derived(new Map((courses.data ?? []).map((c) => [c.id, c])));

  const isDone = (i: PlannerItem) => !!((i.submissions && i.submissions.submitted) || i.planner_override?.marked_complete);

  const sections = $derived.by(() => {
    const now = Date.now();
    const all = (items.data ?? []).filter((i) => i.plannable_type !== "announcement");
    const t = (i: PlannerItem) => new Date(i.plannable_date).getTime();
    const overdue = all.filter((i) => !isDone(i) && t(i) < now && i.submissions && i.submissions.missing);
    const rest = all.filter((i) => (showDone ? true : t(i) >= now - 86400000 && !isDone(i)));
    const days: { label: string; items: PlannerItem[] }[] = [];
    for (const i of rest) {
      const label = day(i.plannable_date);
      if (days.at(-1)?.label !== label) days.push({ label, items: [] });
      days.at(-1)!.items.push(i);
    }
    return { overdue, days };
  });

  const code = (i: PlannerItem) => P.shortCode(byId.get(i.course_id ?? -1));
</script>

<Top crumbs={[{ icon: "calendar", label: "Due" }]}>
  <button onclick={() => (showDone = !showDone)}>{showDone ? "Hide finished" : "Show finished"}</button>
</Top>

<div class="page">
  <h1 class="title">Due</h1>
  <p class="subtitle">Every dated item in your courses, three weeks back to ten weeks ahead.</p>

  <State q={items} rows={10}>
    {#if !showDone && sections.overdue.length}
      <h2 class="section overdue">Missing <span class="n">{sections.overdue.length}</span></h2>
      <div class="list boxed">
        {#each sections.overdue as item (item.plannable_type + item.plannable_id)}<DueItem {item} code={code(item)} showDay />{/each}
      </div>
    {/if}
    {#each sections.days as g (g.label)}
      <h2 class="section">{g.label} <span class="n">{g.items.length}</span></h2>
      <div class="list boxed">
        {#each g.items as item (item.plannable_type + item.plannable_id)}<DueItem {item} code={code(item)} />{/each}
      </div>
    {:else}
      <p class="empty">Nothing due in the next ten weeks.</p>
    {/each}
  </State>
</div>
