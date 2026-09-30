<script lang="ts">
  import { acorn, blocks, courses, currentTerm, inTerm, clock, type ClassBlock } from "../../lib/acorn.svelte";
  import { courseColor } from "../../lib/colors.svelte";
  import { query } from "../../lib/api.svelte";
  import { COURSES, shortCode } from "../../lib/paths";
  import Top from "../../components/Top.svelte";
  import AcornSync from "../../components/AcornSync.svelte";
  import type { Course } from "../../lib/types";

  const quercus = query<Course[]>(() => COURSES, 600);

  let term = $state<"F" | "S">(currentTerm());
  const all = $derived(blocks(acorn.data));
  const shown = $derived(all.filter((b) => inTerm(b, term)));
  const hasTerm = (t: "F" | "S") => all.some((b) => inTerm(b, t) && b.term !== "Y");

  const days = $derived.by(() => {
    const last = Math.max(5, ...shown.map((b) => b.day));
    return Array.from({ length: last }, (_, i) => i + 1);
  });
  const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_LONG = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const today = ((new Date().getDay() + 6) % 7) + 1;

  // Hours shown: from the earliest class to the latest, rounded to the hour.
  const startH = $derived(Math.min(9, ...shown.map((b) => Math.floor(b.start / 60))));
  const endH = $derived(Math.max(17, ...shown.map((b) => Math.ceil(b.end / 60))));
  const HOUR_PX = 56;
  const top = (min: number) => ((min - startH * 60) / 60) * HOUR_PX;

  /** ACORN "CSC263H1" → the matching Quercus course, for its color and link. */
  const byCode = $derived(new Map((quercus.data ?? []).map((c) => [shortCode(c).toUpperCase(), c])));
  const colorOf = (b: ClassBlock) => courseColor(byCode.get(b.code.toUpperCase())?.id ?? b.code.length * 7 + b.code.charCodeAt(3));

  /** Overlapping classes on the same day share the column side by side. */
  function lanes(list: ClassBlock[]) {
    const placed: { b: ClassBlock; lane: number; of: number }[] = [];
    for (const b of list) {
      const busy = placed.filter((p) => p.b.day === b.day && p.b.start < b.end && b.start < p.b.end);
      let lane = 0;
      while (busy.some((p) => p.lane === lane)) lane++;
      placed.push({ b, lane, of: 1 });
    }
    for (const p of placed) {
      const group = placed.filter((q) => q.b.day === p.b.day && q.b.start < p.b.end && p.b.start < q.b.end);
      p.of = Math.max(...group.map((q) => q.lane)) + 1;
    }
    return placed;
  }
  const placed = $derived(lanes(shown));
  const list = $derived(courses(acorn.data).filter((c) => inTerm({ term: String(c.sectionCode ?? "").toUpperCase() }, term)));
</script>

<Top crumbs={[{ icon: "acorn", label: "ACORN", href: "/acorn" }, { label: "Timetable" }]} />

