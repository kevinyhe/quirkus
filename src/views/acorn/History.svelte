<script lang="ts">
  import { acorn, history, markNumber } from "../../lib/acorn.svelte";
  import { query } from "../../lib/api.svelte";
  import { COURSES, shortCode } from "../../lib/paths";
  import { num } from "../../lib/format";
  import Top from "../../components/Top.svelte";
  import AcornSync from "../../components/AcornSync.svelte";
  import type { Course } from "../../lib/types";

  const rows = $derived(history(acorn.data));
  const quercus = query<Course[]>(() => COURSES, 600);
  const byCode = $derived(new Map((quercus.data ?? []).map((c) => [shortCode(c).toUpperCase(), c])));

  const marks = $derived(rows.flatMap((r) => r.courses).map(markNumber).filter((n): n is number => n != null));
  const avg = $derived(marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null);
  const total = $derived(rows.reduce((n, r) => n + r.courses.length, 0));
  const hasCredits = $derived(rows.some((r) => r.courses.some((c) => credit(c))));

  const title = (c: Record<string, unknown>) => String(c.courseTitle ?? c.title ?? c.courseName ?? "");
  const credit = (c: Record<string, unknown>) => {
    const v = c.creditValue ?? c.credits ?? c.weight;
    return v == null || v === "" ? "" : String(v);
  };
</script>

<Top crumbs={[{ icon: "acorn", label: "ACORN", href: "/acorn" }, { label: "Academic history" }]} />

<div class="page">
  <h1 class="title">Academic history</h1>
  <AcornSync />

  {#if !acorn.data}
    <div class="loading"><div></div><div></div><div></div></div>
  {:else if !rows.length}
    <p class="empty">{acorn.data.syncedAt ? "Degree Explorer returned no courses." : "Your marks appear here after ACORN syncs."}</p>
  {:else}
    <div class="facts">
      <div class="fact"><div class="k">Courses</div><div class="v num">{total}</div></div>
      <div class="fact"><div class="k">Sessions</div><div class="v num">{rows.length}</div></div>
      {#if avg != null}<div class="fact"><div class="k">Average mark (unweighted)</div><div class="v num">{num(avg)}%</div></div>{/if}
    </div>
    <p class="faint small" style="margin-top:6px">From Degree Explorer. The average here counts every course equally; it isn't your GPA.</p>

    {#each rows as r (r.session)}
      <h2 class="section">{r.session} <span class="n">{r.courses.length}</span></h2>
      <div class="table">
        <table class="grid">
          <thead><tr><th>Course</th>{#if hasCredits}<th class="r hide-sm">Credit</th>{/if}<th class="r">Mark</th><th class="r">Grade</th></tr></thead>
          <tbody>
            {#each r.courses as c, i (String(c.courseCode) + i)}
              {@const q = byCode.get(String(c.courseCode).toUpperCase())}
              {@const m = markNumber(c)}
              <tr>
                <td class="name">
                  <span style="min-width:0;display:block">
                    {#if q}<a href="#/c/{q.id}">{c.courseCode}</a>{:else}{c.courseCode}{/if}
                    {#if title(c)}<span class="faint small" style="display:block;font-weight:400">{title(c)}</span>{/if}
                  </span>
                </td>
                {#if hasCredits}<td class="r muted hide-sm">{credit(c)}</td>{/if}
                <td class="r">{m != null ? num(m) : "–"}</td>
                <td class="r">{#if c.enteredMark}<span class="tag {c.enteredMark === 'NCR' || c.enteredMark === 'F' ? 'bad' : ''}">{c.enteredMark}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/each}
  {/if}
</div>
