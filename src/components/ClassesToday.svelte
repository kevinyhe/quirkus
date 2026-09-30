<script lang="ts">
  import { acorn, blocks, currentTerm, inTerm, clock } from "../lib/acorn.svelte";
  import { courseColor } from "../lib/colors.svelte";
  import { shortCode } from "../lib/paths";
  import type { Course } from "../lib/types";

  let { courses }: { courses: Course[] } = $props();

  const today = ((new Date().getDay() + 6) % 7) + 1;
  const term = currentTerm();
  const byCode = $derived(new Map(courses.map((c) => [shortCode(c).toUpperCase(), c])));
  const list = $derived(blocks(acorn.data).filter((b) => b.day === today && inTerm(b, term) && !b.waitlisted));
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
</script>

{#if acorn.data?.syncedAt}
  <h2 class="section">Classes today <span class="n">{list.length}</span><a class="end small muted" href="#/acorn/timetable">Timetable</a></h2>
  <div class="list boxed">
    {#each list as b (b.code + b.activity + b.start)}
      {@const q = byCode.get(b.code.toUpperCase())}
      <a class="item" class:done={b.end < nowMin} href={q ? `#/c/${q.id}` : "#/acorn/timetable"}>
        <span class="dot" style:background={courseColor(q?.id ?? 0)}></span>
        <span class="main">
          <span class="t">{b.code} <span class="muted" style="font-weight:400">{b.activity}</span></span>
          <span class="meta">{b.where}</span>
        </span>
        <span class="end">{clock(b.start)}–{clock(b.end)}</span>
      </a>
    {:else}
      <p class="empty">No classes today.</p>
    {/each}
  </div>
{/if}
