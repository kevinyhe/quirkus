<script lang="ts">
  import { query } from "../lib/api.svelte";
  import { route } from "../lib/router.svelte";
  import { expand } from "../lib/tree.svelte";
  import { COURSES, SELF, UNREAD, visible } from "../lib/paths";
  import TreeRow from "./tree/TreeRow.svelte";
  import TreeCourse from "./tree/TreeCourse.svelte";
  import Icon from "./Icon.svelte";
  import type { Course, User } from "../lib/types";

  const courses = query<Course[]>(() => COURSES, 600);
  const unread = query<{ unread_count: string }>(() => UNREAD, 120);
  const me = query<User>(() => SELF, 3600);
  const list = $derived(visible(courses.data));
  const unreadCount = $derived(Number(unread.data?.unread_count ?? 0));

  // Reveal the current page in the tree.
  $effect(() => {
    const p = route.path.split("/").filter(Boolean);
    if (p[0] === "c" && p[1]) {
      expand(`c${p[1]}`);
      if (p[2] === "modules") expand(`m${p[1]}`);
    }
  });
</script>

<nav class="sidebar" aria-label="Navigation">
  <div class="brand">
    <span class="logo">Q</span>
    <span>Quirkus</span>
    {#if me.data}<span class="who ellipsis" title={me.data.name}>{me.data.short_name ?? me.data.name}</span>{/if}
  </div>
  <button class="find" onclick={() => dispatchEvent(new CustomEvent("palette"))}>
    <Icon name="search" size={15} /><span>Search</span><kbd>Ctrl K</kbd>
  </button>

  <div class="side-scroll">
    <TreeRow icon="home" label="Home" href="/" />
    <TreeRow icon="calendar" label="Due" href="/due" />
    <TreeRow icon="inbox" label="Inbox" href="/inbox">
      {#snippet end()}{#if unreadCount > 0}<span class="count-badge">{unreadCount}</span>{/if}{/snippet}
    </TreeRow>

    <div class="side-label">ACORN</div>
    <TreeRow icon="clock" label="Timetable" href="/acorn/timetable" />
    <TreeRow icon="history" label="Academic history" href="/acorn/history" />
    <TreeRow icon="acorn" label="Account & notices" href="/acorn" />

    <div class="side-label">Courses</div>
    {#each list as c (c.id)}
      <TreeCourse {c} />
    {:else}
      {#if courses.loading}<div class="tree-note" style:padding-left="30px">Loading…</div>{/if}
      {#if courses.error}<div class="tree-note" style:padding-left="30px">Couldn't load courses</div>{/if}
    {/each}
  </div>

  <div class="side-foot">
    <TreeRow icon="settings" label="Settings" href="/settings" />
  </div>
</nav>
