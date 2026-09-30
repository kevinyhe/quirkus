<script lang="ts">
  import { query, prefetch } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { openExternal } from "../../lib/links";
  import { pct } from "../../lib/format";
  import { SECTION_ICON } from "../../lib/icons";
  import { NATIVE, LABEL } from "../../lib/sections";
  import type { Course, Crumb, Tab } from "../../lib/types";
  import Top from "../../components/Top.svelte";
  import Icon from "../../components/Icon.svelte";
  import Mark from "../../components/Mark.svelte";
  import Home from "./Home.svelte";
  import Topics from "./Topics.svelte";
  import Topic from "./Topic.svelte";
  import Assignments from "./Assignments.svelte";
  import Assignment from "./Assignment.svelte";
  import Modules from "./Modules.svelte";
  import Files from "./Files.svelte";
  import Pages from "./Pages.svelte";
  import Page from "./Page.svelte";
  import Grades from "./Grades.svelte";
  import Syllabus from "./Syllabus.svelte";
  import Doc from "./Doc.svelte";

  let { cid, rest }: { cid: string; rest: string[] } = $props();

  const course = query<Course>(() => P.course(cid), 600);
  const tabs = query<Tab[]>(() => P.tabs(cid), 3600);

  const visibleTabs = $derived((tabs.data ?? []).filter((t) => !t.hidden).sort((a, b) => a.position - b.position));
  const section = $derived(rest[0] ?? "");
  const leaf = $derived(["a", "d", "p", "f"].includes(section) && !!rest[1]);
  const code = $derived(P.shortCode(course.data));
  const score = $derived(course.data?.enrollments?.find((e) => e.type === "student")?.computed_current_score);
  const base = $derived<Crumb[]>([{ course: { id: cid, code: course.data?.course_code }, label: code || "Course", href: `/c/${cid}` }]);

  $effect(() => {
    prefetch([P.pages(cid), P.discussions(cid), P.syllabus(cid), P.frontPage(cid)], 900);
  });
</script>

{#if leaf}
  {#key rest.join("/")}
    {#if section === "a"}
      <Assignment {cid} id={rest[1]} {base} />
    {:else if section === "d"}
      <Topic {cid} id={rest[1]} {base} />
    {:else if section === "p"}
      <Page {cid} slug={rest.slice(1).join("/")} {base} />
    {:else if section === "f"}
      <Doc {cid} id={rest[1]} {base} {code} />
    {/if}
  {/key}
{:else}
  <Top crumbs={section ? [...base, { icon: SECTION_ICON[section], label: LABEL[section] ?? section }] : base} />

  <div class="page wide">
    <div class="head-row">
      <Mark id={cid} code={course.data?.course_code} size={46} />
      <div class="grow">
        <h1 class="title">{course.data?.name ?? " "}</h1>
        <p class="subtitle">
          <span>{code}</span>{#if course.data?.term?.name}<span class="dot-sep">{course.data.term.name}</span>{/if}{#if score != null}<span class="dot-sep"><a href="#/c/{cid}/grades"><span class="tag info">{pct(score)}</span></a></span>{/if}
        </p>
      </div>
    </div>

    <nav class="tabs" aria-label="Course sections">
      {#each visibleTabs as t (t.id)}
        {#if t.id in NATIVE}
          <a href="#/c/{cid}{NATIVE[t.id] ? '/' + NATIVE[t.id] : ''}" class:on={NATIVE[t.id] === section}>
            {t.label}
          </a>
        {:else}
          <button class="ext" onclick={() => openExternal(t.full_url ?? t.html_url)} title="Opens in Quercus">
            {t.label}<Icon name="external" size={12} />
          </button>
        {/if}
      {:else}
        {#if tabs.loading}<span class="faint small" style="padding:9px 10px">Loading…</span>{/if}
      {/each}
    </nav>

    {#if section === ""}
      <Home {cid} view={course.data?.default_view} />
    {:else if section === "announcements"}
      <Topics {cid} announcements />
    {:else if section === "discussions"}
      <Topics {cid} />
    {:else if section === "assignments"}
      <Assignments {cid} />
    {:else if section === "modules"}
      <Modules {cid} />
    {:else if section === "files"}
      <Files {cid} {code} folder={rest[1]} />
    {:else if section === "pages"}
      <Pages {cid} />
    {:else if section === "grades"}
      <Grades {cid} />
    {:else if section === "syllabus"}
      <Syllabus {cid} />
    {/if}
  </div>
{/if}
