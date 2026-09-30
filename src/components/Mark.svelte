<script lang="ts">
  import { subject } from "../lib/icons";
  import { courseColor } from "../lib/colors.svelte";

  /** A course's identity: its subject code on its Quercus color. */
  let { id, code, size = 20 }: { id: number | string | undefined; code: string | undefined; size?: number } = $props();
</script>

<span
  class="mark"
  style:background={courseColor(id)}
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{Math.max(8, Math.round(size * 0.34))}px"
  style:border-radius="{Math.round(size / 4.5)}px">{subject(code)}</span
>
