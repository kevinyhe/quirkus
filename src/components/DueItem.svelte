<script lang="ts">
  import { openLink } from "../lib/links";
  import { time, urgency } from "../lib/format";
  import { plannerDone } from "../lib/status";
  import Mark from "./Mark.svelte";
  import type { PlannerItem } from "../lib/types";

  let { item, code, showDay = false }: { item: PlannerItem; code: string; showDay?: boolean } = $props();

  const KIND: Record<string, string> = {
    assignment: "Assignment",
    quiz: "Quiz",
    discussion_topic: "Discussion",
    wiki_page: "Page",
    announcement: "Announcement",
    calendar_event: "Event",
    planner_note: "To-do",
  };

  const s = $derived(item.submissions || undefined);
  const done = $derived(plannerDone(item));
</script>

<button class="item" class:done onclick={() => openLink(item.html_url)}>
  <Mark id={item.course_id} code={code || item.context_name} size={22} />
  <span class="main">
    <span class="t ellipsis">{item.plannable.title}</span>
    <span class="meta">{code || item.context_name} · {KIND[item.plannable_type] ?? item.plannable_type}{item.plannable.points_possible ? ` · ${item.plannable.points_possible} pts` : ""}</span>
  </span>
  {#if s?.graded}<span class="tag ok">Graded</span>
  {:else if s?.excused}<span class="tag ok">Excused</span>
  {:else if done}<span class="tag ok">Submitted</span>
  {:else if s?.missing}<span class="tag bad keep">Missing</span>{/if}
  {#if s?.late}<span class="tag warn">Late</span>{/if}
  <span class="end {urgency(item.plannable_date, done)}">{time(item.plannable_date, showDay)}</span>
</button>
