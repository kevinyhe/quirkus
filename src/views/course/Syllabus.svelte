<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import State from "../../components/State.svelte";
  import Html from "../../components/Html.svelte";
  import type { Course } from "../../lib/types";

  let { cid }: { cid: string } = $props();
  const c = query<Course>(() => P.syllabus(cid), 900);
</script>

<State q={c} rows={8}>
  {#if c.data?.syllabus_body}
    <Html html={c.data.syllabus_body} />
  {:else}
    <div class="note">The syllabus page is empty. Look in Modules or Files for a syllabus PDF.</div>
  {/if}
</State>
