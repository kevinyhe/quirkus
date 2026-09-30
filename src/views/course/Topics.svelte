<script lang="ts">
  import { query } from "../../lib/api.svelte";
  import * as P from "../../lib/paths";
  import { ago, plain } from "../../lib/format";
  import { initials } from "../../lib/icons";
  import State from "../../components/State.svelte";
  import type { Topic } from "../../lib/types";

  let { cid, announcements = false }: { cid: string; announcements?: boolean } = $props();
  const topics = query<Topic[]>(() => (announcements ? P.announcements(cid) : P.discussions(cid)), 300);
  let filter = $state("");
  const shown = $derived(
    (topics.data ?? []).filter((t) => (t.title + " " + plain(t.message, 400)).toLowerCase().includes(filter.toLowerCase())),
  );
</script>

<div class="toolbar"><span class="grow"></span><input bind:value={filter} placeholder="Filter" /></div>
<State q={topics} rows={8}>
  <div class="list boxed">
    {#each shown as t (t.id)}
      {@const who = t.author?.display_name ?? t.user_name ?? ""}
      <a class="item top" class:unread={t.read_state === "unread"} href="#/c/{cid}/d/{t.id}">
        <span class="avatar">{initials(who || "?")}</span>
        <span class="main">
          <span class="t">{t.title}</span>
          <span class="meta">
            <span>{who}</span>{#if !announcements && t.discussion_subentry_count}<span class="dot-sep">{t.discussion_subentry_count} replies</span>{#if t.unread_count}<span class="dot-sep">{t.unread_count} new</span>{/if}{/if}
          </span>
          <span class="meta clamp faint">{plain(t.message, 260)}</span>
        </span>
        <span class="end">{ago(announcements ? t.posted_at : (t.last_reply_at ?? t.posted_at))}</span>
      </a>
    {:else}
      <p class="empty">Nothing here yet.</p>
    {/each}
  </div>
</State>
