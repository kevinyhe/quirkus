<script lang="ts">
  import type { Course } from "../../lib/types";
  import Page from "./Page.svelte";
  import Modules from "./Modules.svelte";
  import Syllabus from "./Syllabus.svelte";
  import Assignments from "./Assignments.svelte";
  import Topics from "./Topics.svelte";

  let { cid, view }: { cid: string; view: Course["default_view"] } = $props();
</script>

<!-- Mirror what the instructor picked as the course home in Quercus. -->
{#if view === "wiki"}
  <Page {cid} front />
{:else if view === "syllabus"}
  <Syllabus {cid} />
{:else if view === "assignments"}
  <Assignments {cid} />
{:else if view === "feed"}
  <Topics {cid} announcements />
{:else if view}
  <Modules {cid} />
{:else}
  <div class="loading"><div></div><div></div><div></div></div>
{/if}