<div class="page wide">
  <div class="head-row">
    <div class="grow">
      <h1 class="title">Timetable</h1>
      <AcornSync />
    </div>
    <div class="seg" role="tablist">
      <button class:on={term === "F"} onclick={() => (term = "F")} disabled={!hasTerm("F") && term !== "F"}>Fall</button>
      <button class:on={term === "S"} onclick={() => (term = "S")} disabled={!hasTerm("S") && term !== "S"}>Winter</button>
    </div>
  </div>

  {#if !acorn.data}
    <div class="loading"><div></div><div></div><div></div></div>
  {:else if !shown.length}
    <p class="empty">{all.length ? "No classes this term." : "No classes yet. They appear here after ACORN syncs."}</p>
  {:else}
    <!-- Week grid for wide content, a list per day for narrow. -->
    <div class="tt wide-only" style:--days={days.length} style:--h="{(endH - startH) * HOUR_PX}px">
      <div class="tt-head"><span></span>{#each days as d}<span class:today={d === today}>{DAY[d]}</span>{/each}</div>
      <div class="tt-body">
        <div class="tt-hours">
          {#each { length: endH - startH } as _, i}<span style:top="{i * HOUR_PX}px">{clock((startH + i) * 60)}</span>{/each}
        </div>
        {#each days as d}
          <div class="tt-day" class:today={d === today}>
            {#each placed.filter((p) => p.b.day === d) as p (p.b.code + p.b.activity + p.b.start)}
              {@const q = byCode.get(p.b.code.toUpperCase())}
              <a
                class="tt-block"
                class:wait={p.b.waitlisted}
                href={q ? `#/c/${q.id}` : undefined}
                style:top="{top(p.b.start)}px"
                style:height="{top(p.b.end) - top(p.b.start) - 2}px"
                style:left="calc({(p.lane / p.of) * 100}% + 2px)"
                style:width="calc({100 / p.of}% - 4px)"
                style:--c={colorOf(p.b)}
                title="{p.b.code} {p.b.activity} · {clock(p.b.start)}–{clock(p.b.end)} · {p.b.where}{p.b.who ? ' · ' + p.b.who : ''}"
              >
                <strong>{p.b.code}</strong>
                <span>{p.b.activity}{p.b.waitlisted ? " · waitlist" : ""}</span>
                <span>{p.b.where}</span>
              </a>
            {/each}
          </div>
        {/each}
      </div>
    </div>

    <div class="narrow-only">
      {#each days.filter((d) => shown.some((b) => b.day === d)) as d}
        <h2 class="section">{DAY_LONG[d]}{#if d === today}<span class="n">today</span>{/if}</h2>
        <div class="list boxed">
          {#each shown.filter((b) => b.day === d) as b (b.code + b.activity + b.start)}
            <div class="item">
              <span class="dot" style:background={colorOf(b)}></span>
              <span class="main">
                <span class="t">{b.code} <span class="muted" style="font-weight:400">{b.activity}</span></span>
                <span class="meta">{b.where}{b.who ? ` · ${b.who}` : ""}</span>
              </span>
              {#if b.waitlisted}<span class="tag warn keep">Waitlist</span>{/if}
              <span class="end">{clock(b.start)}–{clock(b.end)}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if list.length}
    <h2 class="section">Courses <span class="n">{list.length}</span></h2>
    <div class="table">
      <table class="grid">
        <thead><tr><th>Course</th><th class="hide-sm">Sections</th><th class="hide-sm">Instructors</th><th>Status</th></tr></thead>
        <tbody>
          {#each list as c ((c.code ?? c.courseCode) + String(c.sectionCode) + c.waitlisted)}
            {@const q = byCode.get(String(c.code ?? c.courseCode).toUpperCase())}
            <tr>
              <td class="name">
                <span class="in">
                  <span class="dot" style:background={courseColor(q?.id ?? 0)}></span>
                  <span style="min-width:0">
                    {#if q}<a href="#/c/{q.id}">{c.code ?? c.courseCode} {c.sectionCode}</a>{:else}{c.code ?? c.courseCode} {c.sectionCode}{/if}
                    <span class="faint small" style="display:block;font-weight:400">{c.title ?? c.name ?? ""}</span>
                  </span>
                </span>
              </td>
              <td class="hide-sm muted">{(c.meetings ?? []).map((m) => m.displayName ?? `${m.teachMethod ?? ""}${m.sectionNo ?? ""}`).join(", ")}</td>
              <td class="hide-sm muted">{[...new Set((c.meetings ?? []).map((m) => m.commaSeparatedInstructorNames).filter(Boolean))].join("; ")}</td>
              <td>
                {#if c.waitlisted}
                  {@const rank = (c.meetings ?? []).find((m) => m.waitlistRank != null)?.waitlistRank}
                  <span class="tag warn">Waitlist{rank != null ? ` #${rank}` : ""}</span>
                {:else}<span class="tag ok">Enrolled</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
