<script lang="ts">
  import { query } from "../lib/api.svelte";
  import { INBOX } from "../lib/paths";
  import { ago } from "../lib/format";
  import { initials } from "../lib/icons";
  import { openExternal } from "../lib/links";
  import Top from "../components/Top.svelte";
  import State from "../components/State.svelte";
  import Icon from "../components/Icon.svelte";
  import type { Conversation } from "../lib/types";

  const list = query<Conversation[]>(() => INBOX, 60);
</script>

<Top crumbs={[{ icon: "inbox", label: "Inbox" }]}>
  <button onclick={() => openExternal("https://q.utoronto.ca/conversations#compose=true")}><Icon name="compose" size={15} />New message</button>
</Top>

<div class="page">
  <h1 class="title">Inbox</h1>
  <State q={list} rows={8}>
    <div class="list boxed" style="margin-top:16px">
      {#each list.data ?? [] as c (c.id)}
        <a class="item top" class:unread={c.workflow_state === "unread"} href="#/inbox/{c.id}">
          <span class="avatar">{initials(c.participants[0]?.name ?? "?")}</span>
          <span class="main">
            <span class="t ellipsis">{c.subject || "(no subject)"}</span>
            <span class="meta ellipsis">{c.participants.map((p) => p.name).join(", ")}{c.context_name ? ` · ${c.context_name}` : ""}</span>
            <span class="meta clamp faint">{c.last_message}</span>
          </span>
          <span class="end">{ago(c.last_message_at)}</span>
        </a>
      {:else}
        <p class="empty">No messages.</p>
      {/each}
    </div>
  </State>
</div>
