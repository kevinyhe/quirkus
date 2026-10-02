<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import { COURSES, current, shortCode } from "../../lib/paths";
  import { prefs, toggleCourse } from "../../lib/prefs.svelte";
  import Mark from "../Mark.svelte";
  import type { Course } from "../../lib/types";

  const courses = query<Course[]>(() => COURSES, 600);
  const list = $derived(current(courses.data));
</script>

{#if list.length}
  <div class="list boxed">
    {#each list as c (c.id)}
      <label class="item pick">
        <Mark id={c.id} code={c.course_code} size={22} />
        <span class="main"><span class="t">{shortCode(c)}</span><span class="meta ellipsis">{c.name}</span></span>
        <input type="checkbox" class="switch" checked={!prefs.hiddenCourses.includes(c.id)} onchange={(e) => toggleCourse(c.id, e.currentTarget.checked)} aria-label="Show {shortCode(c)}" />
      </label>
    {/each}
  </div>
{:else if courses.loading}
  <div class="loading"><div></div><div></div><div></div></div>
{:else}
  <p class="empty">{courses.error ? "Couldn't load your courses. You can pick them later in Settings." : "Quercus lists no current courses for you yet."}</p>
{/if}
