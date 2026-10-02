<script lang="ts">
  import { query, prefetch } from "../lib/api.svelte";
  import * as P from "../lib/paths";
  import { isoDate, ago, plain, pct, day, today } from "../lib/format";
  import { plannerDone } from "../lib/status";
  import { prefs, HOME_DAYS } from "../lib/prefs.svelte";
  import Top from "../components/Top.svelte";
  import State from "../components/State.svelte";
  import DueItem from "../components/DueItem.svelte";
  import Mark from "../components/Mark.svelte";
  import ClassesToday from "../components/ClassesToday.svelte";
  import type { Course, PlannerItem, Topic } from "../lib/types";

  const courses = query<Course[]>(() => P.COURSES, 600);
  const upcoming = query<PlannerItem[]>(() => P.planner(isoDate(-1), isoDate(prefs.homeDays)), 120);

  const list = $derived(P.visible(courses.data));
  const byId = $derived(new Map((courses.data ?? []).map((c) => [c.id, c])));

  const news = query<Topic[]>(
    () =>
      list.length
        ? `/api/v1/announcements?${list.map((c) => `context_codes[]=course_${c.id}`).join("&")}&start_date=${isoDate(-14)}&end_date=${isoDate(1)}`
        : null,
    300,
  );

  const todo = $derived(
    (upcoming.data ?? []).filter(
      (i) =>
        i.plannable_type !== "announcement" &&
        !prefs.hiddenCourses.includes(i.course_id ?? -1) &&
        !plannerDone(i) &&
        new Date(i.plannable_date).getTime() > Date.now() - 86400000,
    ),
  );

  const byDay = $derived.by(() => {
    const out: { label: string; items: PlannerItem[] }[] = [];
    for (const i of todo) {
      const label = day(i.plannable_date);
      if (out.at(-1)?.label !== label) out.push({ label, items: [] });
      out.at(-1)!.items.push(i);
    }
    return out;
  });

  // Warm every course's main screens in the background so the first click is instant.
  $effect(() => {
    if (list.length) prefetch(list.flatMap((c) => [P.course(c.id), P.tabs(c.id), P.groups(c.id), P.announcements(c.id), P.modules(c.id)]), 600);
  });

  const score = (c: Course) => c.enrollments?.find((e) => e.type === "student")?.computed_current_score;
  const courseOf = (code?: string) => byId.get(Number((code ?? "").replace("course_", "")));
</script>

<Top crumbs={[{ icon: "home", label: "Home" }]} />

<div class="page wide">
  <h1 class="title">Today</h1>
  <p class="subtitle">{today()}</p>

  <div class="home-grid" class:one={!prefs.homeClasses && !prefs.homeCourses && !prefs.homeAnnouncements}>
    <section>
      <h2 class="section">Due in the next {HOME_DAYS.find(([d]) => d === prefs.homeDays)?.[1] ?? "2 weeks"} <span class="n">{todo.length}</span><a class="end small muted" href="#/due">All dates</a></h2>
      <State q={upcoming} rows={6}>
        <div class="list boxed">
          {#each byDay as g (g.label)}
            <div class="day-label">{g.label}</div>
            {#each g.items as item (item.plannable_type + item.plannable_id)}
              <DueItem {item} code={P.shortCode(byId.get(item.course_id ?? -1))} />
            {/each}
          {:else}
            <p class="empty">Nothing due. Enjoy it.</p>
          {/each}
        </div>
      </State>
    </section>

    <section>
      {#if prefs.homeClasses}<ClassesToday courses={courses.data ?? []} />{/if}

      {#if prefs.homeCourses}
      <h2 class="section">Courses <span class="n">{list.length}</span></h2>
      <State q={courses} rows={4}>
        <div class="list boxed">
          {#each list as c (c.id)}
            <a class="course-row" href="#/c/{c.id}">
              <Mark id={c.id} code={c.course_code} size={30} />
              <span class="main">
                <div class="code">{P.shortCode(c)}</div>
                <div class="name ellipsis">{c.name}</div>
              </span>
              {#if score(c) != null}<span class="score">{pct(score(c))}</span>{/if}
            </a>
          {:else}
            <p class="empty">No current courses.</p>
          {/each}
        </div>
      </State>
      {/if}

      {#if prefs.homeAnnouncements}
      <h2 class="section">Announcements</h2>
      <State q={news} rows={4}>
        <div class="list">
          {#each (news.data ?? []).filter((a) => !prefs.hiddenCourses.includes(courseOf(a.context_code)?.id ?? -1)).slice(0, 8) as a (a.id)}
            {@const c = courseOf(a.context_code)}
            <a class="item top" href="#/c/{c?.id}/d/{a.id}">
              <Mark id={c?.id} code={c?.course_code} size={22} />
              <span class="main">
                <span class="t clamp">{a.title}</span>
                <span class="meta clamp">{plain(a.message, 140)}</span>
              </span>
              <span class="end">{ago(a.posted_at)}</span>
            </a>
          {:else}
            <p class="empty">No announcements in the last two weeks.</p>
          {/each}
        </div>
      </State>
      {/if}
    </section>
  </div>
</div>
