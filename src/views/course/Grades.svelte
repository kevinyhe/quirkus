<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { day, num, pct } from "../../lib/format";
  import { go } from "../../lib/router.svelte";
  import State from "../../components/State.svelte";
  import type { AssignmentGroup, Course, Assignment } from "../../lib/types";

  let { cid }: { cid: string } = $props();
  const groups = query<AssignmentGroup[]>(() => P.groups(cid), 120);
  const course = query<Course>(() => P.course(cid), 600);

  const counts = (a: Assignment) =>
    a.submission?.score != null && a.submission.workflow_state === "graded" && !a.submission.excused && !a.omit_from_final_grade && (a.points_possible ?? 0) > 0;

  const rows = $derived(
    (groups.data ?? []).map((g) => {
      const graded = g.assignments.filter(counts);
      const earned = graded.reduce((s, a) => s + (a.submission!.score ?? 0), 0);
      const possible = graded.reduce((s, a) => s + (a.points_possible ?? 0), 0);
      return { g, earned, possible, graded: graded.length, pct: possible ? (earned / possible) * 100 : null };
    }),
  );

  const weighted = $derived(!!course.data?.apply_assignment_group_weights);
  const official = $derived(course.data?.enrollments?.find((e) => e.type === "student"));

  /** Weighted average of graded groups. Ignores drop-lowest rules, so it can differ from Quercus. */
  const estimate = $derived.by(() => {
    if (weighted) {
      const used = rows.filter((r) => r.pct != null && (r.g.group_weight ?? 0) > 0);
      const w = used.reduce((s, r) => s + (r.g.group_weight ?? 0), 0);
      return w ? used.reduce((s, r) => s + r.pct! * (r.g.group_weight ?? 0), 0) / w : null;
    }
    const e = rows.reduce((s, r) => s + r.earned, 0);
    const p = rows.reduce((s, r) => s + r.possible, 0);
    return p ? (e / p) * 100 : null;
  });
</script>

<State q={groups} rows={8}>
  <div class="facts" style="margin-top:0">
    <div class="fact">
      <div class="k">Quercus current score</div>
      <div class="v num" style="font-size:20px">
        {#if official?.computed_current_score != null}{pct(official.computed_current_score)}{#if official.computed_current_grade}<span class="muted" style="font-size:14px;margin-left:8px">{official.computed_current_grade}</span>{/if}
        {:else if course.data?.hide_final_grades}<span class="muted" style="font-size:14px">Hidden by instructor</span>
        {:else}–{/if}
      </div>
    </div>
    {#if estimate != null}
      <div class="fact">
        <div class="k">Graded work only</div>
        <div class="v num" style="font-size:20px">{pct(estimate)}</div>
      </div>
    {/if}
    {#if weighted}
      <div class="fact"><div class="k">Weighting</div><div class="v">By assignment group</div></div>
    {/if}
  </div>
  <p class="faint small" style="margin-top:6px">"Graded work only" is calculated here and ignores drop-lowest rules, so it can differ from Quercus.</p>

  {#each rows as r (r.g.id)}
    <h2 class="section">
      {r.g.name}
      {#if weighted && r.g.group_weight}<span class="n">{num(r.g.group_weight)}% of grade</span>{/if}
      <span class="end num">{r.pct != null ? pct(r.pct) : "–"}</span>
    </h2>
    <div class="table">
      <table class="grid">
        <thead><tr><th>Name</th><th class="nowrap hide-sm">Due</th><th class="r">Score</th></tr></thead>
        <tbody>
          {#each r.g.assignments as a (a.id)}
            {@const s = a.submission}
            <tr class="click" class:dim={!counts(a)} onclick={() => go(`/c/${cid}/a/${a.id}`)}>
              <td class="name"><span class="in"><span class="ellipsis">{a.name}</span></span></td>
              <td class="nowrap muted hide-sm">{a.due_at ? day(a.due_at) : "—"}</td>
              <td class="r">
                {#if s?.excused}<span class="tag">Excused</span>
                {:else if s?.score != null && s.workflow_state === "graded"}{num(s.score)} <span class="faint">/ {num(a.points_possible)}</span>
                {:else if s?.missing}<span class="tag bad">Missing</span>
                {:else if s?.submitted_at}<span class="tag">Submitted</span>
                {:else}<span class="faint">– / {num(a.points_possible)}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/each}
</State>
