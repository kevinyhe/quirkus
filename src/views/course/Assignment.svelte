<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { when, urgency, num } from "../../lib/format";
  import { status, isDone, submissionTypes, canSubmitOnline } from "../../lib/status";
  import { initials } from "../../lib/icons";
  import { openExternal } from "../../lib/links";
  import Top from "../../components/Top.svelte";
  import Eyebrow from "../../components/Eyebrow.svelte";
  import State from "../../components/State.svelte";
  import Html from "../../components/Html.svelte";
  import Icon from "../../components/Icon.svelte";
  import type { Assignment, Crumb, Submission } from "../../lib/types";

  let { cid, id, base }: { cid: string; id: string; base: Crumb[] } = $props();
  const a = query<Assignment>(() => P.assignment(cid, id), 120);
  const sub = query<Submission & { rubric_assessment?: Record<string, { points?: number; comments?: string }> }>(
    () => P.mySubmission(cid, id),
    120,
  );
  const submittable = $derived(!!a.data && canSubmitOnline(a.data) && !a.data.locked_for_user);
  const section = $derived<Crumb>({ icon: "assignment", label: "Assignments", href: `/c/${cid}/assignments` });
</script>

<Top crumbs={[...base, section, { label: a.data?.name ?? "…" }]}>
  {#if a.data}
    {#if submittable}
      <button class="solid" onclick={() => openExternal(a.data!.html_url)}>{isDone(a.data) ? "Resubmit" : "Submit"} in Quercus<Icon name="external" size={13} /></button>
    {:else}
      <button onclick={() => openExternal(a.data!.html_url)}>Open in Quercus<Icon name="external" size={13} /></button>
    {/if}
  {/if}
</Top>

<div class="page">
  <State q={a} rows={10}>
    {@const x = a.data!}
    {@const st = status(x)}
    <Eyebrow {base} {section} />
    <h1 class="title">{x.name}</h1>

    <div class="facts">
      <div class="fact"><div class="k">Due</div><div class="v {urgency(x.due_at, isDone(x))}">{x.due_at ? when(x.due_at) : "No due date"}</div></div>
      <div class="fact"><div class="k">Status</div><div class="v">{#if st}<span class="tag {st.cls}">{st.label}</span>{:else}<span class="tag">Not submitted</span>{/if}</div></div>
      {#if x.points_possible != null}<div class="fact"><div class="k">Points</div><div class="v num">{num(x.points_possible)}</div></div>{/if}
      {#if x.submission_types?.length}<div class="fact"><div class="k">Submit as</div><div class="v">{submissionTypes(x)}</div></div>{/if}
      {#if x.allowed_attempts && x.allowed_attempts > 0}<div class="fact"><div class="k">Attempts</div><div class="v num">{x.submission?.attempt ?? 0} of {x.allowed_attempts}</div></div>{/if}
      {#if x.unlock_at && new Date(x.unlock_at).getTime() > Date.now()}<div class="fact"><div class="k">Opens</div><div class="v">{when(x.unlock_at)}</div></div>{/if}
      {#if x.lock_at}<div class="fact"><div class="k">Closes</div><div class="v">{when(x.lock_at)}</div></div>{/if}
    </div>

    {#if x.locked_for_user && x.lock_explanation}<div class="note"><Icon name="lock" /><Html html={x.lock_explanation} /></div>{/if}

    <h2 class="big">Instructions</h2>
    {#if x.description}<Html html={x.description} />{:else}<p class="faint">No instructions were posted.</p>{/if}

    {#if x.rubric?.length}
      <h2 class="big">Rubric</h2>
      <div class="table">
        <table class="grid">
          <thead><tr><th>Criterion</th><th>Ratings</th><th class="r">Points</th></tr></thead>
          <tbody>
            {#each x.rubric as r (r.id)}
              {@const got = sub.data?.rubric_assessment?.[r.id]}
              <tr>
                <td style="min-width:200px;vertical-align:top">
                  <div style="font-weight:550">{r.description}</div>
                  {#if r.long_description}<div class="small muted pre">{r.long_description}</div>{/if}
                  {#if got?.comments}<div class="small pre" style="margin-top:6px">“{got.comments}”</div>{/if}
                </td>
                <td style="vertical-align:top">
                  <div style="display:flex;flex-wrap:wrap;gap:4px">
                    {#each r.ratings as rt (rt.id)}
                      <span class="tag" class:ok={got?.points === rt.points}>{rt.description} · {num(rt.points)}</span>
                    {/each}
                  </div>
                </td>
                <td class="r" style="vertical-align:top">{got?.points != null ? `${num(got.points)} / ` : ""}{num(r.points)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if sub.data?.submission_comments?.length}
      <h2 class="big">Feedback</h2>
      {#each sub.data.submission_comments as c (c.id)}
        <div class="post">
          <span class="avatar">{initials(c.author_name)}</span>
          <div class="body">
            <div><span class="who">{c.author_name}</span><time>{when(c.created_at)}</time></div>
            <p class="pre" style="margin:6px 0 0">{c.comment}</p>
          </div>
        </div>
      {/each}
    {/if}
  </State>
</div>
