<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { acorn, blocks, currentTerm, inTerm, history, clock } from "../../lib/acorn.svelte";
  import { toast } from "../../lib/api.svelte";
  import Top from "../../components/Top.svelte";
  import Icon from "../../components/Icon.svelte";
  import AcornSync from "../../components/AcornSync.svelte";

  const term = currentTerm();
  const classes = $derived(blocks(acorn.data).filter((b) => inTerm(b, term) && !b.waitlisted));
  const hours = $derived(classes.reduce((n, b) => n + (b.end - b.start) / 60, 0));
  const courseCount = $derived(new Set(classes.map((b) => b.code)).size);
  const sessions = $derived(history(acorn.data).length);

  const today = ((new Date().getDay() + 6) % 7) + 1;
  const todays = $derived(classes.filter((b) => b.day === today));

  /** ACORN notices have no published format; show whatever text fields they carry. */
  const notices = $derived(
    [...(acorn.data?.notifications?.actionNotices ?? []), ...(acorn.data?.notifications?.notifications ?? [])]
      .map((n) => ({
        title: String(n.title ?? n.subject ?? n.header ?? n.name ?? ""),
        body: String(n.message ?? n.body ?? n.description ?? n.text ?? ""),
      }))
      .filter((n) => n.title || n.body)
      .slice(0, 8),
  );

  function openAcorn() {
    invoke("acorn_open").catch((e) => toast(`Couldn't open ACORN: ${e}`));
  }
</script>

<Top crumbs={[{ icon: "acorn", label: "ACORN" }]}>
  <button onclick={openAcorn}>Open ACORN<Icon name="external" size={13} /></button>
</Top>

<div class="page">
  <h1 class="title">ACORN</h1>
  <AcornSync />

  <div class="facts">
    <a class="fact" href="#/acorn/timetable">
      <div class="k">This term</div>
      <div class="v">{courseCount} courses · {Math.round(hours)} h / week</div>
    </a>
    <a class="fact" href="#/acorn/timetable">
      <div class="k">Today</div>
      <div class="v">{todays.length ? `${todays.length} class${todays.length > 1 ? "es" : ""} · first at ${clock(todays[0].start)}` : "No classes"}</div>
    </a>
    <a class="fact" href="#/acorn/history">
      <div class="k">Academic history</div>
      <div class="v">{sessions ? `${sessions} sessions` : "—"}</div>
    </a>
  </div>

  <div class="list boxed" style="margin-top:16px">
    <a class="item" href="#/acorn/timetable"><Icon name="clock" /><span class="main"><span class="t">Timetable</span><span class="meta">Your week, with rooms and instructors</span></span><Icon name="chevron" size={14} /></a>
    <a class="item" href="#/acorn/history"><Icon name="history" /><span class="main"><span class="t">Academic history</span><span class="meta">Marks and grades by session</span></span><Icon name="chevron" size={14} /></a>
    <button class="item" onclick={openAcorn}><Icon name="acorn" /><span class="main"><span class="t">Enrol, drop, or pay fees</span><span class="meta">Opens ACORN itself. The app never changes anything in ACORN.</span></span><Icon name="external" size={14} /></button>
  </div>

  {#if notices.length}
    <h2 class="section">Notices from ACORN <span class="n">{notices.length}</span></h2>
    <div class="list boxed">
      {#each notices as n, i (i)}
        <div class="item top"><Icon name="bell" /><span class="main">{#if n.title}<span class="t">{n.title}</span>{/if}{#if n.body}<span class="meta clamp">{n.body.replace(/<[^>]+>/g, " ")}</span>{/if}</span></div>
      {/each}
    </div>
  {/if}
</div>
